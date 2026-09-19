import * as fs from "fs";
import { createRequire } from "module";
import * as path from "path";

const require = createRequire(import.meta.url);

import { logger } from "./logger.js";
import { getOriginalCwd } from "./utils.js";

export function runGenerate(args: string[]) {
	if (args.length === 0) {
		logger.error("Usage: mr-md g <name> [name2...]");
		process.exit(1);
	}

	for (const arg of args) {
		generateSingle(arg);
	}
}

function generateSingle(rawName: string) {
	const originalName = rawName;

	// Normalize all slashes to POSIX-style for consistent parsing across platforms
	const normalizedPath = rawName.replace(/\\/g, "/");
	const parsedPath = path.parse(normalizedPath);

	let targetDir = getOriginalCwd();
	let fileNameBase = parsedPath.name;

	if (parsedPath.dir) {
		targetDir = path.resolve(targetDir, parsedPath.dir);
		if (!fs.existsSync(targetDir)) {
			fs.mkdirSync(targetDir, { recursive: true });
			logger.info(`Created directory: ${parsedPath.dir}`);
		}
	}

	if (parsedPath.ext === ".md" || rawName.endsWith(".md")) {
		logger.info(`Stripped '.md' extension from input name: '${originalName}'`);
	}

	const prefixMatch = fileNameBase.match(/^\d+-*/);
	if (prefixMatch) {
		fileNameBase = fileNameBase.replace(/^\d+-*/, "");
		logger.info(
			`Stripped existing numeric prefix from input name: '${prefixMatch[0]}' -> '${fileNameBase}'`,
		);
	}

	if (!fileNameBase.trim()) {
		fileNameBase = "untitled";
	}

	rawName = fileNameBase;

	let files: string[] = [];
	if (fs.existsSync(targetDir)) {
		files = fs.readdirSync(targetDir).filter((f) => {
			return f.endsWith(".md") && fs.statSync(path.join(targetDir, f)).isFile();
		});
	}

	let maxIndex = 0;

	if (files.length > 0) {
		const matter = require("@11ty/gray-matter");
		for (const f of files) {
			try {
				const content = fs.readFileSync(path.join(targetDir, f), "utf-8");
				const parsed = matter(content);
				if (parsed.data.index !== undefined && parsed.data.index !== null) {
					const index = Number(parsed.data.index);
					if (Number.isInteger(index) && index > maxIndex) {
						maxIndex = index;
					}
				}
			} catch (e: unknown) {
				logger.warn(
					`Failed to parse file while determining max index: ${e instanceof Error ? e.message : String(e)}`,
				);
			}
		}
	}

	const newIndex = maxIndex + 1;
	const prefix = String(newIndex).padStart(2, "0");
	const fileName = `${prefix}-${rawName}.md`;
	const targetPath = path.resolve(targetDir, fileName);

	if (fs.existsSync(targetPath)) {
		logger.error(`File already exists: ${fileName}`);
		process.exit(1);
	}

	const currentDate = new Date().toISOString().split("T")[0];

	const content = `---
index: ${newIndex}
date: ${currentDate}
author: ""
tags: []
---

# ${rawName}

Start writing your lesson here.

`;

	fs.writeFileSync(targetPath, content);
	logger.info(`Generated ${fileName} with index ${newIndex}`);
}
