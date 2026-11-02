import Prism from "prismjs";

// Ensure global Prism exists so individual component scripts register their grammars
const g = globalThis as typeof globalThis & {
	Prism?: typeof Prism;
};
if (typeof globalThis !== "undefined" && !g.Prism) {
	g.Prism = Prism;
}

// Load grammars in correct dependency order
import "prismjs/components/prism-clike.js";
import "prismjs/components/prism-javascript.js";
import "prismjs/components/prism-typescript.js";
import "prismjs/components/prism-python.js";
import "prismjs/components/prism-c.js";
import "prismjs/components/prism-cpp.js";
import "prismjs/components/prism-csharp.js";
import "prismjs/components/prism-java.js";
import "prismjs/components/prism-rust.js";
import "prismjs/components/prism-go.js";
import "prismjs/components/prism-bash.js";
import "prismjs/components/prism-ruby.js";
import "prismjs/components/prism-markup-templating.js";
import "prismjs/components/prism-php.js";
import "prismjs/components/prism-lua.js";
import "prismjs/components/prism-swift.js";
import "prismjs/components/prism-zig.js";
import "prismjs/components/prism-sql.js";

// Align Prism Python grammar with modern Python 3 (functions, builtins, keywords, return arrow)
if (Prism.languages.python) {
	Prism.languages.python.keyword =
		/\b(?:_(?=\s*:)|and|as|assert|async|await|break|case|class|continue|def|del|elif|else|except|exec|finally|for|from|global|if|import|in|is|lambda|match|nonlocal|not|or|pass|raise|return|try|while|with|yield)\b/;
	Prism.languages.python.function = /\b[a-zA-Z_]\w*(?=\s*\()/;
	Prism.languages.python.operator =
		/->|[-+%=]=?|!=|:=|\*\*?=?|\/\/?=?|<[<=>]?|>[=>]?|[&|^~]/;
}

// Align Prism C++ grammar (generic templates, standard library types)
if (Prism.languages.cpp) {
	Prism.languages.insertBefore("cpp", "class-name", {
		"generic-type": {
			pattern: /\b[a-zA-Z_]\w*\s*<[^<>;=+\-*/%&|^]+>/,
			inside: {
				"class-name": /^\b[a-zA-Z_]\w*/,
				keyword: Prism.languages.cpp.keyword,
				punctuation: /[<>,:]/,
				"stl-type": {
					pattern:
						/\b(?:vector|string|wstring|string_view|array|deque|list|forward_list|map|set|multimap|multiset|unordered_map|unordered_set|unordered_multimap|unordered_multiset|stack|queue|priority_queue|pair|tuple|optional|variant|any|unique_ptr|shared_ptr|weak_ptr|span)\b/,
					alias: "class-name",
				},
			},
		},
		"stl-type": {
			pattern:
				/\b(?:vector|string|wstring|string_view|array|deque|list|forward_list|map|set|multimap|multiset|unordered_map|unordered_set|unordered_multimap|unordered_multiset|stack|queue|priority_queue|pair|tuple|optional|variant|any|unique_ptr|shared_ptr|weak_ptr|span)\b|\b[a-zA-Z_]\w*(?=\s*<[a-zA-Z_])/,
			alias: "class-name",
		},
	});
}

const LANG_MAP: Record<string, string> = {
	js: "javascript",
	javascript: "javascript",
	mjs: "javascript",
	node: "javascript",
	nodejs: "javascript",
	ts: "typescript",
	typescript: "typescript",
	py: "python",
	python: "python",
	py3: "python",
	python3: "python",
	c: "c",
	cpp: "cpp",
	"c++": "cpp",
	cs: "csharp",
	csharp: "csharp",
	"c#": "csharp",
	java: "java",
	rs: "rust",
	rust: "rust",
	go: "go",
	golang: "go",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	shell: "bash",
	rb: "ruby",
	ruby: "ruby",
	php: "php",
	lua: "lua",
	swift: "swift",
	zig: "zig",
	sql: "sql",
	html: "html",
	css: "css",
	xml: "xml",
	json: "javascript",
};

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

export function highlightCode(code: string, lang: string): string {
	const normalized = (
		LANG_MAP[lang.toLowerCase()] || lang.toLowerCase()
	).trim();
	const grammar = Prism.languages[normalized];
	if (!grammar) {
		return escapeHtml(code);
	}
	try {
		return Prism.highlight(code, grammar, normalized);
	} catch (_e) {
		return escapeHtml(code);
	}
}

export { Prism };
