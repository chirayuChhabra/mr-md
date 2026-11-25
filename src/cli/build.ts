import { createRequire } from "module";

const require = createRequire(import.meta.url);

import matter from "@11ty/gray-matter";
import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger.js";
import { getOriginalCwd } from "./utils.js";

async function buildFile(filePath: string) {
	logger.startSpinner(`Building file: ${filePath}`);
	const outDir = path.resolve(getOriginalCwd(), path.dirname(filePath), "out");
	const contentBase = path.dirname(filePath);
	const { loadMrmdConfig, lessonConfiguration } = require("../config.js");
	const { presentation, engineSettings } = lessonConfiguration(
		loadMrmdConfig(contentBase),
		path.basename(filePath),
	);

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
				{ outDir, contentBase },
				contentBase,
			);
			buildChapter(chapter, { outDir, contentBase, presentation });
		} else {
			const lesson = parseLesson(
				content,
				{ outDir, contentBase },
				contentBase,
				undefined,
				path.basename(filePath),
			);
			buildLesson(
				{ ...lesson, engineSettings },
				{ outDir, contentBase, presentation },
			);
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
	const target = args[0];

	if (!target) {
		logger.error("Usage: mr-md build <file-or-directory>");
		process.exit(1);
	}

	const targetPath = path.resolve(getOriginalCwd(), target);

	if (!fs.existsSync(targetPath)) {
		logger.error(`File or directory not found: ${target}`);
		process.exit(1);
	}

	if (fs.statSync(targetPath).isDirectory()) {
		try {
			const { compileProject } = require("../compiler.js");
			const { buildChapter } = require("../parser/mdx.js");
			const outDir = path.join(targetPath, "out");
			logger.startSpinner(`Building chapter from directory: ${targetPath}`);
			const document = compileProject(targetPath);
			for (const lesson of document.chapter.lessons) {
				for (const block of lesson.blocks) {
					if (block.type === "markdown")
						await preloadLanguagesFromMarkdown(block.src);
				}
			}
			buildChapter(document.chapter, { outDir, contentBase: targetPath });

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
		await buildFile(targetPath);
	}
}
