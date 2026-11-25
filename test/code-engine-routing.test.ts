import { expect, test } from "bun:test";
import { mdToHtml, renderCodeBlock } from "../src/renderer/markdown/index.js";

test("uses the first rendered H1 or H2 as the Markdown title", () => {
	const markdown = "```md\n# Code example\n```\n\n### Detail\n\n## Lesson title\n\n# Later";
	expect(mdToHtml(markdown).title).toBe("Lesson title");
	expect(mdToHtml("### Detail").title).toBe("");
});

test("code replacement receives full fence info and preserves surrounding content order", () => {
	const calls: { code: string; language: string }[] = [];
	const { html } = mdToHtml("Before\n\n```js run readonly\nconsole.log(1)\n```\n\nAfter", {
		codeRenderer: ({ code, language }) => {
			calls.push({ code, language });
			return '<section class="replacement-code">Replacement</section>';
		},
	});
	expect(calls).toEqual([{ code: "console.log(1)", language: "js run readonly" }]);
	expect(html.indexOf("Before")).toBeLessThan(html.indexOf("Replacement"));
	expect(html.indexOf("Replacement")).toBeLessThan(html.indexOf("After"));
	expect(html).not.toContain("bk-code-runner");
});

test("code replacement also receives nested and unlabelled code", () => {
	const languages: string[] = [];
	mdToHtml("> ```python\n> print(1)\n> ```\n\n```\nplain\n```", {
		codeRenderer: ({ language }) => {
			languages.push(language);
			return "<pre>replacement</pre>";
		},
	});
	expect(languages).toEqual(["python", ""]);
});

test("default code rendering retains runner metadata and escapes source", () => {
	const source = 'console.log("<script>")';
	const runner = renderCodeBlock(source, "js run readonly");
	expect(runner).toContain('class="bk-code-runner"');
	expect(runner).toContain('data-lang="javascript"');
	expect(runner).toContain('data-editable="false"');
	expect(runner).not.toContain('console.log("<script>")');
	expect(mdToHtml('```js\nalert("<script>")\n```').html).toContain("bk-code-block");
});

test("custom code HTML uses the existing sanitization boundary", () => {
	const { html } = mdToHtml("```js\ncode\n```", {
		codeRenderer: () => '<section onclick="bad()">Safe</section><script>bad()</script>',
	});
	expect(html).toContain("Safe");
	expect(html).not.toContain("onclick");
	expect(html).not.toContain("<script>");
});
