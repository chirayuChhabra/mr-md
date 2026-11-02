import matter from "@11ty/gray-matter";
import * as fs from "fs";
import * as path from "path";

export function generateChapterContent(targetPath: string): string {
	const files = fs.readdirSync(targetPath).filter((f) => {
		return f.endsWith(".md") && fs.statSync(path.join(targetPath, f)).isFile();
	});

	if (files.length === 0) {
		throw new Error(`No markdown files found in directory: ${targetPath}`);
	}

	const fileData: { file: string; title: string; idx: number }[] = [];
	const errors: string[] = [];

	for (const f of files) {
		const content = fs.readFileSync(path.join(targetPath, f), "utf-8");
		const parsed = matter(content);

		if (parsed.data.index === undefined || parsed.data.index === null) {
			errors.push(`- ${f}: Missing 'index' field in frontmatter.`);
			continue;
		}

		const idx = Number(parsed.data.index);
		if (!Number.isInteger(idx) || idx < 1) {
			errors.push(
				`- ${f}: 'index' must be a positive integer. Got: ${parsed.data.index}`,
			);
			continue;
		}

		let title = parsed.data.title;
		if (!title) {
			const h1Match = content.match(/^#\s+(.+)$/m);
			title = h1Match ? h1Match[1] : f.replace(/\.md$/, "");
		}

		fileData.push({ file: f, title, idx });
	}

	if (errors.length > 0) {
		throw new Error(
			"Strict index validation failed. Please fix the following files:\n" +
				errors.join("\n"),
		);
	}

	fileData.sort((a, b) => a.idx - b.idx);
	const expectedIndexes = Array.from({ length: files.length }, (_, i) => i + 1);
	const actualIndexes = fileData.map((d) => d.idx);

	const missing = expectedIndexes.filter((o) => !actualIndexes.includes(o));

	const indexCounts = new Map<number, string[]>();
	for (const d of fileData) {
		if (!indexCounts.has(d.idx)) {
			indexCounts.set(d.idx, []);
		}
		indexCounts.get(d.idx)?.push(d.file);
	}

	const duplicates = Array.from(indexCounts.entries())
		.filter(([_, fileList]) => fileList.length > 1)
		.map(
			([idx, fileList]) =>
				`  - Index ${idx} is duplicated in: ${fileList.join(", ")}`,
		);

	if (missing.length > 0 || duplicates.length > 0) {
		let errorMsg = `Strict index validation failed. The 'index' fields must form a perfect sequence from 1 to ${files.length}.\n`;
		if (missing.length > 0)
			errorMsg += `- Missing indexes: ${missing.join(", ")}\n`;
		if (duplicates.length > 0)
			errorMsg += `- Duplicate indexes found:\n${duplicates.join("\n")}`;
		throw new Error(errorMsg.trim());
	}

	const listItems = fileData
		.map((d) => `- [${d.title}](./${d.file})`)
		.join("\n");

	const folderName = path.basename(targetPath);
	const rawName = folderName.replace(/^\d+[-_]/, "");
	const formattedTitle = rawName
		.replace(/[-_]/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());

	const { logger } = require("./logger.js");
	logger.info(
		`Derived chapter title "${formattedTitle}" from folder name "${folderName}"`,
	);

	return `---
title: ${formattedTitle}
chapter: true
---
${listItems}
`;
}
