import * as path from "path";
import { ensureConfig, getLessonFile } from "../config.js";

/**
 * Generate virtual chapter markdown content from mrmd.config.json.
 *
 * Instead of requiring contiguous `index: N` frontmatter in each .md file,
 * lesson ordering is driven entirely by the `lessons` array in the config.
 */
export function generateChapterContent(targetPath: string): string {
	const config = ensureConfig(targetPath);
	const lessons = config.lessons ?? [];

	if (lessons.length === 0) {
		throw new Error(`No lessons found in mrmd.config.json for: ${targetPath}`);
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

	const title =
		config.title ??
		path
			.basename(targetPath)
			.replace(/^\d+[-_]/, "")
			.replace(/[-_]/g, " ")
			.replace(/\b\w/g, (c) => c.toUpperCase());

	const description = config.description
		? `description: ${config.description}\n`
		: "";

	return `---
title: ${title}
${description}chapter: true
---
${listItems}
`;
}
