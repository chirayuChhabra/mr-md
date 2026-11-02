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
});
