import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { parseLesson, parseChapter } from "../src/parser/mdx.js";
import { mkdtemp, rm } from "node:fs/promises";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "node:os";

describe("Markdown Parser (v3)", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await mkdtemp(path.join(tmpdir(), "mr-md-parser-"));
	});

	afterEach(async () => {
		if (testDir) {
			await rm(testDir, { recursive: true, force: true }).catch(() => {});
		}
	});

	test("Parses standard markdown correctly", () => {
		const md = `---
title: "Basic Markdown"
slug: "basic-md"
---
# Basic Markdown
This is a paragraph.

## Subheading
Another paragraph here.
`;
		const lesson = parseLesson(md, { contentBase: testDir });
		expect(lesson.meta.title).toBe("Basic Markdown");
		expect(lesson.meta.slug).toBe("basic-md");
		expect(lesson.blocks.length).toBeGreaterThan(0);
		expect(lesson.blocks[0].type).toBe("markdown");
		expect((lesson.blocks[0] as any).src).toContain("This is a paragraph.");
		expect((lesson.blocks[0] as any).src).toContain("## Subheading");
	});

	test("Extracts YouTube block", () => {
		const md = `
# Title
Check out this video:

![](https://www.youtube.com/watch?v=dQw4w9WgXcQ)
`;
		const lesson = parseLesson(md, { contentBase: testDir });
		const ytBlock = lesson.blocks.find(b => b.type === "youtube");
		expect(ytBlock).toBeDefined();
		expect((ytBlock as any).id).toBe("dQw4w9WgXcQ");
	});

	test("Extracts Media block for audio and video", () => {
		const md = `
# Title
Audio here:

![Audio Caption](/assets/audio.mp3)

Video here:

![Video Caption](/assets/video.mp4)
`;
		const lesson = parseLesson(md, { contentBase: testDir });
		
		const audioBlock = lesson.blocks.find(b => b.type === "media" && (b as any).kind === "audio");
		expect(audioBlock).toBeDefined();
		expect((audioBlock as any).src).toBe("/assets/audio.mp3");
		
		const videoBlock = lesson.blocks.find(b => b.type === "media" && (b as any).kind === "video");
		expect(videoBlock).toBeDefined();
		expect((videoBlock as any).src).toBe("/assets/video.mp4");
	});

	test("Extracts Callouts (Blockquotes)", () => {
		const md = `
> [!NOTE]
> This is a note.

> [!WARNING]
> This is a warning.
`;
		const lesson = parseLesson(md, { contentBase: testDir });
		
		const noteBlock = lesson.blocks.find(b => b.type === "note");
		expect(noteBlock).toBeDefined();
		expect((noteBlock as any).src).toContain("This is a note.");

		const warningBlock = lesson.blocks.find(b => b.type === "warning");
		expect(warningBlock).toBeDefined();
		expect((warningBlock as any).src).toContain("This is a warning.");
	});

	test("Parses <columns> tag properly", () => {
		const md = `
<columns label="Test Layout" caption="Layout Caption">
  <column markdown="Col 1 **bold**" />
  <column code="const a = 1;" />
</columns>
`;
		const lesson = parseLesson(md, { contentBase: testDir });
		const colBlock = lesson.blocks.find(b => b.type === "columns");
		
		expect(colBlock).toBeDefined();
		expect((colBlock as any).label).toBe("Test Layout");
		expect((colBlock as any).caption).toBe("Layout Caption");
		expect((colBlock as any).columns.length).toBe(2);
		expect((colBlock as any).columns[0].markdown).toBe("Col 1 **bold**");
		expect((colBlock as any).columns[1].code).toBe("const a = 1;");
	});

	test("Parses <div class='columns'> tag properly", () => {
		const md = `
<div class="columns" label="Test Div Layout">
  <div class="column" markdown="Div Col 1"></div>
  <div class="column" latex="x^2"></div>
</div>
`;
		const lesson = parseLesson(md, { contentBase: testDir });
		const colBlock = lesson.blocks.find(b => b.type === "columns");
		
		expect(colBlock).toBeDefined();
		expect((colBlock as any).label).toBe("Test Div Layout");
		expect((colBlock as any).columns.length).toBe(2);
		expect((colBlock as any).columns[0].markdown).toBe("Div Col 1");
		expect((colBlock as any).columns[1].latex).toBe("x^2");
	});

	test("Parses simulation and quiz file extensions", () => {
		const md = `
![](sim.ts)

![](quiz.json)
`;
		const lesson = parseLesson(md, { contentBase: testDir });
		const simBlock = lesson.blocks.find(b => b.type === "simulation");
		const quizBlock = lesson.blocks.find(b => b.type === "quiz");

		expect(simBlock).toBeDefined();
		expect((simBlock as any).src).toBe("sim.ts");

		expect(quizBlock).toBeDefined();
		expect((quizBlock as any).src).toBe("quiz.json");
	});

	test("parseChapter extracts lessons correctly", () => {
		const l1Path = path.join(testDir, "lesson1.md");
		const l2Path = path.join(testDir, "lesson2.md");
		
		fs.writeFileSync(l1Path, "---\ntitle: Lesson 1\n---");
		fs.writeFileSync(l2Path, "---\ntitle: Lesson 2\n---");

		const chapMd = `---
title: "Test Chapter"
---
# Welcome
Here are the lessons:
- [Lesson 1](./lesson1.md)
- [Lesson 2](./lesson2.md)
`;
		const chap = parseChapter(chapMd, { contentBase: testDir }, testDir);
		
		expect(chap.meta.title).toBe("Test Chapter");
		expect(chap.lessons.length).toBe(2);
		
		// Verifying lessons inherited properties and connections
		expect(chap.lessons[0].meta.title).toBe("Lesson 1");
		expect(chap.lessons[1].meta.title).toBe("Lesson 2");

		expect(chap.lessons[0].meta.nextSlug).toBe(chap.lessons[1].meta.slug);
		expect(chap.lessons[1].meta.prevSlug).toBe(chap.lessons[0].meta.slug);
		expect(chap.lessons[0].meta.parentSlug).toBe(chap.meta.slug);
	});
});
