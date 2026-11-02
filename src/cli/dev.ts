import { createRequire } from "module";

const require = createRequire(import.meta.url);

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { logger } from "./logger.js";
import { getOriginalCwd } from "./utils.js";

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
};

export async function runDev(args: string[]) {
	const { initHighlighter } = require("../renderer/markdown/math.js");
	await initHighlighter();
	process.env.NODE_ENV = "development";
	const target = args[0];

	if (!target) {
		logger.error("Usage: mr-md dev <file-or-directory>");
		process.exit(1);
	}

	let isDirectory = false;
	let filePath = "";
	const targetPath = path.resolve(getOriginalCwd(), target);
	if (!fs.existsSync(targetPath)) {
		logger.error(`File or directory not found: ${target}`);
		process.exit(1);
	}

	if (fs.statSync(targetPath).isDirectory()) {
		isDirectory = true;
		try {
			const { generateChapterContent } = require("./chapter.js");
			generateChapterContent(targetPath);
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

	const contentBase = isDirectory ? targetPath : path.dirname(filePath);
	const outDir = path.resolve(contentBase, "out");

	logger.dev(`Preparing dev server for: ${targetPath}`);

	let server: BunServer | undefined;
	let singleFileSlug = "";
	let previousFileSlug = "";

	const rebuild = async () => {
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
				const chapterContent = generateChapterContent(targetPath);
				await preloadLanguagesFromMarkdown(chapterContent);
				const chapter = parseChapter(
					chapterContent,
					{ outDir, contentBase },
					contentBase,
				);
				buildChapter(chapter, { outDir, contentBase });
			} else {
				const content = fs.readFileSync(filePath, "utf-8");
				await preloadLanguagesFromMarkdown(content);
				const parsed = require("@11ty/gray-matter")(content);
				const isChapter =
					parsed.data.chapter === true || parsed.data.type === "chapter";

				if (isChapter) {
					const chapter = parseChapter(
						content,
						{ outDir, contentBase },
						contentBase,
					);
					buildChapter(chapter, { outDir, contentBase });
				} else {
					const lesson = parseLesson(
						content,
						{ outDir, contentBase },
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
					buildLesson(lesson, { outDir, contentBase });
				}
			}
			logger.succeedSpinner(`Build successful for ${targetPath}.`);
			if (previousFileSlug && previousFileSlug !== singleFileSlug) {
				server?.publish("livereload", `redirect:/${singleFileSlug}.html`);
			} else {
				server?.publish("livereload", "reload");
			}
			previousFileSlug = singleFileSlug;
		} catch (err: unknown) {
			logger.failSpinner(`Build failed`);
			const msg = err instanceof Error ? err.message : String(err);
			logger.error(msg);
			server?.publish("livereload", `error:${msg}`);
		}
	};

	await rebuild();

	let timeout: NodeJS.Timeout;
	const watcher = fs.watch(
		contentBase,
		{ recursive: true },
		(_eventType, filename) => {
			if (
				!filename ||
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
		},
	);
	logger.watch(`Watching ${contentBase} for changes...`);

	const basePort = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
	let port = basePort;
	const maxPort = basePort + 10;

	const fetchHandler = async (req: Request, srv: BunServer) => {
		const start = Date.now();
		const clientIp = srv.requestIP(req)?.address || "::1";
		const url = new URL(req.url);
		const method = req.method;
		const decodedPath = decodeURIComponent(url.pathname);

		const isUpgrade = srv.upgrade(req);
		if (!isUpgrade) {
			logger.httpReq(clientIp, method, decodedPath);
		}

		const handle = async () => {
			if (isUpgrade) return null;

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
						const ws = new WebSocket(\`ws://\${location.host}/\`);
						ws.onmessage = async (e) => { 
							if (typeof e.data === "string" && e.data.startsWith("redirect:")) {
								window.location.href = e.data.slice(9);
							} else if (e.data === "reload") {
								try {
									const res = await fetch(location.href);
									const text = await res.text();
									const parser = new DOMParser();
									const doc = parser.parseFromString(text, "text/html");

									const newMain = doc.querySelector(".bk-main");
									const newNav = doc.querySelector(".bk-nav");
									const newHeader = doc.querySelector(".bk-sidebar-header");

									if (newMain && newNav && newHeader) {
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
											existingStyles.forEach(s => s.remove());
										}, 50);

										const overlay = document.getElementById("bk-dev-error");
										if (overlay) overlay.remove();

										window.dispatchEvent(new Event("bk-page-loaded"));
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
					</script>`;

					const lastBodyIndex = text.toLowerCase().lastIndexOf("</body>");
					if (lastBodyIndex !== -1) {
						text =
							text.slice(0, lastBodyIndex) + script + text.slice(lastBodyIndex);
					} else {
						text += script;
					}
					return new Response(text, {
						headers: { "Content-Type": "text/html" },
					});
				}
				return new Response(Bun.file(outFilePath));
			}

			return new Response("Not found", { status: 404 });
		};

		const res = await handle();
		if (res) {
			logger.httpRes(clientIp, res.status, Date.now() - start);
			return res;
		}
	};

	const wsHandler = {
		message() {},
		open(ws: { subscribe: (topic: string) => void }) {
			ws.subscribe("livereload");
		},
	};

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
		watcher.close();
		clearTimeout(timeout);
		setTimeout(() => process.exit(0), 3000).unref();
	});

	while (port <= maxPort) {
		try {
			server = Bun.serve({
				port,
				fetch: fetchHandler,
				websocket: wsHandler,
			});
			const urlSuffix =
				!isDirectory && singleFileSlug ? `/${singleFileSlug}.html` : "";
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

			logger.serveBox(localUrl, networkUrl, basePort, port);
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
