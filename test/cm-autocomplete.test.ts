import { describe, expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { cpp } from "@codemirror/lang-cpp";
import { rust } from "@codemirror/lang-rust";
import { syntaxTree } from "@codemirror/language";
import {
	createMrMdCompleter,
	isNodeInsideStringOrComment,
} from "../src/client/cm-editor.js";

function getCmCompletions(
	code: string,
	cursorPos: number,
	lang: string,
) {
	let langExt = javascript();
	if (["python", "py", "py3"].includes(lang)) langExt = python();
	if (["cpp", "c++", "c"].includes(lang)) langExt = cpp();
	if (["rust", "rs"].includes(lang)) langExt = rust();

	const state = EditorState.create({
		doc: code,
		selection: { anchor: cursorPos },
		extensions: [langExt],
	});

	const completer = createMrMdCompleter(lang);
	const context = {
		state,
		pos: cursorPos,
		explicit: false,
		matchBefore: (regex: RegExp) => {
			const line = state.doc.lineAt(cursorPos);
			const textBefore = line.text.slice(0, cursorPos - line.from);
			const pattern = new RegExp(regex.source + "$");
			const match = textBefore.match(pattern);
			if (!match) return null;
			const from = cursorPos - match[0].length;
			return { from, to: cursorPos, text: match[0] };
		},
	};

	return completer(context as any);
}

describe("CodeMirror 6 AST-Backed Autocomplete", () => {
	describe("F-String & Template Literal Expression Handling", () => {
		test("allows completion inside Python f-string replacement braces {expr}", () => {
			const code = `scores = [95, 88, 72]\nprint(f"so you mean it dont {sco")`;
			const cursorPos = code.length - 2; // right after "sco" inside {sco
			const result = getCmCompletions(code, cursorPos, "python");

			expect(result).not.toBeNull();
			const labels = result?.options.map((o) => o.label) || [];
			expect(labels).toContain("scores");
		});

		test("suppresses completion inside Python f-string literal text outside braces", () => {
			const code = `scores = [95, 88, 72]\nprint(f"so you mean it dont sco")`;
			const cursorPos = code.length - 2; // inside "sco" in literal string
			const result = getCmCompletions(code, cursorPos, "python");

			expect(result).toBeNull();
		});

		test("suppresses completion inside standard Python string literals", () => {
			const code = `scores = [95, 88, 72]\nprint("so you mean it dont sco")`;
			const cursorPos = code.length - 2;
			const result = getCmCompletions(code, cursorPos, "python");

			expect(result).toBeNull();
		});

		test("suppresses completion inside Python comments", () => {
			const code = `scores = [95, 88, 72]\n# check sco here`;
			const cursorPos = code.length;
			const result = getCmCompletions(code, cursorPos, "python");

			expect(result).toBeNull();
		});

		test("allows completion inside JavaScript template literal interpolation ${expr}", () => {
			const code = "const scores = [10, 20];\nconsole.log(`Student total: ${sco`);";
			const cursorPos = code.indexOf("${sco") + 5;
			const result = getCmCompletions(code, cursorPos, "javascript");

			expect(result).not.toBeNull();
			const labels = result?.options.map((o) => o.label) || [];
			expect(labels).toContain("scores");
		});

		test("suppresses completion inside JavaScript template literal plain text", () => {
			const code = "const scores = [10, 20];\nconsole.log(`Student total sco`);";
			const cursorPos = code.lastIndexOf("sco") + 3;
			const result = getCmCompletions(code, cursorPos, "javascript");

			expect(result).toBeNull();
		});
	});

	describe("Module Import Gating in Python", () => {
		test("does NOT suggest math members if math module is NOT imported", () => {
			const code = "math.sq";
			const result = getCmCompletions(code, code.length, "python");

			expect(result).toBeNull();
		});

		test("suggests math members when 'import math' is present", () => {
			const code = "import math\nmath.sq";
			const result = getCmCompletions(code, code.length, "python");

			expect(result).not.toBeNull();
			const labels = result?.options.map((o) => o.label) || [];
			expect(labels).toContain("sqrt");
		});

		test("suggests math members when 'from math import ...' is present", () => {
			const code = "from math import floor\nmath.fl";
			const result = getCmCompletions(code, code.length, "python");

			expect(result).not.toBeNull();
			const labels = result?.options.map((o) => o.label) || [];
			expect(labels).toContain("floor");
		});

		test("suggests math members with alias import 'import math as m'", () => {
			const code = "import math as m\nm.fl";
			const result = getCmCompletions(code, code.length, "python");

			expect(result).not.toBeNull();
			const labels = result?.options.map((o) => o.label) || [];
			expect(labels).toContain("floor");
		});

		test("suggests random module members only when random is imported", () => {
			const unimported = "random.ch";
			expect(getCmCompletions(unimported, unimported.length, "python")).toBeNull();

			const imported = "import random\nrandom.ch";
			const res = getCmCompletions(imported, imported.length, "python");
			expect(res).not.toBeNull();
			const labels = res?.options.map((o) => o.label) || [];
			expect(labels).toContain("choice");
		});
	});

	describe("C++ Autocompletion & std:: Namespace Handling", () => {
		test("suggests std:: when typing prefix 's'", () => {
			const code = "int main() {\n  s";
			const result = getCmCompletions(code, code.length, "cpp");

			expect(result).not.toBeNull();
			const labels = result?.options.map((o) => o.label) || [];
			expect(labels).toContain("std::");
		});

		test("suggests cout, cin, endl, vector on std:: namespace access", () => {
			const code = "#include <iostream>\nint main() {\n  std::";
			const result = getCmCompletions(code, code.length, "cpp");

			expect(result).not.toBeNull();
			const labels = result?.options.map((o) => o.label) || [];
			expect(labels).toContain("cout");
			expect(labels).toContain("cin");
			expect(labels).toContain("endl");
			expect(labels).toContain("vector");
		});

		test("filters std:: members by typed prefix like std::co", () => {
			const code = "std::co";
			const result = getCmCompletions(code, code.length, "cpp");

			expect(result).not.toBeNull();
			const labels = result?.options.map((o) => o.label) || [];
			expect(labels).toContain("cout");
			expect(labels).not.toContain("cin");
		});
	});

	describe("JavaScript & Rust Global & Keyword Completions", () => {
		test("suggests console methods on console.", () => {
			const code = "console.lo";
			const result = getCmCompletions(code, code.length, "javascript");

			expect(result).not.toBeNull();
			const labels = result?.options.map((o) => o.label) || [];
			expect(labels).toContain("log");
		});

		test("suggests clg snippet and const keyword on 'co'", () => {
			const code = "co";
			const result = getCmCompletions(code, code.length, "javascript");

			expect(result).not.toBeNull();
			const labels = result?.options.map((o) => o.label) || [];
			expect(labels).toContain("const");
			expect(labels).toContain("clg");
		});

		test("suggests println! snippet in Rust", () => {
			const code = "fn main() {\n  pri";
			const result = getCmCompletions(code, code.length, "rust");

			expect(result).not.toBeNull();
			const labels = result?.options.map((o) => o.label) || [];
			expect(labels).toContain("println!");
		});
	});
});
