import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import { mkdtemp, rm } from "node:fs/promises";
import * as path from "path";
import { tmpdir } from "node:os";
import { parseLesson } from "../src/parser/mdx.js";
import { render } from "../src/renderer/index.js";

describe("Renderer", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await mkdtemp(path.join(tmpdir(), "mr-md-renderer-"));
		// Create a dummy file for the code block test
		fs.writeFileSync(path.join(testDir, "dummy.ts"), "const x = 42;");
	});

	afterEach(async () => {
		if (testDir) {
			await rm(testDir, { recursive: true, force: true }).catch(() => {});
		}
	});

	describe("Bug Fixes", () => {
		test("inline math parsing does not swallow across newlines", () => {
			const mdContent =
				"This is a price of $10.\n\nAnd here is another price of $20.";
			const l = parseLesson(mdContent, { contentBase: testDir });

			const html = render(l, { strict: true });

			// The text should not be swallowed by the math parser.
			// We should see "price of $10." and "price of $20." preserved.
			expect(html).toContain("$10.");
			expect(html).toContain("$20.");

			// Verify an actual inline math works
			const mdMath = "Here is some math $x^2 + y^2$.";
			const lMath = parseLesson(mdMath, { contentBase: testDir });
			const htmlMath = render(lMath, { strict: true });
			// Actually katex renders output
			expect(htmlMath).toContain("katex");
		});

		test("markdown links with $ in URL or text are not broken by math parser", () => {
			const mdContent = "Here is [link $x$](http://example.com/?v=$1)";
			const l = parseLesson(mdContent, { contentBase: testDir });
			const html = render(l, { strict: true });

			// The math inside the link text should be parsed
			expect(html).toContain("katex");
			
			// The URL should remain completely intact
			expect(html).toContain('href="http://example.com/?v=$1"');
		});
	});

	describe("Component Rendering", () => {
		test("Renders Callouts", () => {
			const mdContent = "> [!WARNING]\n> Be careful!";
			const l = parseLesson(mdContent, { contentBase: testDir });
			const html = render(l, { strict: true });

			expect(html).toContain('bk-callout');
			expect(html).toContain('bk-callout--warning');
			expect(html).toContain('Be careful!');
		});

		test("Renders Caution Callout", () => {
			const mdContent = "> [!CAUTION]\n> Danger zone!";
			const l = parseLesson(mdContent, { contentBase: testDir });
			const html = render(l, { strict: true });

			expect(html).toContain('bk-callout');
			expect(html).toContain('bk-callout--caution');
			expect(html).toContain('Danger zone!');
			expect(html).toContain('Caution');
		});

		test("Renders Columns with markdown and code", () => {
			const mdContent = `<columns>
<column markdown='Col 1' />
<column code='const answer = 42;' />
</columns>`;
			const l = parseLesson(mdContent, { contentBase: testDir });
			const html = render(l, { strict: true });

			expect(html).toContain('class="bk-columns"');
			expect(html).toContain('Col 1');
			expect(html).toContain('const answer = 42;');
		});

		test("Escapes unhighlighted and fallback code blocks properly", () => {
			const mdContent = "```\n#include <stdio.h>\nint main() { if (a < b && b > c) return 0; }\n```";
			const l = parseLesson(mdContent, { contentBase: testDir });
			const html = render(l, { strict: true });

			expect(html).toContain("&lt;stdio.h&gt;");
			expect(html).toContain("a &lt; b &amp;&amp; b &gt; c");
		});

		test("Renders and highlights code blocks with Shiki (e.g., Cpp, Python, TypeScript)", async () => {
			const { initHighlighter, normalizeLanguage } = await import("../src/renderer/markdown/index.js");
			await initHighlighter();

			expect(normalizeLanguage("Cpp")).toBe("cpp");
			expect(normalizeLanguage("c++")).toBe("cpp");
			expect(normalizeLanguage("Python")).toBe("python");
			expect(normalizeLanguage("py")).toBe("python");
			expect(normalizeLanguage("TS")).toBe("typescript");
			expect(normalizeLanguage("typescript {1-3}")).toBe("typescript");

			const mdContent = "```Cpp\nint x{34};\n```";
			const l = parseLesson(mdContent, { contentBase: testDir });
			const html = render(l, { strict: true });

			expect(html).toContain('class="bk-code-block"');
			expect(html).toContain('<span class="bk-code-lang">Cpp</span>');
			expect(html).toContain('class="shiki');
			expect(html).toContain('int');
			expect(html).toContain('34');
		});

		test("Renders YouTube Videos", () => {
			const mdContent = "![](https://www.youtube.com/watch?v=dQw4w9WgXcQ)";
			const l = parseLesson(mdContent, { contentBase: testDir });
			const html = render(l, { strict: true });

			expect(html).toContain('iframe');
			expect(html).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
		});
	});

	describe("Sidebar & Header Polish", () => {
		test("renders sidebar collapse button and expand button", () => {
			const mdContent = "---\ntitle: Lesson Title\n---\n# Content";
			const l = parseLesson(mdContent, { contentBase: testDir });
			const html = render(l);

			expect(html).toContain('id="bk-sidebar-collapse"');
			expect(html).toContain('id="bk-sidebar-expand"');
			expect(html.match(/<main class="bk-main">/g)?.length).toBe(1);
		});

		test("renders clean sidebar without author badge, and separated tags & author byline in hero", () => {
			const mdContent = `---
title: Quantum Physics
author: Richard Feynman
tags: [physics, quantum, mechanics, particles, waves, field]
parentSlug: index
---
# Intro
Some text here.`;
			const l = parseLesson(mdContent, { contentBase: testDir });
			const html = render(l);

			// Title should appear in sidebar title
			expect(html).toContain('<div class="bk-sidebar-title">Quantum Physics</div>');

			// Sidebar should NOT contain author badge or avatar
			const sidebarContent = html.substring(html.indexOf('<aside class="bk-sidebar">'), html.indexOf('</aside>'));
			expect(sidebarContent).not.toContain("bk-sidebar-author");
			expect(sidebarContent).not.toContain("bk-sidebar-avatar");

			// Tags should NOT be in the sidebar (.bk-sidebar)
			expect(sidebarContent).not.toContain("bk-tag");

			// Tags should be capped at 4 in the hero eyebrow row with +2 overflow
			expect(html).toContain('class="bk-hero-eyebrow-row"');
			expect(html).toContain('class="bk-hero-tags"');
			expect(html).toContain('<span class="bk-tag"><span class="bk-tag-hash">#</span>physics</span>');
			expect(html).toContain('<span class="bk-tag"><span class="bk-tag-hash">#</span>quantum</span>');
			expect(html).toContain('<span class="bk-tag"><span class="bk-tag-hash">#</span>mechanics</span>');
			expect(html).toContain('<span class="bk-tag"><span class="bk-tag-hash">#</span>particles</span>');
			expect(html).not.toContain('<span class="bk-tag"><span class="bk-tag-hash">#</span>waves</span>');
			expect(html).toContain('class="bk-tag bk-tag-overflow"');
			expect(html).toContain('>+2</span>');

			// Author byline in hero with name
			expect(html).toContain('class="bk-hero-byline"');
			expect(html).toContain('<strong class="bk-hero-name">Richard Feynman</strong>');
			// Hero should NOT have an initials avatar badge
			expect(html).not.toContain('bk-hero-avatar');

			// Back to chapter in top bar
			expect(html).toContain('class="bk-sidebar-top-bar"');
			expect(html).toContain('class="bk-back-link"');
		});
	});
});
