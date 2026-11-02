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
});
