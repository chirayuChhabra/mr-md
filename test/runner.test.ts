import { describe, expect, test } from "bun:test";
import { mdToHtml } from "../src/renderer/markdown/index.js";
import { highlightCode } from "../src/renderer/markdown/runner-highlighter.js";

describe("Runnable Code Blocks", () => {
	test("standard code block without run flag renders as .bk-code-block", () => {
		const md = "```javascript\nconsole.log(42);\n```";
		const { html } = mdToHtml(md);

		expect(html).toContain("bk-code-block");
		expect(html).not.toContain("bk-code-runner");
	});

	test("code block with 'run' flag renders as .bk-code-runner with dual-layer highlight", () => {
		const md = "```js run\nconsole.log('Hello, world!');\n```";
		const { html } = mdToHtml(md);

		expect(html).toContain("bk-code-runner");
		expect(html).toContain('data-lang="javascript"');
		expect(html).toContain('data-editable="true"');
		expect(html).toContain('data-autorun="false"');
		expect(html).toContain('data-timeout="3000"');
		expect(html).toContain("bk-runner-editor");
		expect(html).toContain("console.log('Hello, world!');");
		expect(html).toContain("bk-run-btn");
		expect(html).toContain("bk-reset-btn");
		expect(html).toContain("bk-runner-output");
		expect(html).toContain("bk-runner-highlight");
		expect(html).toContain("bk-runner-code-layer");
		expect(html).toContain("token");
	});

	test("code block with 'runnable' flag renders as .bk-code-runner", () => {
		const md = "```python runnable\nprint('Python test')\n```";
		const { html } = mdToHtml(md);

		expect(html).toContain("bk-code-runner");
		expect(html).toContain('data-lang="python"');
		expect(html).toContain("print('Python test')");
		expect(html).toContain("bk-runner-lines");
		expect(html).toContain("1");
	});

	test("code block with readonly / editable=false disables editing and hides reset button", () => {
		const md = "```js run readonly\nconsole.log('Locked example');\n```";
		const { html } = mdToHtml(md);

		expect(html).toContain("bk-code-runner");
		expect(html).toContain('data-editable="false"');
		expect(html).toContain("readonly");
		expect(html).not.toContain("bk-reset-btn");
	});

	test("code block with attributes: title, timeout, autorun, and stdin", () => {
		const md =
			'```cpp run autorun timeout=4500 title="Benchmark Test" stdin="input_data"\n#include <iostream>\nint main() { std::cout << 100; return 0; }\n```';
		const { html } = mdToHtml(md);

		expect(html).toContain("bk-code-runner");
		expect(html).toContain('data-lang="cpp"');
		expect(html).toContain('data-autorun="true"');
		expect(html).toContain('data-timeout="4500"');
		expect(html).toContain('data-title="Benchmark Test"');
		expect(html).toContain('data-stdin="input_data"');
		expect(html).toContain("Benchmark Test");
	});

	test("compiled languages default to two-step mode with Compile button", () => {
		const md = "```cpp run\n#include <iostream>\nint main() { return 0; }\n```";
		const { html } = mdToHtml(md);

		expect(html).toContain('data-mode="two-step"');
		expect(html).toContain("bk-compile-btn");
		expect(html).toContain("Compile");
	});

	test("data-initial-code preserves original code for reset functionality", () => {
		const codeSnippet = "const a = 1;\nconst b = 2;\nconsole.log(a + b);";
		const md = `\`\`\`javascript run\n${codeSnippet}\n\`\`\``;
		const { html } = mdToHtml(md);

		expect(html).toContain("bk-code-runner");
		expect(html).toContain('data-initial-code="const a = 1;');
	});

	test("pre-renders line numbers matching code line count", () => {
		const code = "line 1\nline 2\nline 3\nline 4";
		const md = `\`\`\`javascript run\n${code}\n\`\`\``;
		const { html } = mdToHtml(md);

		expect(html).toContain(
			'<div class="bk-runner-lines" aria-hidden="true">1\n2\n3\n4</div>',
		);
	});

	test("challenge block with YAML frontmatter parses metadata and strips it from starter code", () => {
		const md = `\`\`\`python challenge
---
title: "Filter Even Squares"
expected: "[4, 16, 36]"
hint: "Use x % 2 == 0"
match: "exact"
---
numbers = [1, 2, 3, 4, 5, 6]
# Your code here:
\`\`\``;
		const { html } = mdToHtml(md);

		expect(html).toContain('data-challenge="true"');
		expect(html).toContain('data-expected="[4, 16, 36]"');
		expect(html).toContain('data-hint="Use x % 2 == 0"');
		expect(html).toContain('data-match="exact"');
		expect(html).toContain('data-title="Filter Even Squares"');
		expect(html).toContain("bk-runner-badge challenge");
		expect(html).not.toContain("bk-runner-target");
		expect(html).toContain("bk-hint-btn");
		expect(html).toContain("Check Answer");

		// Frontmatter is cleanly stripped from the editor textarea!
		expect(html).not.toContain('---&#10;title: "Filter Even Squares"');
		expect(html).toContain("numbers = [1, 2, 3, 4, 5, 6]");
	});

	test("challenge block with multi-line expected YAML output", () => {
		const md = `\`\`\`python challenge
---
title: "Multi-line Matrix"
expected: |
  1 4
  2 5
  3 6
---
print("1 4\\n2 5\\n3 6")
\`\`\``;
		const { html } = mdToHtml(md);

		expect(html).toContain('data-challenge="true"');
		expect(html).toContain('data-expected="1 4\n2 5\n3 6"');
	});

	test("challenge block with regex matching for dynamic outputs", () => {
		const md = `\`\`\`python challenge
---
title: "Dice Simulator"
match: regex
expected: ^Rolled: [1-6]$
---
import random
print(f"Rolled: {random.randint(1, 6)}")
\`\`\``;
		const { html } = mdToHtml(md);

		expect(html).toContain('data-challenge="true"');
		expect(html).toContain('data-match="regex"');
		expect(html).toContain('data-expected="^Rolled: [1-6]$"');
	});

	test("compiled language challenge renders as challenge with Check Answer button", () => {
		const md = `\`\`\`cpp challenge
---
title: "Vector Sum"
expected: "100"
---
#include <iostream>
int main() { std::cout << 100 << std::endl; return 0; }
\`\`\``;
		const { html } = mdToHtml(md);

		expect(html).toContain('data-challenge="true"');
		expect(html).toContain('data-lang="cpp"');
		expect(html).toContain('data-mode="run"');
		expect(html).toContain("bk-check-btn");
		expect(html).toContain("Check Answer");
		expect(html).toContain("C++ Challenge");
		expect(html).toContain("Vector Sum");
		expect(html).not.toContain("bk-runner-target");
	});

	test("challenge block with 'contains' match mode", () => {
		const md = `\`\`\`python challenge
---
title: "Contains Substring"
match: contains
expected: "passed"
---
print("all tests passed successfully")
\`\`\``;
		const { html } = mdToHtml(md);

		expect(html).toContain('data-challenge="true"');
		expect(html).toContain('data-match="contains"');
		expect(html).toContain('data-expected="passed"');
	});

	test("challenge title normalization strips redundant 'Quiz:' and 'Challenge:' prefixes", () => {
		const md1 = `\`\`\`python challenge
---
title: "Quiz: Even Numbers"
expected: "2, 4, 6"
---
print("2, 4, 6")
\`\`\``;
		const { html: html1 } = mdToHtml(md1);
		expect(html1).toContain('<span class="bk-runner-title">Even Numbers</span>');
		expect(html1).not.toContain('<span class="bk-runner-title">Quiz: Even Numbers</span>');

		const md2 = `\`\`\`rust challenge
---
title: "Challenge: Fibonacci Term"
expected: "55"
---
fn main() { println!("55"); }
\`\`\``;
		const { html: html2 } = mdToHtml(md2);
		expect(html2).toContain('<span class="bk-runner-title">Fibonacci Term</span>');
		expect(html2).not.toContain('<span class="bk-runner-title">Challenge: Fibonacci Term</span>');
		expect(html2).toContain("Rust Challenge");
	});

	test("highlightCode tokenizes JavaScript, Python, C++, and Go accurately", () => {
		const jsHl = highlightCode("const x = 42;", "javascript");
		expect(jsHl).toContain('class="token keyword"');
		expect(jsHl).toContain('class="token number"');

		const pyHl = highlightCode("def add(a, b):\n  return a + b", "python");
		expect(pyHl).toContain('class="token keyword"');
		expect(pyHl).toContain('class="token function"');

		const cppHl = highlightCode("int x = 10;", "cpp");
		expect(cppHl).toContain('class="token keyword"');

		const goHl = highlightCode("package main", "go");
		expect(goHl).toContain('class="token keyword"');
	});
});
