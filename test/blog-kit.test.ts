import { expect, test } from "bun:test";
import { createBlogKit, defaultBlogKitEngines } from "../src/blog-kit/engine.js";
import { BlogKitEngineError } from "../src/blog-kit/contracts.js";
import type { Lesson } from "../src/types.js";
import { render, renderChapter as renderConfiguredChapter } from "../src/renderer/index.js";
import { renderBlock } from "../src/renderer/blocks/index.js";
import { renderPage } from "../src/renderer/templates/page.js";
import { renderChapter as renderDefaultChapter } from "../src/renderer/chapter.js";

const lesson: Lesson = {
	meta: { title: "A lesson", slug: "lesson" },
	blocks: [{ type: "quiz", src: "quiz.json" }],
};

test("a replacement learning engine feeds the selected layout without changing content", () => {
	const kit = createBlogKit({ engines: {
		learning: { name: "alternative", apiVersion: 1, blockTypes: ["quiz", "steps"],
			render: ({ block }) => ({ html: `<section>${block.type}</section>`, navItems: [{ id: "custom", label: "Try it", kind: "quiz" }] }) },
		layout: { name: "plain", apiVersion: 1,
			render: ({ lesson, bodyHtml, navItems }) => `${lesson.meta.title}|${navItems[0].label}|${bodyHtml}` },
	} });
	expect(kit.renderLesson(lesson)).toBe('A lesson|Try it|<section data-bk-src="quiz.json">quiz</section>');
	expect(lesson.blocks[0].type).toBe("quiz");
});

test("engine failures preserve strict and tolerant rendering behavior", () => {
	const kit = createBlogKit({ engines: {
		learning: { ...defaultBlogKitEngines.learning, render: () => { throw new Error("<broken>"); } },
		layout: { ...defaultBlogKitEngines.layout, render: ({ bodyHtml }) => bodyHtml },
	} });
	expect(() => kit.renderLesson(lesson)).toThrow("<broken>");
	expect(kit.renderLesson(lesson, { strict: false })).toContain("&lt;broken&gt;");
});

test("engine API versions and overlapping block ownership are rejected", () => {
	expect(() => createBlogKit({ engines: {
		learning: { ...defaultBlogKitEngines.learning, apiVersion: 2 as 1 },
	} })).toThrow(BlogKitEngineError);
	expect(() => createBlogKit({ engines: {
		learning: { ...defaultBlogKitEngines.learning, blockTypes: ["markdown"] },
	} })).toThrow("owned by multiple engines");
});

test("chapter presentation can be replaced independently", () => {
	const kit = createBlogKit({ engines: {
		chapter: { name: "chapter", apiVersion: 1, render: ({ chapter }) => chapter.meta.title },
	} });
	expect(kit.renderChapter({ meta: { title: "Mechanics", slug: "mechanics" }, lessons: [] })).toBe("Mechanics");
});

test("public render entrypoints use the selected Blog Kit", () => {
	const kit = createBlogKit({ engines: {
		learning: { ...defaultBlogKitEngines.learning, render: () => ({ html: "custom learning" }) },
		layout: { ...defaultBlogKitEngines.layout, render: ({ bodyHtml }) => bodyHtml },
		chapter: { ...defaultBlogKitEngines.chapter, render: () => "custom chapter" },
	} });
	expect(render(lesson, { blogKit: kit })).toBe("custom learning");
	expect(renderConfiguredChapter({ meta: { title: "Chapter", slug: "chapter" }, lessons: [] }, { blogKit: kit })).toBe("custom chapter");
});

test("default adapters preserve the existing page and chapter output", () => {
	const document: Lesson = { meta: { title: "Hello", slug: "hello" }, blocks: [{ type: "markdown", src: "A paragraph." }] };
	const result = renderBlock(document.blocks[0], 0, {});
	const expected = renderPage(document, result.navItems ?? [], result.html, {});
	const kit = createBlogKit();
	expect(kit.renderLesson(document)).toBe(expected);
	const chapter = { meta: { title: "Chapter", slug: "chapter" }, lessons: [document] };
	expect(kit.renderChapter(chapter)).toBe(renderDefaultChapter(chapter));
});
