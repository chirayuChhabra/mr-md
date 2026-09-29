import { describe, expect, test } from "bun:test";
import { renderChapter } from "../src/renderer/chapter.js";
import { renderChapterTimeline } from "../src/renderer/components/timeline.js";
import type { Chapter } from "../src/types.js";

describe("Chapter Renderer", () => {
	const mockChapter: Chapter = {
		meta: {
			title: "My Chapter",
			description: "A test chapter",
		},
		lessons: [
			{
				meta: { title: "Lesson 1", slug: "lesson-1" },
				blocks: [],
			},
			{
				meta: { title: "Lesson 2", slug: "lesson-2", description: "Desc 2" },
				blocks: [],
			},
		],
	};

	test("should render a chapter page", () => {
		const html = renderChapter(mockChapter, { theme: "light" });
		expect(html).toContain("My Chapter");
		expect(html).toContain("A test chapter");
		expect(html).toContain("lesson-1.html");
		expect(html).toContain("Lesson 1");
		expect(html).toContain("lesson-2.html");
		expect(html).toContain("Lesson 2");
	});

	test("should render chapter timeline", () => {
		const html = renderChapterTimeline(mockChapter);
		expect(html).toContain("bk-timeline");
		expect(html).toContain("Lesson 1");
		expect(html).toContain("lesson-1.html");
		expect(html).toContain("Lesson 2");
		expect(html).toContain("Desc 2");
		expect(html).toContain("lesson-2.html");
	});

	test("should handle missing chapter description", () => {
		const noDescChapter: any = {
			meta: { title: "No Desc", slug: "no-desc" },
			lessons: [],
		};
		const html = renderChapter(noDescChapter);
		expect(html).toContain("No Desc");
		expect(html).not.toContain('class="bk-deck"');
	});

	test("generateChapterContent generates chapter markdown from config", async () => {
		const { generateChapterContent } = await import(
			"../src/cli/chapter.js"
		);
		const { saveConfig } = await import("../src/config.js");
		const { mkdir, rm, writeFile } = await import("node:fs/promises");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");

		const tempDir = join(
			tmpdir(),
			`mr-md-ch-test-${Math.random().toString(36).substring(7)}`,
		);
		await mkdir(tempDir, { recursive: true });

		try {
			await writeFile(join(tempDir, "01-first.md"), "# First Lesson\n");
			await writeFile(join(tempDir, "02-second.md"), "# Second Lesson\n");

			saveConfig(tempDir, {
				title: "My Configured Course",
				description: "A great course",
				lessons: ["02-second.md", "01-first.md"], // custom order!
			});

			const content = generateChapterContent(tempDir);
			expect(content).toContain("title: My Configured Course");
			expect(content).toContain("description: A great course");
			// Second should come before First according to config order!
			const idxSecond = content.indexOf("02-second.md");
			const idxFirst = content.indexOf("01-first.md");
			expect(idxSecond).toBeLessThan(idxFirst);
		} finally {
			await rm(tempDir, { recursive: true, force: true }).catch(() => {});
		}
	});
});

