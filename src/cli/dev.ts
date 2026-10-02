import { createRequire } from "module";

const require = createRequire(import.meta.url);

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import type { MrmdConfig } from "../types.js";
import { logger } from "./logger.js";
import { getOriginalCwd, parseCliArgs } from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface BunServer {
	port: number;
	stop: () => void;
	publish: (topic: string, data: string) => void;
	requestIP: (req: Request) => { address: string } | null;
	upgrade: (req: Request) => boolean;
}

declare const Bun: {
	serve: (options: unknown) => BunServer;
	file: (path: string) => Blob & { text: () => Promise<string> };
	build: (options: unknown) => Promise<{ outputs: Blob[] }>;
};

export interface DevApp {
	port: number;
	basePort: number;
	maxPort: number;
	fetchHandler: (
		req: Request,
		srv?: BunServer,
	) => Promise<Response | undefined>;
	rebuild: (publishReload?: boolean) => Promise<void>;
	close: () => void;
	readonly isDirectory: boolean;
	readonly singleFileSlug: string;
	contentBase: string;
	outDir: string;
	cliOpts: ReturnType<typeof parseCliArgs>;
	setServer: (srv: BunServer) => void;
	getServer: () => BunServer | undefined;
	wsHandler: {
		message: () => void;
		open: (ws: { subscribe: (topic: string) => void }) => void;
	};
}

export async function createDevApp(args: string[]): Promise<DevApp> {
	const { initHighlighter } = require("../renderer/markdown/math.js");
	await initHighlighter();
	process.env.NODE_ENV = "development";
	const cliOpts = parseCliArgs(args);
	const target = cliOpts.target;

	if (!target) {
		logger.error("Usage: mr-md dev <file-or-directory> [options]");
		process.exit(1);
	}

	let isDirectory = false;
	let filePath = "";
	let targetPath = path.resolve(getOriginalCwd(), target);
	if (!fs.existsSync(targetPath)) {
		logger.error(`File or directory not found: ${target}`);
		process.exit(1);
	}

	if (fs.statSync(targetPath).isDirectory()) {
		isDirectory = true;
		try {
			const { generateChapterContent } = require("./chapter.js");
			generateChapterContent(targetPath, { allowEmpty: true });
		} catch (err: unknown) {
			logger.error(err instanceof Error ? err.message : String(err));
			process.exit(1);
		}
	} else {
		filePath = targetPath;
		if (!filePath.endsWith(".md")) {
			logger.error(`Not a markdown file: ${target}`);
			process.exit(1);
		}
	}

	let contentBase = isDirectory ? targetPath : path.dirname(filePath);
	let outDir = cliOpts.outDir
		? path.resolve(getOriginalCwd(), cliOpts.outDir)
		: path.resolve(contentBase, "out");

	const displayPath =
		path.relative(process.cwd(), targetPath) || path.basename(targetPath);
	logger.dev(`Preparing dev server for: ${displayPath}`);

	let server: BunServer | undefined;
	let singleFileSlug = "";
	let previousFileSlug = "";
	let currentLessonFrontmatter: Record<string, unknown> = {};
	let currentLessonOutline: Array<{
		id: string;
		label: string;
		kind: string;
		level?: number;
	}> = [];

	const rebuild = async (publishReload = true) => {
		logger.startSpinner("Rebuilding...");
		try {
			const {
				parseChapter,
				parseLesson,
				buildChapter,
				buildLesson,
			} = require("../parser/mdx.js");
			const {
				preloadLanguagesFromMarkdown,
			} = require("../renderer/markdown/index.js");

			if (isDirectory) {
				const { generateChapterContent } = require("./chapter.js");
				const { ensureConfig, configToBuildOptions } = require("../config.js");
				const config = ensureConfig(targetPath);
				const configOpts = {
					...configToBuildOptions(config),
					...(cliOpts.theme ? { theme: cliOpts.theme } : {}),
					...(cliOpts.palette ? { palette: cliOpts.palette } : {}),
				};
				const chapterContent = generateChapterContent(targetPath, {
					allowEmpty: true,
				});
				await preloadLanguagesFromMarkdown(chapterContent);
				const chapter = parseChapter(
					chapterContent,
					{ outDir, contentBase, ...configOpts },
					contentBase,
				);
				buildChapter(chapter, { outDir, contentBase, ...configOpts });
			} else {
				const content = fs.readFileSync(filePath, "utf-8");
				await preloadLanguagesFromMarkdown(content);
				const {
					getEffectiveConfig,
					configToBuildOptions,
				} = require("../config.js");
				const config = getEffectiveConfig(contentBase, path.basename(filePath));
				const configOpts = {
					...configToBuildOptions(config),
					...(cliOpts.theme ? { theme: cliOpts.theme } : {}),
					...(cliOpts.palette ? { palette: cliOpts.palette } : {}),
				};
				const parsed = require("@11ty/gray-matter")(content);
				currentLessonFrontmatter = parsed.data || {};
				const isChapter =
					parsed.data.chapter === true || parsed.data.type === "chapter";

				if (isChapter) {
					const chapter = parseChapter(
						content,
						{ outDir, contentBase, ...configOpts },
						contentBase,
					);
					buildChapter(chapter, { outDir, contentBase, ...configOpts });
				} else {
					const lesson = parseLesson(
						content,
						{ outDir, contentBase, ...configOpts },
						contentBase,
						undefined,
						path.basename(filePath),
					);
					const newSlug = lesson.meta.slug;
					if (previousFileSlug && previousFileSlug !== newSlug) {
						const staleFile = path.join(outDir, `${previousFileSlug}.html`);
						if (fs.existsSync(staleFile)) fs.unlinkSync(staleFile);
					}
					singleFileSlug = newSlug;
					buildLesson(lesson, { outDir, contentBase, ...configOpts });

					const outline: Array<{
						id: string;
						label: string;
						kind: string;
						level?: number;
					}> = [];
					lesson.blocks.forEach(
						(
							block: {
								type: string;
								src?: string;
								label?: string;
								caption?: string;
							},
							idx: number,
						) => {
							if (block.type === "markdown" && block.src) {
								const { mdToHtml } = require("../renderer/markdown/index.js");
								const { headings } = mdToHtml(block.src, configOpts);
								for (const h of headings) {
									outline.push({
										id: h.id,
										label: h.text,
										kind: "heading",
										level: h.level,
									});
								}
							} else if (block.type === "simulation") {
								outline.push({
									id: `sim-${idx}`,
									label: block.label || "Interactive Lab",
									kind: "simulation",
								});
							} else if (block.type === "quiz") {
								outline.push({
									id: `quiz-${idx}`,
									label: block.caption || "Quiz",
									kind: "quiz",
								});
							}
						},
					);
					currentLessonOutline = outline;

					const { discoverMarkdownFiles } = require("../config.js");
					const allMd = discoverMarkdownFiles(contentBase);
					for (const otherFile of allMd) {
						if (otherFile === path.basename(filePath)) continue;
						try {
							const otherPath = path.join(contentBase, otherFile);
							const otherContent = fs.readFileSync(otherPath, "utf-8");
							const otherLesson = parseLesson(
								otherContent,
								{ outDir, contentBase, ...configOpts },
								contentBase,
								undefined,
								otherFile,
							);
							buildLesson(otherLesson, { outDir, contentBase, ...configOpts });
						} catch (_) {}
					}
				}
			}
			logger.succeedSpinner(
				`Build successful for ${path.relative(process.cwd(), targetPath) || path.basename(targetPath)}.`,
			);
			if (publishReload) {
				if (previousFileSlug && previousFileSlug !== singleFileSlug) {
					server?.publish("livereload", `redirect:/${singleFileSlug}.html`);
				} else {
					server?.publish("livereload", "reload");
				}
			}
			previousFileSlug = singleFileSlug;
		} catch (err: unknown) {
			logger.failSpinner(`Build failed`);
			const msg = err instanceof Error ? err.message : String(err);
			logger.error(msg);
			if (publishReload) {
				server?.publish("livereload", `error:${msg}`);
			}
		}
	};

	await rebuild();

	let timeout: NodeJS.Timeout;
	let isInternalConfigSave = false;
	let isInternalFileSave = false;
	let watchNormalizedOutDir = path.resolve(outDir);
	const watchHandler = (_eventType: string, filename: string | null) => {
		if (!filename) return;
		if (isInternalConfigSave || isInternalFileSave) return;
		if (filename.includes(".git") || filename.includes("node_modules")) return;

		const relOut = path.relative(contentBase, outDir);
		if (relOut && !relOut.startsWith("..") && !path.isAbsolute(relOut)) {
			if (
				filename === relOut ||
				filename.startsWith(`${relOut}/`) ||
				filename.startsWith(relOut + path.sep)
			) {
				return;
			}
		}

		const fullPath = path.resolve(contentBase, filename);
		const realFullPath = (() => {
			try {
				return fs.realpathSync(fullPath);
			} catch {
				return fullPath;
			}
		})();
		const realOutDir = (() => {
			try {
				return fs.realpathSync(watchNormalizedOutDir);
			} catch {
				return watchNormalizedOutDir;
			}
		})();

		if (
			realFullPath === realOutDir ||
			realFullPath.startsWith(realOutDir + path.sep) ||
			fullPath === watchNormalizedOutDir ||
			fullPath.startsWith(watchNormalizedOutDir + path.sep)
		) {
			return;
		}

		if (!isDirectory) {
			const isMd = /\.md$/i.test(filename);
			const isConfig =
				filename === "mrmd.config.json" ||
				filename.endsWith("mrmd.config.json");
			const isAsset = /\.(js|ts|json|png|jpg|jpeg|gif|svg|webp|ico|css)$/i.test(
				filename,
			);
			if (!isMd && !isConfig && !isAsset) return;
		}

		const isConfig =
			filename === "mrmd.config.json" || filename.endsWith("mrmd.config.json");

		if (isConfig) {
			clearTimeout(timeout);
			timeout = setTimeout(() => {
				logger.watch(`External config change detected: ${filename}`);
				rebuild(true);
			}, 200);
			return;
		}

		if (
			!/\.(md|mdx|js|ts|jsx|tsx|json|css|png|jpg|jpeg|gif|svg|webp|ico)$/i.test(
				filename,
			)
		) {
			return;
		}

		clearTimeout(timeout);
		timeout = setTimeout(() => {
			logger.watch(`File changed: ${filename}`);
			rebuild();
		}, 200);
	};
	let watcher = fs.watch(contentBase, { recursive: true }, watchHandler);
	logger.watch(
		`Watching ${path.relative(process.cwd(), contentBase) || path.basename(contentBase)} for changes...`,
	);

	const basePort =
		cliOpts.port || (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);
	const port = basePort;
	const maxPort = basePort + 10;

	const fetchHandler = async (req: Request, srv?: BunServer) => {
		if (srv && !server) {
			server = srv;
		}
		const start = Date.now();
		const clientIp = srv?.requestIP
			? srv.requestIP(req)?.address || "::1"
			: "::1";
		const url = new URL(req.url);
		const method = req.method;
		const decodedPath = decodeURIComponent(url.pathname);

		const isUpgrade =
			srv?.upgrade && req.headers.get("upgrade")?.toLowerCase() === "websocket"
				? srv.upgrade(req)
				: false;
		if (isUpgrade) return undefined;

		const handle = async () => {
			// ── Studio GUI Routes ──
			if (
				cliOpts.noStudio &&
				(decodedPath.startsWith("/__studio") ||
					decodedPath === "/___mrmd-studio")
			) {
				return new Response("Studio disabled", { status: 404 });
			}

			if (
				decodedPath === "/__studio" ||
				decodedPath === "/__studio/" ||
				decodedPath === "/___mrmd-studio"
			) {
				let studioHtmlPath = path.resolve(__dirname, "../studio/index.html");
				if (!fs.existsSync(studioHtmlPath)) {
					studioHtmlPath = path.resolve(
						__dirname,
						"../../src/studio/index.html",
					);
				}
				if (fs.existsSync(studioHtmlPath)) {
					const file = Bun.file(studioHtmlPath);
					return new Response(file, {
						headers: { "Content-Type": "text/html; charset=utf-8" },
					});
				}
				return new Response("Studio not found", { status: 404 });
			}

			if (decodedPath === "/__studio/studio.bundle.js") {
				let studioTsPath = path.resolve(__dirname, "../studio/studio.ts");
				if (!fs.existsSync(studioTsPath)) {
					studioTsPath = path.resolve(__dirname, "../../src/studio/studio.ts");
				}
				if (fs.existsSync(studioTsPath)) {
					try {
						const buildResult = await Bun.build({
							entrypoints: [studioTsPath],
							minify: false,
						});
						if (buildResult.outputs[0]) {
							return new Response(buildResult.outputs[0], {
								headers: {
									"Content-Type": "application/javascript; charset=utf-8",
									"Cache-Control": "no-cache",
								},
							});
						}
					} catch (e) {
						logger.warn(`Failed to bundle studio.ts on the fly: ${e}`);
					}
				}
			}

			if (decodedPath.startsWith("/__studio/")) {
				const assetName = decodedPath.slice("/__studio/".length);
				let assetPath = path.resolve(__dirname, "../studio", assetName);
				if (!fs.existsSync(assetPath)) {
					assetPath = path.resolve(__dirname, "../../dist/studio", assetName);
				}
				if (!fs.existsSync(assetPath)) {
					assetPath = path.resolve(__dirname, "../../src/studio", assetName);
				}
				if (fs.existsSync(assetPath)) {
					const contentType = assetName.endsWith(".css")
						? "text/css; charset=utf-8"
						: assetName.endsWith(".js")
							? "application/javascript; charset=utf-8"
							: "application/octet-stream";
					return new Response(Bun.file(assetPath), {
						headers: {
							"Content-Type": contentType,
							"Cache-Control": "no-cache",
						},
					});
				}
			}

			// ── Studio REST API ──
			if (decodedPath === "/__api/context" && method === "GET") {
				const {
					loadConfig,
					getEffectiveConfig,
					discoverMarkdownFiles,
					getLessonFile,
				} = require("../config.js");
				const existing = loadConfig(contentBase);
				const config =
					existing ||
					getEffectiveConfig(
						contentBase,
						isDirectory ? undefined : path.basename(filePath),
					);
				const all = discoverMarkdownFiles(contentBase);
				const configuredFiles = new Set(
					(config.lessons ?? []).map((e: string | { file: string }) =>
						getLessonFile(e),
					),
				);
				const unassigned = isDirectory
					? all.filter((f: string) => !configuredFiles.has(f))
					: [];

				return Response.json({
					mode: isDirectory ? "course" : "single",
					targetFile: isDirectory ? null : path.basename(filePath),
					targetPath,
					slug: singleFileSlug,
					title: isDirectory
						? config.title || path.basename(targetPath)
						: (currentLessonFrontmatter.title as string) || singleFileSlug,
					frontmatter: currentLessonFrontmatter,
					outline: currentLessonOutline,
					config,
					hasDiskConfig: Boolean(existing),
					allFiles: all,
					unassignedFiles: unassigned,
				});
			}

			if (decodedPath === "/__api/lesson/frontmatter" && method === "GET") {
				const reqUrl = new URL(req.url);
				const reqFile = reqUrl.searchParams.get("file");
				const targetFile = reqFile
					? path.resolve(contentBase, reqFile)
					: filePath;
				if (!targetFile || !fs.existsSync(targetFile)) {
					return Response.json(
						{ error: "Lesson file not found" },
						{ status: 404 },
					);
				}
				try {
					const matter = require("@11ty/gray-matter");
					const rawContent = fs.readFileSync(targetFile, "utf-8");
					const parsed = matter(rawContent);
					return Response.json({
						file: path.relative(contentBase, targetFile),
						frontmatter: parsed.data || {},
					});
				} catch (err: unknown) {
					return Response.json(
						{ error: err instanceof Error ? err.message : String(err) },
						{ status: 500 },
					);
				}
			}

			if (decodedPath === "/__api/lesson/frontmatter" && method === "POST") {
				try {
					const body = await req.json();
					const targetFile = body.file
						? path.resolve(contentBase, body.file)
						: filePath;
					if (!targetFile || !fs.existsSync(targetFile)) {
						return Response.json(
							{ error: "Lesson file not found to update" },
							{ status: 404 },
						);
					}

					const matter = require("@11ty/gray-matter");
					const rawContent = fs.readFileSync(targetFile, "utf-8");
					const parsed = matter(rawContent);

					if (body.title !== undefined) parsed.data.title = body.title;
					if (body.description !== undefined)
						parsed.data.description = body.description;
					if (body.author !== undefined) parsed.data.author = body.author;
					if (body.tags !== undefined) {
						parsed.data.tags = Array.isArray(body.tags)
							? body.tags
							: String(body.tags)
									.split(",")
									.map((t: string) => t.trim())
									.filter(Boolean);
					}

					const newContent = matter.stringify(parsed.content, parsed.data);
					isInternalFileSave = true;
					fs.writeFileSync(targetFile, newContent, "utf-8");
					setTimeout(() => {
						isInternalFileSave = false;
					}, 500);

					await rebuild();
					return Response.json({
						success: true,
						file: path.relative(contentBase, targetFile),
						frontmatter: parsed.data,
					});
				} catch (err: unknown) {
					return Response.json(
						{ error: err instanceof Error ? err.message : String(err) },
						{ status: 500 },
					);
				}
			}

			if (decodedPath === "/__api/config" && method === "GET") {
				const {
					loadConfig,
					getEffectiveConfig,
					discoverMarkdownFiles,
					getLessonFile,
				} = require("../config.js");
				const existing = loadConfig(contentBase);
				const config =
					existing ||
					getEffectiveConfig(
						contentBase,
						isDirectory ? undefined : path.basename(filePath),
					);
				const all = discoverMarkdownFiles(contentBase);
				const configuredFiles = new Set(
					(config.lessons ?? []).map((e: string | { file: string }) =>
						getLessonFile(e),
					),
				);
				const unassigned = isDirectory
					? all.filter((f: string) => !configuredFiles.has(f))
					: [];
				return Response.json({
					config,
					allFiles: all,
					unassignedFiles: unassigned,
					mode: isDirectory ? "course" : "single",
					targetFile: isDirectory ? undefined : path.basename(filePath),
				});
			}

			if (decodedPath === "/__api/config" && method === "POST") {
				const {
					loadConfig,
					saveConfig,
					MrmdConfigSchema,
				} = require("../config.js");
				try {
					const body = await req.json();
					const result = MrmdConfigSchema.safeParse(body);
					if (!result.success) {
						return Response.json(
							{ error: result.error.message },
							{ status: 400 },
						);
					}
					const existing = loadConfig(contentBase);
					isInternalConfigSave = true;
					saveConfig(contentBase, result.data);
					setTimeout(() => {
						isInternalConfigSave = false;
					}, 500);

					const appearanceChanged =
						existing?.theme !== result.data.theme ||
						existing?.palette !== result.data.palette ||
						existing?.ui !== result.data.ui ||
						JSON.stringify(existing?.customPalettes) !==
							JSON.stringify(result.data.customPalettes);

					const structureOrMetaChanged =
						JSON.stringify(existing?.lessons) !==
							JSON.stringify(result.data.lessons) ||
						existing?.title !== result.data.title ||
						existing?.description !== result.data.description ||
						existing?.author !== result.data.author;

					if (appearanceChanged && server) {
						try {
							const {
								generateCustomPaletteCSS,
							} = require("../renderer/templates/layout.js");
							const customCss = generateCustomPaletteCSS(
								result.data.customPalettes,
							);
							server.publish(
								"livereload",
								JSON.stringify({
									type: "appearance-update",
									theme: result.data.theme || "auto",
									palette: result.data.palette || "ink",
									ui: result.data.ui || "standard",
									customCss: customCss || "",
								}),
							);
						} catch (e) {
							logger.warn(`Failed to broadcast appearance update: ${e}`);
						}
					}

					if (structureOrMetaChanged) {
						await rebuild(true);
					} else if (appearanceChanged) {
						await rebuild(false);
					}
					return Response.json({ success: true });
				} catch (err: unknown) {
					return Response.json(
						{ error: err instanceof Error ? err.message : String(err) },
						{ status: 500 },
					);
				}
			}

			if (decodedPath === "/__api/lessons/new" && method === "POST") {
				const { ensureConfig, saveConfig } = require("../config.js");
				try {
					const { name } = await req.json();
					if (!name || typeof name !== "string") {
						return Response.json(
							{ error: "Lesson name required" },
							{ status: 400 },
						);
					}
					const safeName = name
						.toLowerCase()
						.replace(/[^a-z0-9-_]+/g, "-")
						.replace(/(^-|-$)/g, "");
					const fileName = `${safeName || "untitled"}.md`;
					const targetFilePath = path.resolve(contentBase, fileName);
					if (fs.existsSync(targetFilePath)) {
						return Response.json(
							{ error: `File already exists: ${fileName}` },
							{ status: 409 },
						);
					}
					const currentDate = new Date().toISOString().split("T")[0];
					const content = `---\ntitle: ${JSON.stringify(name)}\ndate: ${currentDate}\nauthor: ""\ntags: []\n---\n\nStart writing your lesson here.\n\n`;
					fs.writeFileSync(targetFilePath, content, "utf-8");

					if (isDirectory) {
						const config = ensureConfig(contentBase);
						config.lessons = [...(config.lessons ?? []), fileName];
						isInternalConfigSave = true;
						saveConfig(contentBase, config);
						setTimeout(() => {
							isInternalConfigSave = false;
						}, 500);
						await rebuild();
						return Response.json({
							success: true,
							file: fileName,
							mode: "course",
						});
					} else {
						// Single mode: build newly added lesson file immediately so it's ready for live viewport
						try {
							const { parseLesson, buildLesson } = require("../parser/mdx.js");
							const {
								preloadLanguagesFromMarkdown,
							} = require("../renderer/markdown/index.js");
							const {
								getEffectiveConfig,
								configToBuildOptions,
							} = require("../config.js");
							await preloadLanguagesFromMarkdown(content);
							const effConfig = getEffectiveConfig(contentBase, fileName);
							const configOpts = {
								...configToBuildOptions(effConfig),
								...(cliOpts.theme ? { theme: cliOpts.theme } : {}),
								...(cliOpts.palette ? { palette: cliOpts.palette } : {}),
							};
							const lesson = parseLesson(
								content,
								{ outDir, contentBase, ...configOpts },
								contentBase,
								undefined,
								fileName,
							);
							buildLesson(lesson, { outDir, contentBase, ...configOpts });
						} catch (e) {
							logger.warn(`Could not build new lesson: ${e}`);
						}

						return Response.json({
							success: true,
							file: fileName,
							mode: "single",
						});
					}
				} catch (err: unknown) {
					return Response.json(
						{ error: err instanceof Error ? err.message : String(err) },
						{ status: 500 },
					);
				}
			}

			if (decodedPath === "/__api/course/convert" && method === "POST") {
				const {
					loadConfig,
					saveConfig,
					discoverMarkdownFiles,
				} = require("../config.js");
				try {
					const body = await req.json().catch(() => ({}));
					const userCourseTitle =
						typeof body.courseName === "string" ? body.courseName.trim() : "";
					if (!userCourseTitle) {
						return Response.json(
							{ error: "Course name is required." },
							{ status: 400 },
						);
					}

					const cleanSlug = userCourseTitle
						.toLowerCase()
						.replace(/[^a-z0-9-_]+/g, "-")
						.replace(/(^-|-$)/g, "");

					if (!cleanSlug) {
						return Response.json(
							{
								error:
									"Please enter a valid course name containing letters or numbers.",
							},
							{ status: 400 },
						);
					}

					const reservedFolders = [
						"out",
						"dist",
						"build",
						"node_modules",
						".git",
						".gemini",
					];
					if (reservedFolders.includes(cleanSlug)) {
						return Response.json(
							{
								error: `"${cleanSlug}" is a reserved system directory name. Please choose a different course name.`,
							},
							{ status: 400 },
						);
					}

					const parentDir = contentBase;
					const courseFolderName = cleanSlug;
					const courseDirPath = path.resolve(parentDir, courseFolderName);

					if (fs.existsSync(courseDirPath)) {
						return Response.json(
							{
								error: `A folder named "${courseFolderName}" already exists. Please choose a different course name to avoid collisions.`,
							},
							{ status: 409 },
						);
					}

					fs.mkdirSync(courseDirPath, { recursive: true });

					const allMdFiles = discoverMarkdownFiles(parentDir);

					// 1. Move all markdown files and their sibling assets into the new course folder
					for (const mdFile of allMdFiles) {
						const srcFile = path.join(parentDir, mdFile);
						const dstFile = path.join(courseDirPath, mdFile);
						if (fs.existsSync(srcFile) && fs.statSync(srcFile).isFile()) {
							fs.renameSync(srcFile, dstFile);
						}

						const stem = path.basename(mdFile, ".md");
						try {
							const parentFiles = fs.readdirSync(parentDir);
							for (const sib of parentFiles) {
								if (sib === mdFile) continue;
								if (sib.startsWith(`${stem}.`) && !sib.endsWith(".md")) {
									const srcSib = path.join(parentDir, sib);
									const dstSib = path.join(courseDirPath, sib);
									if (
										fs.existsSync(srcSib) &&
										fs.statSync(srcSib).isFile() &&
										!fs.existsSync(dstSib)
									) {
										fs.renameSync(srcSib, dstSib);
									}
								}
							}
						} catch (_) {}
					}

					// 2. Clean up stale single-file outDir in parent folder if not custom outDir
					if (!cliOpts.outDir && fs.existsSync(outDir)) {
						try {
							for (const mdFile of allMdFiles) {
								const slug = path
									.basename(mdFile, ".md")
									.toLowerCase()
									.replace(/[^a-z0-9]+/g, "-");
								const staleHtml = path.join(outDir, `${slug}.html`);
								if (fs.existsSync(staleHtml)) fs.unlinkSync(staleHtml);
							}
							const remaining = fs.readdirSync(outDir);
							if (remaining.length === 0) {
								fs.rmdirSync(outDir);
							}
						} catch (_) {}
					}

					// 3. Generate mrmd.config.json in the course directory, inheriting appearance if parent had config
					const existingParentConfig = loadConfig(parentDir);
					const formattedTitle = userCourseTitle || "Course";
					const config: MrmdConfig = {
						title: formattedTitle,
						lessons: allMdFiles,
						...(existingParentConfig?.theme
							? { theme: existingParentConfig.theme }
							: {}),
						...(existingParentConfig?.palette
							? { palette: existingParentConfig.palette }
							: {}),
						...(existingParentConfig?.ui
							? { ui: existingParentConfig.ui }
							: {}),
						...(existingParentConfig?.font
							? { font: existingParentConfig.font }
							: {}),
						...(existingParentConfig?.customPalettes
							? { customPalettes: existingParentConfig.customPalettes }
							: {}),
					};

					isInternalConfigSave = true;
					saveConfig(courseDirPath, config);
					setTimeout(() => {
						isInternalConfigSave = false;
					}, 500);

					// Clean up orphaned config in parentDir so parent isn't left referencing moved files
					const parentConfigPath = path.join(parentDir, "mrmd.config.json");
					if (fs.existsSync(parentConfigPath)) {
						try {
							fs.unlinkSync(parentConfigPath);
						} catch (_) {}
					}

					// 4. Switch dev server state to target the new course folder
					watcher.close();

					contentBase = courseDirPath;
					targetPath = courseDirPath;
					isDirectory = true;
					filePath = "";
					outDir = cliOpts.outDir
						? path.resolve(getOriginalCwd(), cliOpts.outDir)
						: path.resolve(courseDirPath, "out");
					watchNormalizedOutDir = path.resolve(outDir);

					watcher = fs.watch(contentBase, { recursive: true }, watchHandler);

					logger.info(
						`Promoted single lesson to course in: ${courseFolderName}`,
					);
					logger.watch(
						`Watching ${path.relative(process.cwd(), contentBase) || path.basename(contentBase)} for changes...`,
					);

					await rebuild(true);
					return Response.json({
						success: true,
						mode: "course",
						courseDir: courseFolderName,
						courseFolder: courseFolderName,
					});
				} catch (err: unknown) {
					return Response.json(
						{ error: err instanceof Error ? err.message : String(err) },
						{ status: 500 },
					);
				}
			}

			if (
				!isDirectory &&
				(decodedPath === "/" || decodedPath === "/index.html") &&
				singleFileSlug
			) {
				return new Response(null, {
					status: 302,
					headers: { Location: `/${singleFileSlug}.html` },
				});
			}

			let outFilePath = path.resolve(outDir, `.${decodedPath}`);

			if (decodedPath.endsWith("/")) {
				outFilePath = path.join(outDir, "index.html");
			} else if (
				!fs.existsSync(outFilePath) &&
				fs.existsSync(`${outFilePath}.html`)
			) {
				outFilePath += ".html";
			} else if (!fs.existsSync(outFilePath)) {
				const base = path.basename(outFilePath, ".html");
				const slugBase = base
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, "-")
					.replace(/(^-|-$)/g, "");
				const candidate = path.join(
					path.dirname(outFilePath),
					`${slugBase}.html`,
				);
				if (fs.existsSync(candidate)) {
					outFilePath = candidate;
				}
			}

			const normalizedOutDir = outDir.endsWith(path.sep)
				? outDir
				: outDir + path.sep;
			if (!outFilePath.startsWith(normalizedOutDir) && outFilePath !== outDir) {
				return new Response("Forbidden", { status: 403 });
			}

			if (fs.existsSync(outFilePath) && fs.statSync(outFilePath).isFile()) {
				if (outFilePath.endsWith(".html")) {
					const file = Bun.file(outFilePath);
					let text = await file.text();

					const script = `<script>
						let ws;
						let reconnectTimer;
						function connectLiveReload() {
							try {
								if (ws) {
									try { ws.close(); } catch (_) {}
								}
								const protocol = location.protocol === "https:" ? "wss:" : "ws:";
								ws = new WebSocket(\`\${protocol}//\${location.host}/\`);
								ws.onmessage = async (e) => { 
									if (typeof e.data === "string" && e.data.startsWith("{")) {
										try {
											const data = JSON.parse(e.data);
											if (data.type === "appearance-update") {
												const root = document.documentElement;
												const shell = document.querySelector(".bk-shell");

												if (data.theme) {
													let resolved = data.theme;
													if (resolved === "auto") {
														resolved = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
													}
													root.setAttribute("data-theme", resolved);
													if (shell) shell.setAttribute("data-theme", resolved);
													localStorage.setItem("bk-theme", data.theme);
												}

												if (data.palette) {
													const p = data.palette === "green" ? "field" : data.palette;
													root.setAttribute("data-palette", p);
													if (shell) shell.setAttribute("data-palette", p);
													localStorage.setItem("bk-palette", p);
												}

												if (data.ui) {
													root.setAttribute("data-ui", data.ui);
													if (shell) shell.setAttribute("data-ui", data.ui);
													localStorage.setItem("bk-ui", data.ui);
												}

												if (data.customCss !== undefined) {
													let customStyle = document.getElementById("mrmd-custom-palettes-live");
													if (!customStyle) {
														customStyle = document.createElement("style");
														customStyle.id = "mrmd-custom-palettes-live";
														document.head.appendChild(customStyle);
													}
													customStyle.textContent = data.customCss;
												}

												if (window.bkBroadcastTheme) window.bkBroadcastTheme();
												return;
											}
										} catch (err) {}
									}
									if (typeof e.data === "string" && e.data.startsWith("redirect:")) {
										window.location.href = e.data.slice(9);
									} else if (e.data === "reload") {
										try {
											const fetchUrl = new URL(location.href);
											fetchUrl.searchParams.set("__bk_t", Date.now().toString());
											const res = await fetch(fetchUrl.toString(), { cache: "no-store" });
											const text = await res.text();
											const parser = new DOMParser();
											const doc = parser.parseFromString(text, "text/html");

											const newMain = doc.querySelector(".bk-main");
											const newNav = doc.querySelector(".bk-nav");
											const newHeader = doc.querySelector(".bk-sidebar-header");

											if (newMain && newNav && newHeader) {
												// Synchronize root and shell attributes (theme, palette, ui), respecting user's localStorage
												const t = localStorage.getItem("bk-theme");
												const p = localStorage.getItem("bk-palette");
												const u = localStorage.getItem("bk-ui");

												const newTheme = doc.documentElement.getAttribute("data-theme");
												const newPalette = doc.documentElement.getAttribute("data-palette");
												const newUi = doc.documentElement.getAttribute("data-ui");

												const targetTheme = t || newTheme;
												if (targetTheme) {
													let resolved = targetTheme;
													if (resolved === "auto") {
														resolved = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
													}
													document.documentElement.setAttribute("data-theme", resolved);
												}

												const targetPalette = p || newPalette;
												if (targetPalette) {
													const pal = targetPalette === "green" ? "field" : targetPalette;
													document.documentElement.setAttribute("data-palette", pal);
												}

												const targetUi = u || newUi;
												if (targetUi) {
													document.documentElement.setAttribute("data-ui", targetUi);
												}

												const shell = document.querySelector(".bk-shell");
												const newShell = doc.querySelector(".bk-shell");
												if (shell && newShell) {
													if (targetTheme) {
														let resolved = targetTheme;
														if (resolved === "auto") {
															resolved = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
														}
														shell.setAttribute("data-theme", resolved);
													}
													if (targetPalette) {
														const pal = targetPalette === "green" ? "field" : targetPalette;
														shell.setAttribute("data-palette", pal);
													}
													if (targetUi) shell.setAttribute("data-ui", targetUi);
												}

												const mainEl = document.querySelector(".bk-main");
												const navEl = document.querySelector(".bk-nav");
												
												const mainScroll = mainEl ? mainEl.scrollTop : 0;
												const navScroll = navEl ? navEl.scrollTop : 0;
												const winScrollY = window.scrollY;
												const winScrollX = window.scrollX;
												
												if (mainEl) mainEl.innerHTML = newMain.innerHTML;
												if (navEl) navEl.innerHTML = newNav.innerHTML;
												
												const headerEl = document.querySelector(".bk-sidebar-header");
												if (headerEl) headerEl.innerHTML = newHeader.innerHTML;
												
												document.title = doc.title;

												if (mainEl) mainEl.scrollTop = mainScroll;
												if (navEl) navEl.scrollTop = navScroll;
												window.scrollTo(winScrollX, winScrollY);

												const existingStyles = Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'));
												const newStyles = Array.from(doc.head.querySelectorAll('link[rel="stylesheet"], style'));
												
												newStyles.forEach(s => {
													if (s.tagName === 'LINK') {
														const href = new URL(s.href, location.href);
														if (href.origin === location.origin) {
															href.searchParams.set('t', Date.now());
															s.href = href.toString();
														}
													}
													document.head.appendChild(s);
												});

												setTimeout(() => {
													existingStyles.forEach((s) => {
														if (s.id !== "mrmd-custom-palettes-live") {
															s.remove();
														}
													});
												}, 50);

												const overlay = document.getElementById("bk-dev-error");
												if (overlay) overlay.remove();

												window.dispatchEvent(new Event("bk-page-loaded"));
												if (window.bkBroadcastTheme) window.bkBroadcastTheme();
												if (window.parent && window.parent !== window) {
													window.parent.postMessage({ type: "bk-page-reloaded", url: location.href }, "*");
												}
											} else {
												location.reload();
											}
										} catch (err) {
											console.error("Live reload failed:", err);
											location.reload();
										}
									} else if (e.data.startsWith("error:")) {
										const msg = e.data.slice(6);
										console.error("Build Error:", msg);
										let overlay = document.getElementById("bk-dev-error");
										if (!overlay) {
											overlay = document.createElement("div");
											overlay.id = "bk-dev-error";
											overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);color:#ff5555;padding:2rem;z-index:99999;font-family:monospace;white-space:pre-wrap;overflow:auto;backdrop-filter:blur(4px);";
											document.body.appendChild(overlay);
										}
										overlay.textContent = "Build Error\\n\\n" + msg;
									}
								};
								ws.onclose = () => {
									clearTimeout(reconnectTimer);
									reconnectTimer = setTimeout(connectLiveReload, 1000);
								};
								ws.onerror = () => {
									try { ws.close(); } catch (_) {}
								};
							} catch (e) {
								clearTimeout(reconnectTimer);
								reconnectTimer = setTimeout(connectLiveReload, 2000);
							}
						}
						connectLiveReload();
					</script>`;

					const lastBodyIndex = text.toLowerCase().lastIndexOf("</body>");
					if (lastBodyIndex !== -1) {
						text =
							text.slice(0, lastBodyIndex) + script + text.slice(lastBodyIndex);
					} else {
						text += script;
					}
					return new Response(text, {
						headers: {
							"Content-Type": "text/html; charset=utf-8",
							"Cache-Control": "no-cache, no-store, must-revalidate",
						},
					});
				}
				return new Response(Bun.file(outFilePath));
			}

			return new Response("Not found", { status: 404 });
		};

		const res = await handle();
		if (res) {
			logger.http(
				clientIp,
				method,
				decodedPath,
				res.status,
				Date.now() - start,
			);
			return res;
		}
	};

	const wsHandler = {
		message() {},
		open(ws: { subscribe: (topic: string) => void }) {
			ws.subscribe("livereload");
		},
	};

	return {
		port,
		basePort,
		maxPort,
		fetchHandler,
		rebuild,
		close: () => {
			server?.stop();
			watcher.close();
			clearTimeout(timeout);
		},
		get isDirectory() {
			return isDirectory;
		},
		get singleFileSlug() {
			return singleFileSlug;
		},
		get contentBase() {
			return contentBase;
		},
		get outDir() {
			return outDir;
		},
		cliOpts,
		setServer: (srv: BunServer) => {
			server = srv;
		},
		getServer: () => server,
		wsHandler,
	};
}

export async function runDev(args: string[]) {
	const app = await createDevApp(args);
	let server: BunServer | undefined;
	let port = app.port;
	const basePort = app.basePort;
	const maxPort = app.maxPort;
	const cliOpts = app.cliOpts;

	let shuttingDown = false;
	process.on("SIGINT", () => {
		if (shuttingDown) return; // Ignore any extra Ctrl+C or duplicate signals
		shuttingDown = true;

		console.log(); // Add a newline so it doesn't print on the same line as ^C
		logger.info("Gracefully shutting down. Please wait...");

		process.once("exit", (code) => {
			if (code === 0) {
				if (server) {
					logger.info(`Shutdown complete. Port ${server.port} is now free.`);
				} else {
					logger.info("Shutdown complete.");
				}
			}
		});

		if (server) {
			server.stop();
		}
		app.close();
		setTimeout(() => process.exit(0), 3000).unref();
	});

	while (port <= maxPort) {
		try {
			server = Bun.serve({
				port,
				fetch: app.fetchHandler,
				websocket: app.wsHandler,
			});
			app.setServer(server);
			const urlSuffix =
				!app.isDirectory && app.singleFileSlug
					? `/${app.singleFileSlug}.html`
					: "/";
			const localUrl = `http://localhost:${server.port}${urlSuffix}`;

			const interfaces = os.networkInterfaces();
			let networkUrl: string | null = null;
			for (const name of Object.keys(interfaces)) {
				for (const iface of interfaces[name] || []) {
					if (iface.family === "IPv4" && !iface.internal) {
						networkUrl = `http://${iface.address}:${server.port}${urlSuffix}`;
						break;
					}
				}
				if (networkUrl) break;
			}

			const studioUrl = `http://localhost:${server.port}/__studio`;
			const webpageUrl = networkUrl || localUrl;
			if (!cliOpts.noStudio) {
				logger.serveBox(
					studioUrl,
					webpageUrl,
					Boolean(networkUrl),
					basePort,
					port,
				);
			} else {
				logger.info(`Dev server running at: ${webpageUrl}`);
			}
			break;
		} catch (err: unknown) {
			if (
				err instanceof Error &&
				(err as Error & { code?: string }).code === "EADDRINUSE"
			) {
				logger.warn(`Port ${port} is in use, trying ${port + 1}...`);
				port++;
			} else {
				throw err;
			}
		}
	}

	if (!server) {
		logger.error(
			`Could not find an open port between ${basePort} and ${maxPort}.`,
		);
		process.exit(1);
	}
}
