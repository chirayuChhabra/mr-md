import matter from "@11ty/gray-matter";
import * as fs from "fs";
import { marked, type Tokens } from "marked";
import * as path from "path";
import { z } from "zod";
import {
	extractYouTubeId,
	normalizeSimulationOptions,
} from "../builder/utils.js";
import { logger } from "../cli/logger.js";
import type {
	Block,
	BuildOptions,
	CalloutBlock,
	Chapter,
	ChapterMeta,
	ColumnItem,
	Lesson,
	LessonMeta,
} from "../types.js";

const LessonFrontmatterSchema = z
	.object({
		title: z.string().optional(),
		slug: z.string().optional(),
		description: z.string().optional(),
		tags: z.array(z.string()).optional(),
		author: z.string().optional(),
		status: z.enum(["read", "unread", "locked"]).optional(),
		parentSlug: z.string().optional(),
		prevSlug: z.string().optional(),
		prevTitle: z.string().optional(),
		nextSlug: z.string().optional(),
		nextTitle: z.string().optional(),
		contentBase: z.string().optional(),
		chapter: z.boolean().optional(),
		type: z.string().optional(),
	})
	.catchall(z.unknown());

// Helper to parse HTML attributes
function parseAttributes(attrString: string): Record<string, string> {
	const attrs: Record<string, string> = {};
	const regex = /([a-zA-Z0-9_-]+)(?:=(["'])(.*?)\2)?/gs;
	for (const match of attrString.matchAll(regex)) {
		const [, key, , value] = match;
		if (key) attrs[key] = value || "true";
	}
	return attrs;
}

const SUPPORTED_TAGS = ["columns"];

export function parseLesson(
	content: string,
	options: BuildOptions = {},
	callerDir: string = process.cwd(),
	defaultTitle?: string,
	filename?: string,
): Lesson {
	const parsed = matter(content);
	const validation = LessonFrontmatterSchema.safeParse(parsed.data);

	if (!validation.success) {
		logger.error(`Frontmatter Validation Error:`);
		validation.error.issues.forEach((err) => {
			logger.error(`- ${err.path.join(".")}: ${err.message}`);
		});
		throw new Error("Invalid Frontmatter in Lesson");
	}
	const data = validation.data;

	const tokens = marked.lexer(parsed.content);

	let h1Title = "";
	for (const token of tokens) {
		if (token.type === "heading" && token.depth === 1) {
			h1Title = token.text;
			break;
		}
	}

	const resolvedTitle =
		data.title || h1Title || defaultTitle || "Untitled Lesson";

	const baseSlug = filename ? path.basename(filename, ".md") : resolvedTitle;

	const meta: LessonMeta = {
		...data,
		title: resolvedTitle,
		slug:
			data.slug ||
			baseSlug
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/(^-|-$)/g, ""),
		contentBase: options.contentBase || callerDir,
	};

	const blocks: Block[] = [];

	let currentMarkdown = "";

	const flushMarkdown = () => {
		if (currentMarkdown.trim()) {
			blocks.push({ type: "markdown", src: currentMarkdown });
		}
		currentMarkdown = "";
	};

	let strippedTitle = false;
	for (const token of tokens) {
		if (
			token.type === "heading" &&
			token.depth === 1 &&
			!strippedTitle &&
			token.text === resolvedTitle
		) {
			strippedTitle = true;
			continue;
		}

		if (token.type === "paragraph") {
			const tokens = token.tokens || [];
			if (tokens.length === 1 && tokens[0].type === "image") {
				const img = tokens[0] as Tokens.Image;
				const src = img.href;
				const caption = img.text;

				flushMarkdown();

				// YouTube
				if (src.includes("youtube.com") || src.includes("youtu.be")) {
					blocks.push({
						type: "youtube",
						id: extractYouTubeId(src),
						caption,
					});
					continue;
				}

				const ext = path.extname(src).toLowerCase();

				// Simulation
				if (ext === ".ts" || ext === ".js") {
					let fileConfig = null;
					try {
						const resolved = path.resolve(
							options.contentBase || callerDir,
							src,
						);
						const configPath = `${ext.length > 0 ? resolved.slice(0, -ext.length) : resolved}.config.json`;
						if (fs.existsSync(configPath)) {
							fileConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
						}
					} catch (e: unknown) {
						logger.warn(
							`Failed to load simulation config for ${src}: ${e instanceof Error ? e.message : String(e)}`,
						);
					}

					const normalized = normalizeSimulationOptions(
						{ caption },
						420,
						fileConfig,
					);
					blocks.push({
						type: "simulation",
						src,
						dependencies: fileConfig?.dependencies,
						...normalized,
					});
					continue;
				}

				// Quiz
				if (ext === ".json" || src.endsWith(".quiz.md")) {
					blocks.push({ type: "quiz", src, caption });
					continue;
				}

				// Media (Video, Audio)
				if (
					[".mp4", ".webm", ".mov", ".mp3", ".wav", ".ogg", ".m4a"].includes(
						ext,
					)
				) {
					blocks.push({
						type: "media",
						src,
						kind: [".mp4", ".webm", ".mov"].includes(ext) ? "video" : "audio",
						caption,
					});
					continue;
				}

				// Standard Image
				blocks.push({
					type: "image",
					src,
					caption,
				});
				continue;
			}
		}

		if (token.type === "blockquote") {
			const text = token.text || "";
			const match = text.match(
				/^\[!(note|tip|important|warning|caution)\]\s*([\s\S]*)/i,
			);
			if (match) {
				flushMarkdown();
				blocks.push({
					type: match[1].toLowerCase() as CalloutBlock["type"],
					src: match[2],
				});
				continue;
			}
		}

		if (token.type === "html") {
			const trimmedText = token.text.trim();
			let isColumns = false;
			let innerContent = "";
			let attrs: Record<string, string> = {};

			// Check for <columns> tag
			const tagMatch =
				trimmedText.match(/^<([a-z]+)(?:\s+([^>]*))?>(.*?)<\/\1>$/is) ||
				trimmedText.match(/^<([a-z]+)\s*(.*?)\/?>$/i);

			// Check for <div class="columns">
			const divMatch = trimmedText.match(
				/^<div\s+([^>]*class=["'](?:[^"']*\s+)?columns(?:\s+[^"']*)?["'][^>]*)>(.*?)<\/div>$/is,
			);

			if (tagMatch && SUPPORTED_TAGS.includes(tagMatch[1].toLowerCase())) {
				const tag = tagMatch[1].toLowerCase();
				if (tag === "columns") {
					isColumns = true;
					attrs = parseAttributes(tagMatch[2] || "");
					innerContent = tagMatch[3] || "";
				}
			} else if (divMatch) {
				isColumns = true;
				attrs = parseAttributes(divMatch[1]);
				innerContent = divMatch[2] || "";
			}

			if (isColumns) {
				flushMarkdown();
				const columns: ColumnItem[] = [];
				// Match both <column ... /> and <div class="column" ...>...</div>
				const columnRegex =
					/<(?:column|div)\b([^>]*?)(?:\/?>|>.*?<\/(?:column|div)>)/gs;
				for (const colMatch of innerContent.matchAll(columnRegex)) {
					const colAttrs = parseAttributes(colMatch[1]);
					if (
						colMatch[0].startsWith("<div") &&
						!/(?:^|\s)class=["'](?:[^"']*\s+)?column(?:\s+[^"']*)?["']/.test(
							colMatch[1],
						)
					) {
						continue;
					}
					const col: ColumnItem = {};
					if (colAttrs.markdown)
						col.markdown = colAttrs.markdown.replace(/\\n/g, "\n");
					if (colAttrs.code) col.code = colAttrs.code.replace(/\\n/g, "\n");
					if (colAttrs.latex) col.latex = colAttrs.latex;
					if (colAttrs.src) col.src = colAttrs.src;
					columns.push(col);
				}
				blocks.push({
					type: "columns",
					columns,
					label: attrs.label,
					caption: attrs.caption,
				});
				continue;
			}
		}

		// Not a recognized HTML tag, treat as markdown
		currentMarkdown += token.raw;
	}

	flushMarkdown();

	return { meta, blocks };
}

const ChapterFrontmatterSchema = z
	.object({
		title: z.string().optional(),
		slug: z.string().optional(),
		description: z.string().optional(),
		status: z.enum(["completed", "active", "locked"]).optional(),
		chapter: z.boolean().optional(),
		type: z.string().optional(),
	})
	.catchall(z.unknown());

export function parseChapter(
	content: string,
	options: BuildOptions = {},
	callerDir: string = process.cwd(),
): Chapter {
	const parsed = matter(content);
	const validation = ChapterFrontmatterSchema.safeParse(parsed.data);

	if (!validation.success) {
		logger.error(`Chapter Frontmatter Validation Error:`);
		validation.error.issues.forEach((err) => {
			logger.error(`- ${err.path.join(".")}: ${err.message}`);
		});
		throw new Error("Invalid Frontmatter in Chapter");
	}
	const data = validation.data;

	const meta: ChapterMeta = {
		...data,
		title: data.title || "Untitled Chapter",
		slug:
			data.slug ||
			(data.title || "untitled")
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/(^-|-$)/g, ""),
	};

	const tokens = marked.lexer(parsed.content);
	const lessons: Lesson[] = [];

	// Extract links to lesson .md files
	// biome-ignore lint/suspicious/noExplicitAny: token AST traversal
	const extractLessonsFromTokens = (tokenList: any[]) => {
		for (const token of tokenList) {
			if (
				token.type === "link" &&
				typeof token.href === "string" &&
				token.href.endsWith(".md")
			) {
				const title = token.text;
				const relPath = token.href;
				const fullPath = path.resolve(
					options.contentBase || callerDir,
					relPath,
				);
				if (fs.existsSync(fullPath)) {
					const lessonContent = fs.readFileSync(fullPath, "utf-8");
					const lessonOptions = {
						...options,
						contentBase: path.dirname(fullPath),
					};
					const lesson = parseLesson(
						lessonContent,
						lessonOptions,
						path.dirname(fullPath),
						title,
						path.basename(fullPath),
					);
					lesson.meta.parentSlug = meta.slug;
					lessons.push(lesson);
				} else {
					logger.warn(`[Chapter] Warning: Lesson file not found: ${fullPath}`);
				}
			} else if (token.tokens) {
				extractLessonsFromTokens(token.tokens);
			} else if (token.type === "list" && token.items) {
				for (const item of token.items) {
					if (item.tokens) {
						extractLessonsFromTokens(item.tokens);
					}
				}
			}
		}
	};
	extractLessonsFromTokens(tokens);

	// Setup prev/next links
	for (let i = 0; i < lessons.length; i++) {
		if (i > 0 && !lessons[i].meta.prevSlug) {
			lessons[i].meta.prevSlug = lessons[i - 1].meta.slug;
			lessons[i].meta.prevTitle = lessons[i - 1].meta.title;
		}
		if (i < lessons.length - 1 && !lessons[i].meta.nextSlug) {
			lessons[i].meta.nextSlug = lessons[i + 1].meta.slug;
			lessons[i].meta.nextTitle = lessons[i + 1].meta.title;
		}
	}

	return { meta, lessons };
}

import { copyAssets } from "../builder/utils.js";
import { validateLesson } from "../builder/validation.js";
import { render, renderChapter } from "../renderer/index.js";

export function buildLesson(
	lesson: Lesson,
	options: BuildOptions = {},
): string {
	const lessonOptions = {
		...options,
		contentBase: lesson.meta.contentBase || options.contentBase,
	};
	validateLesson(lesson.meta, lesson.blocks, lessonOptions);
	const html = render(lesson, lessonOptions);
	const outDir = path.resolve(lessonOptions.outDir || "./out");
	const filename = `${lesson.meta.slug}.html`;
	const outPath = path.join(outDir, filename);
	const outPathDir = path.dirname(outPath);
	if (!fs.existsSync(outPathDir)) fs.mkdirSync(outPathDir, { recursive: true });
	fs.writeFileSync(outPath, html, "utf-8");
	if (options.standalone === false) {
		copyAssets(outDir);
	}
	const relPath = path.relative(process.cwd(), outPath);
	logger.success(`Built lesson (${lesson.blocks.length} blocks) → ${relPath}`);
	return outPath;
}

export function buildChapter(
	chapter: Chapter,
	options: BuildOptions = {},
): string {
	// Build all nested lessons first
	for (const lesson of chapter.lessons) {
		buildLesson(lesson, options);
	}
	const html = renderChapter(chapter, options);
	const outDir = path.resolve(options.outDir || "./out");
	const outPath = path.join(outDir, "index.html");
	const outPathDir = path.dirname(outPath);
	if (!fs.existsSync(outPathDir)) fs.mkdirSync(outPathDir, { recursive: true });
	fs.writeFileSync(outPath, html, "utf-8");
	if (options.standalone === false) {
		copyAssets(outDir);
	}
	const relPath = path.relative(process.cwd(), outPath);
	logger.success(
		`Built chapter (${chapter.lessons.length} lessons) → ${relPath}`,
	);
	return outPath;
}
