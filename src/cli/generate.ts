import * as fs from "fs";
import * as path from "path";

import { loadConfig, saveConfig } from "../config.js";
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
		logger.info(`Stripped '.md' extension from input name: '${rawName}'`);
	}

	// Strip any existing numeric prefix (e.g., "01-intro" → "intro")
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

	const fileName = `${fileNameBase}.md`;
	const targetPath = path.resolve(targetDir, fileName);

	if (fs.existsSync(targetPath)) {
		logger.error(`File already exists: ${fileName}`);
		process.exit(1);
	}

	const currentDate = new Date().toISOString().split("T")[0];

	const content = `---
title: ${fileNameBase}
date: ${currentDate}
author: ""
tags: []
---

# ${fileNameBase}

Start writing your lesson here.

`;

	fs.writeFileSync(targetPath, content);

	// Append to mrmd.config.json if it exists
	const config = loadConfig(targetDir);
	if (config) {
		config.lessons = [...(config.lessons ?? []), fileName];
		saveConfig(targetDir, config);
		logger.info(`Generated ${fileName} and added to mrmd.config.json`);
	} else {
		logger.info(`Generated ${fileName}`);
	}
}
