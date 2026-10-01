import { createRequire } from "module";

const require = createRequire(import.meta.url);

import matter from "@11ty/gray-matter";
import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger.js";
import { getOriginalCwd, parseCliArgs } from "./utils.js";

async function buildFile(
	filePath: string,
	customOptions: Record<string, unknown> = {},
) {
	logger.startSpinner(`Building file: ${filePath}`);
	const outDir = customOptions.outDir
		? path.resolve(getOriginalCwd(), String(customOptions.outDir))
		: path.resolve(getOriginalCwd(), path.dirname(filePath), "out");
	const contentBase = path.dirname(filePath);

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
		const content = fs.readFileSync(filePath, "utf-8");
		await preloadLanguagesFromMarkdown(content);
		const parsed = matter(content);

		const isChapter =
			parsed.data.chapter === true || parsed.data.type === "chapter";

		if (isChapter) {
			const chapter = parseChapter(
				content,
				{ outDir, contentBase, ...customOptions },
				contentBase,
			);
			buildChapter(chapter, { outDir, contentBase, ...customOptions });
		} else {
			const lesson = parseLesson(
				content,
				{ outDir, contentBase, ...customOptions },
				contentBase,
				undefined,
				path.basename(filePath),
			);
			buildLesson(lesson, { outDir, contentBase, ...customOptions });
		}
		logger.succeedSpinner(
			`Build successful for ${path.relative(process.cwd(), filePath) || path.basename(filePath)}.`,
		);
	} catch (err: unknown) {
		logger.failSpinner(`Build failed for ${filePath}`);
		logger.error(
			`Error details: ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exit(1);
	}
}

export async function runBuild(args: string[]) {
	const {
		initHighlighter,
		preloadLanguagesFromMarkdown,
	} = require("../renderer/markdown/index.js");
	await initHighlighter();
	process.env.NODE_ENV = "production";
	const cliOpts = parseCliArgs(args);
	const target = cliOpts.target;

	if (!target) {
		logger.error("Usage: mr-md build <file-or-directory> [options]");
		process.exit(1);
	}

	const targetPath = path.resolve(getOriginalCwd(), target);

	if (!fs.existsSync(targetPath)) {
		logger.error(`File or directory not found: ${target}`);
		process.exit(1);
	}

	if (fs.statSync(targetPath).isDirectory()) {
		try {
			const { generateChapterContent } = require("./chapter.js");
			const { ensureConfig, configToBuildOptions } = require("../config.js");
			const config = ensureConfig(targetPath);
			const configOpts = {
				...configToBuildOptions(config),
				...(cliOpts.theme ? { theme: cliOpts.theme } : {}),
				...(cliOpts.palette ? { palette: cliOpts.palette } : {}),
			};
			const chapterContent = generateChapterContent(targetPath);
			await preloadLanguagesFromMarkdown(chapterContent);

			const outDir = cliOpts.outDir
				? path.resolve(getOriginalCwd(), cliOpts.outDir)
				: path.resolve(getOriginalCwd(), targetPath, "out");
			const contentBase = targetPath;

			logger.startSpinner(`Building chapter from directory: ${targetPath}`);
			const { parseChapter, buildChapter } = require("../parser/mdx.js");

			const chapter = parseChapter(
				chapterContent,
				{ outDir, contentBase, ...configOpts },
				contentBase,
			);
			buildChapter(chapter, { outDir, contentBase, ...configOpts });

			logger.succeedSpinner(
				`Build successful for directory ${path.relative(process.cwd(), targetPath) || path.basename(targetPath)}.`,
			);
		} catch (err: unknown) {
			logger.error(err instanceof Error ? err.message : String(err));
			process.exit(1);
		}
	} else {
		if (!targetPath.endsWith(".md")) {
			logger.error("Unsupported file type. Must be a .md file.");
			process.exit(1);
		}
		await buildFile(targetPath, {
			...(cliOpts.outDir ? { outDir: cliOpts.outDir } : {}),
			...(cliOpts.theme ? { theme: cliOpts.theme } : {}),
			...(cliOpts.palette ? { palette: cliOpts.palette } : {}),
		});
	}
}
