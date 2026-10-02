import * as fs from "fs";
import * as path from "path";
import { ensureConfig, getLessonFile } from "../config.js";

/**
 * Generate virtual chapter markdown content from mrmd.config.json.
 *
 * Instead of requiring contiguous `index: N` frontmatter in each .md file,
 * lesson ordering is driven entirely by the `lessons` array in the config.
 */
export function generateChapterContent(
	targetPath: string,
	options?: { allowEmpty?: boolean },
): string {
	const config = ensureConfig(targetPath);
	const lessons = config.lessons ?? [];

	if (lessons.length === 0) {
		if (options?.allowEmpty) {
			const rawTitle =
				config.title?.trim() ||
				path
					.basename(targetPath)
					.replace(/^\d+[-_]/, "")
					.replace(/[-_]/g, " ")
					.replace(/\b\w/g, (c) => c.toUpperCase());
			const descLine = config.description?.trim()
				? `description: ${JSON.stringify(config.description.trim())}\n`
				: "";
			const authorLine = config.author?.trim()
				? `author: ${JSON.stringify(config.author.trim())}\n`
				: "";
			return `---
title: ${JSON.stringify(rawTitle)}
${descLine}${authorLine}chapter: true
---
`;
		}

		let hint = "";
		try {
			if (fs.existsSync(targetPath)) {
				const entries = fs.readdirSync(targetPath, { withFileTypes: true });
				const subCourses = entries
					.filter(
						(e) =>
							e.isDirectory() &&
							!e.name.startsWith(".") &&
							!["out", "dist", "node_modules", "build"].includes(e.name),
					)
					.filter((e) => {
						const subDir = path.join(targetPath, e.name);
						return (
							fs.existsSync(path.join(subDir, "mrmd.config.json")) ||
							fs.readdirSync(subDir).some((f) => f.endsWith(".md"))
						);
					})
					.map((e) => e.name);
				if (subCourses.length > 0) {
					hint = ` Did you mean to target a course subfolder? Found: ${subCourses.map((c) => path.join(path.basename(targetPath), c)).join(", ")}`;
				}
			}
		} catch (_) {}
		throw new Error(
			`No lessons found in mrmd.config.json for: ${targetPath}.${hint}`,
		);
	}

	const listItems = lessons
		.map((entry) => {
			const file = getLessonFile(entry);
			let title: string;

			if (typeof entry === "string") {
				// Derive a readable title from the filename
				title = file
					.replace(/^\d+[-_]?/, "")
					.replace(/\.md$/, "")
					.replace(/[-_]/g, " ")
					.replace(/\b\w/g, (c) => c.toUpperCase());
			} else {
				title =
					entry.title ??
					file
						.replace(/^\d+[-_]?/, "")
						.replace(/\.md$/, "")
						.replace(/[-_]/g, " ")
						.replace(/\b\w/g, (c) => c.toUpperCase());
			}

			return `- [${title}](./${file})`;
		})
		.join("\n");

	const rawTitle =
		config.title?.trim() ||
		path
			.basename(targetPath)
			.replace(/^\d+[-_]/, "")
			.replace(/[-_]/g, " ")
			.replace(/\b\w/g, (c) => c.toUpperCase());

	const descLine = config.description?.trim()
		? `description: ${JSON.stringify(config.description.trim())}\n`
		: "";

	const authorLine = config.author?.trim()
		? `author: ${JSON.stringify(config.author.trim())}\n`
		: "";

	return `---
title: ${JSON.stringify(rawTitle)}
${descLine}${authorLine}chapter: true
---
${listItems}
`;
}
