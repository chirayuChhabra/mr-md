import { describe, expect, test } from "bun:test";
import {
	extractBufferIdentifiers,
	getCompletions,
	isInsideStringOrComment,
} from "../src/client/autocomplete.js";

describe("Code Editor Autocomplete & Hints Engine", () => {
	describe("extractBufferIdentifiers", () => {
		test("extracts distinct user-defined identifiers from code buffer", () => {
			const code = `
				const userAccount = { name: "Alice", balance: 500 };
				function calculateTotal(items) {
					let finalSum = 0;
					return finalSum;
				}
			`;
			const items = extractBufferIdentifiers(code, "calc");
			const labels = items.map((i) => i.label);

			expect(labels).toContain("userAccount");
			expect(labels).toContain("calculateTotal");
			expect(labels).toContain("finalSum");
			expect(labels).toContain("items");
			expect(labels).toContain("name");
			expect(labels).toContain("balance");
		});

		test("excludes current active word prefix and short tokens", () => {
			const code = "let total = 10; const tot = 5; let x = 1;";
			const items = extractBufferIdentifiers(code, "tot");
			const labels = items.map((i) => i.label);

			expect(labels).toContain("total");
			expect(labels).not.toContain("tot");
			expect(labels).not.toContain("x"); // length < 3
		});
	});

	describe("getCompletions - JavaScript / TypeScript", () => {
		test("suggests keywords and built-in globals on matching prefix", () => {
			const code = "con";
			const result = getCompletions(code, 3, "javascript");
			expect(result).not.toBeNull();
			expect(result?.prefix).toBe("con");

			const labels = result?.items.map((i) => i.label) || [];
			expect(labels).toContain("const");
			expect(labels).toContain("continue");
			expect(labels).toContain("console");
		});

		test("suggests snippets like clg with placeholder expansion", () => {
			const code = "clg";
			const result = getCompletions(code, 3, "javascript");
			expect(result).not.toBeNull();

			const clgItem = result?.items.find((i) => i.label === "clg");
			expect(clgItem).toBeDefined();
			expect(clgItem?.kind).toBe("snippet");
			expect(clgItem?.insertText).toBe("console.log($1)");
		});

		test("suggests dot-member properties for console", () => {
			const code = "console.";
			const result = getCompletions(code, 8, "javascript");
			expect(result).not.toBeNull();
			expect(result?.prefix).toBe("");

			const labels = result?.items.map((i) => i.label) || [];
			expect(labels).toContain("log");
			expect(labels).toContain("warn");
			expect(labels).toContain("error");
			expect(labels).toContain("table");
		});

		test("filters dot-member properties when typing prefix", () => {
			const code = "console.wa";
			const result = getCompletions(code, 10, "javascript");
			expect(result).not.toBeNull();
			expect(result?.prefix).toBe("wa");

			const labels = result?.items.map((i) => i.label) || [];
			expect(labels).toContain("warn");
			expect(labels).not.toContain("log");
		});

		test("suggests Math methods on Math.", () => {
			const code = "Math.fl";
			const result = getCompletions(code, 7, "javascript");
			expect(result).not.toBeNull();

			const labels = result?.items.map((i) => i.label) || [];
			expect(labels).toContain("floor");
			expect(labels).not.toContain("random");
		});

		test("suggests common object/array methods on unknown identifier dot", () => {
			const code = "const users = []; users.fi";
			const result = getCompletions(code, code.length, "javascript");
			expect(result).not.toBeNull();

			const labels = result?.items.map((i) => i.label) || [];
			expect(labels).toContain("filter");
			expect(labels).toContain("find");
			expect(labels).toContain("findIndex");
		});

		test("includes in-buffer variables alongside language keywords", () => {
			const code = "const maxRetries = 5;\nconst count = max";
			const result = getCompletions(code, code.length, "javascript");
			expect(result).not.toBeNull();

			const labels = result?.items.map((i) => i.label) || [];
			expect(labels).toContain("maxRetries");
		});
	});

	describe("getCompletions - Python", () => {
		test("suggests python keywords and built-in functions", () => {
			const code = "pri";
			const result = getCompletions(code, 3, "python");
			expect(result).not.toBeNull();

			const labels = result?.items.map((i) => i.label) || [];
			expect(labels).toContain("print");
		});

		test("suggests python snippets like def and main guard", () => {
			const code = "def";
			const result = getCompletions(code, 3, "python");
			expect(result).not.toBeNull();

			const defItem = result?.items.find((i) => i.kind === "snippet");
			expect(defItem).toBeDefined();
			expect(defItem?.insertText).toBe("def $1():\n    pass");
		});

		test("suggests math module methods on math.", () => {
			const code = "import math\nmath.sq";
			const result = getCompletions(code, code.length, "python");
			expect(result).not.toBeNull();

			const labels = result?.items.map((i) => i.label) || [];
			expect(labels).toContain("sqrt");
		});

		test("suggests common list/dict methods on obj.", () => {
			const code = "items = []\nitems.app";
			const result = getCompletions(code, code.length, "python");
			expect(result).not.toBeNull();

			const labels = result?.items.map((i) => i.label) || [];
			expect(labels).toContain("append");
		});
	});

	describe("getCompletions - C++ and Systems Languages", () => {
		test("suggests std:: namespace members on scope operator ::", () => {
			const code = "std::cou";
			const result = getCompletions(code, code.length, "cpp");
			expect(result).not.toBeNull();

			const labels = result?.items.map((i) => i.label) || [];
			expect(labels).toContain("cout");
			expect(labels).not.toContain("cin");
		});

		test("suggests C++ snippets like main function and cout stream", () => {
			const code = "main";
			const result = getCompletions(code, 4, "cpp");
			expect(result).not.toBeNull();

			const mainItem = result?.items.find((i) => i.kind === "snippet");
			expect(mainItem).toBeDefined();
			expect(mainItem?.insertText).toContain("int main()");
		});

		test("suggests Rust Vec:: methods on scope operator", () => {
			const code = "Vec::ne";
			const result = getCompletions(code, code.length, "rust");
			expect(result).not.toBeNull();

			const labels = result?.items.map((i) => i.label) || [];
			expect(labels).toContain("new");
		});

		test("suggests Go fmt. methods on dot operator", () => {
			const code = "fmt.Printl";
			const result = getCompletions(code, code.length, "go");
			expect(result).not.toBeNull();

			const labels = result?.items.map((i) => i.label) || [];
			expect(labels).toContain("Println");
		});
	});

	describe("Ranking and Limits", () => {
		test("limits total returned completions to top 10", () => {
			const code = "const a1 = 1, a2 = 2, a3 = 3, a4 = 4, a5 = 5, a6 = 6, a7 = 7, a8 = 8, a9 = 9, a10 = 10, a11 = 11;\na";
			const result = getCompletions(code, code.length, "javascript");
			expect(result).not.toBeNull();
			expect(result?.items.length).toBeLessThanOrEqual(10);
		});

		test("exact case prefix matches rank higher than case-insensitive matches", () => {
			const code = "const Array = []; const async = 1;\nAr";
			const result = getCompletions(code, code.length, "javascript");
			expect(result).not.toBeNull();
			// "Array" matches exact casing of "Ar", so it should be first
			expect(result?.items[0].label).toBe("Array");
		});
	});

	describe("String and Comment Context Suppression", () => {
		test("detects when cursor is inside string literals", () => {
			const code1 = 'const greeting = "hello con';
			expect(isInsideStringOrComment(code1, code1.length, "javascript")).toBe(true);

			const code2 = "const greeting = 'hello con";
			expect(isInsideStringOrComment(code2, code2.length, "javascript")).toBe(true);

			const code3 = 'const greeting = "hello"; con';
			expect(isInsideStringOrComment(code3, code3.length, "javascript")).toBe(false);
		});

		test("detects when cursor is inside comments", () => {
			const code1 = "// let me test con";
			expect(isInsideStringOrComment(code1, code1.length, "javascript")).toBe(true);

			const code2 = "/* multi-line comment con";
			expect(isInsideStringOrComment(code2, code2.length, "javascript")).toBe(true);

			const code3 = "# Python comment con";
			expect(isInsideStringOrComment(code3, code3.length, "python")).toBe(true);
		});

		test("detects Python triple-quoted strings", () => {
			const code = '"""This is a docstring with con';
			expect(isInsideStringOrComment(code, code.length, "python")).toBe(true);
		});

		test("allows completions inside template string expressions ${...}", () => {
			const code = "const s = `val: ${con";
			expect(isInsideStringOrComment(code, code.length, "javascript")).toBe(false);
		});

		test("suppresses getCompletions inside string literals and comments", () => {
			const stringCode = 'console.log("here is con';
			const resInside = getCompletions(stringCode, stringCode.length, "javascript");
			expect(resInside).toBeNull();

			const commentCode = "// con";
			const resComment = getCompletions(commentCode, commentCode.length, "javascript");
			expect(resComment).toBeNull();
		});
	});
});
