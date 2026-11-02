import {
	autocompletion,
	type Completion,
	type CompletionContext,
	type CompletionResult,
	closeBrackets,
	closeBracketsKeymap,
} from "@codemirror/autocomplete";
import {
	defaultKeymap,
	history,
	historyKeymap,
	indentWithTab,
	toggleComment,
} from "@codemirror/commands";
import { cpp } from "@codemirror/lang-cpp";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import {
	HighlightStyle,
	syntaxHighlighting,
	syntaxTree,
} from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import {
	EditorView,
	highlightActiveLineGutter,
	keymap,
	lineNumbers,
} from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { tags } from "@lezer/highlight";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Theme-Aware CodeMirror Syntax Highlighting Style
// ─────────────────────────────────────────────────────────────────────────────

export const mrMdHighlightStyle = HighlightStyle.define([
	{
		tag: tags.keyword,
		color: "var(--code-keyword, #c084fc)",
		fontWeight: "600",
	},
	{
		tag: [tags.string, tags.special(tags.string)],
		color: "var(--code-string, #a7f3d0)",
	},
	{
		tag: tags.number,
		color: "var(--code-number, #fde047)",
	},
	{
		tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
		color: "var(--code-function, #60a5fa)",
	},
	{
		tag: [tags.lineComment, tags.blockComment],
		color: "var(--faint, #71717a)",
		fontStyle: "italic",
	},
	{
		tag: tags.operator,
		color: "var(--code-operator, #f472b6)",
	},
	{
		tag: tags.propertyName,
		color: "var(--code-property, #38bdf8)",
	},
	{
		tag: tags.variableName,
		color: "var(--ink, #f0f0f0)",
	},
	{
		tag: tags.typeName,
		color: "var(--code-class, #34d399)",
	},
	{
		tag: tags.definition(tags.variableName),
		color: "var(--ink, #f0f0f0)",
	},
	{
		tag: tags.punctuation,
		color: "var(--faint, #94a3b8)",
	},
]);

// ─────────────────────────────────────────────────────────────────────────────
// 2. Editor Layout & Gutter Styling (Matching mr-md Pixel-for-Pixel)
// ─────────────────────────────────────────────────────────────────────────────

export const mrMdEditorTheme = EditorView.theme({
	"&": {
		backgroundColor: "transparent",
		color: "var(--ink, #f0f0f0)",
		fontFamily: "var(--font-mono, monospace)",
		fontSize: "13.5px",
		lineHeight: "1.6",
		height: "auto",
		maxHeight: "480px",
		width: "100%",
	},
	".cm-scroller": {
		overflow: "auto",
		fontFamily: "inherit",
		lineHeight: "inherit",
		padding: "16px 0",
	},
	".cm-content": {
		caretColor: "var(--ink, #f0f0f0)",
		padding: "0 16px 0 6px",
		fontFamily: "inherit",
		lineHeight: "inherit",
	},
	"&.cm-focused": {
		outline: "none",
	},
	".cm-gutters": {
		backgroundColor: "transparent",
		color: "var(--faint, #71717a)",
		border: "none",
		fontFamily: "inherit",
		fontSize: "13.5px",
		lineHeight: "1.6",
		padding: "0 8px 0 0",
		minWidth: "44px",
		userSelect: "none",
		opacity: "0.7",
	},
	".cm-gutterElement[style*='hidden'], .cm-gutterElement[style*='visibility: hidden']":
		{
			height: "0 !important",
			minHeight: "0 !important",
			lineHeight: "0 !important",
			overflow: "hidden !important",
			margin: "0 !important",
			padding: "0 !important",
		},
	".cm-gutterElement:not([style*='hidden']):not([style*='visibility: hidden'])":
		{
			height: "21.6px !important",
			minHeight: "21.6px !important",
			lineHeight: "21.6px !important",
			marginTop: "0 !important",
			boxSizing: "border-box",
			textAlign: "right",
			paddingRight: "8px",
			fontFamily: "inherit",
		},
	".cm-line": {
		lineHeight: "21.6px !important",
		minHeight: "21.6px !important",
		boxSizing: "border-box",
		fontFamily: "inherit",
	},
	".cm-activeLineGutter": {
		color: "var(--ink, #f0f0f0)",
		backgroundColor: "transparent",
		opacity: "1",
	},
	".cm-activeLine": {
		backgroundColor: "transparent",
	},
	".cm-selectionBackground, ::selection": {
		backgroundColor:
			"color-mix(in srgb, var(--accent) 35%, transparent) !important",
	},
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Language Grammars, Members and Import Gating
// ─────────────────────────────────────────────────────────────────────────────

const JS_MEMBERS: Record<string, string[]> = {
	console: [
		"log",
		"warn",
		"error",
		"info",
		"table",
		"clear",
		"time",
		"timeEnd",
		"assert",
		"count",
	],
	Math: [
		"floor",
		"ceil",
		"round",
		"abs",
		"max",
		"min",
		"random",
		"sqrt",
		"pow",
		"trunc",
		"sign",
		"PI",
		"E",
	],
	JSON: ["stringify", "parse"],
	Object: ["keys", "values", "entries", "assign", "freeze", "hasOwn"],
	Array: ["isArray", "from", "of"],
	Promise: ["resolve", "reject", "all", "allSettled", "race", "any"],
	document: [
		"querySelector",
		"querySelectorAll",
		"getElementById",
		"createElement",
		"addEventListener",
		"body",
		"head",
		"title",
	],
	window: ["addEventListener", "setTimeout", "setInterval", "fetch"],
};

const JS_COMMON_METHODS = [
	"map",
	"filter",
	"reduce",
	"forEach",
	"find",
	"findIndex",
	"some",
	"every",
	"includes",
	"indexOf",
	"slice",
	"splice",
	"join",
	"split",
	"push",
	"pop",
	"shift",
	"unshift",
	"sort",
	"reverse",
	"length",
	"toString",
	"trim",
	"replace",
	"replaceAll",
	"startsWith",
	"endsWith",
];

const JS_KEYWORDS = [
	"const",
	"let",
	"var",
	"function",
	"return",
	"if",
	"else",
	"for",
	"while",
	"switch",
	"case",
	"break",
	"continue",
	"try",
	"catch",
	"finally",
	"throw",
	"new",
	"typeof",
	"instanceof",
	"async",
	"await",
	"class",
	"import",
	"export",
	"from",
	"default",
	"null",
	"undefined",
	"true",
	"false",
];

const PYTHON_MEMBERS: Record<string, string[]> = {
	math: [
		"floor",
		"ceil",
		"sqrt",
		"pow",
		"sin",
		"cos",
		"tan",
		"pi",
		"e",
		"log",
		"radians",
		"degrees",
	],
	random: [
		"randint",
		"choice",
		"shuffle",
		"random",
		"sample",
		"uniform",
		"randrange",
	],
	sys: ["argv", "exit", "stdin", "stdout", "stderr", "path"],
	os: ["path", "environ", "listdir", "getcwd", "mkdir", "remove"],
	"os.path": [
		"join",
		"exists",
		"basename",
		"dirname",
		"split",
		"isfile",
		"isdir",
	],
	json: ["loads", "dumps", "load", "dump"],
};

const PYTHON_COMMON_METHODS = [
	"append",
	"extend",
	"insert",
	"remove",
	"pop",
	"clear",
	"index",
	"count",
	"sort",
	"reverse",
	"copy",
	"keys",
	"values",
	"items",
	"get",
	"update",
	"strip",
	"lower",
	"upper",
	"replace",
	"split",
	"join",
	"startswith",
	"endswith",
	"find",
];

const PYTHON_BUILTINS = [
	"print",
	"len",
	"range",
	"enumerate",
	"zip",
	"isinstance",
	"int",
	"str",
	"float",
	"list",
	"dict",
	"set",
	"tuple",
	"sorted",
	"sum",
	"min",
	"max",
	"abs",
	"round",
	"open",
	"type",
	"input",
];

const PYTHON_KEYWORDS = [
	"def",
	"class",
	"return",
	"if",
	"elif",
	"else",
	"for",
	"while",
	"try",
	"except",
	"finally",
	"with",
	"as",
	"import",
	"from",
	"yield",
	"lambda",
	"pass",
	"break",
	"continue",
	"in",
	"is",
	"not",
	"and",
	"or",
	"True",
	"False",
	"None",
];

const CPP_MEMBERS: Record<string, string[]> = {
	std: [
		"cout",
		"cin",
		"endl",
		"vector",
		"string",
		"map",
		"set",
		"pair",
		"make_pair",
		"min",
		"max",
		"sort",
		"reverse",
		"unique_ptr",
		"shared_ptr",
		"make_shared",
		"to_string",
		"stoi",
	],
};

const CPP_KEYWORDS = [
	"int",
	"char",
	"float",
	"double",
	"bool",
	"void",
	"auto",
	"const",
	"class",
	"struct",
	"template",
	"typename",
	"public",
	"private",
	"protected",
	"virtual",
	"return",
	"if",
	"else",
	"for",
	"while",
	"do",
	"switch",
	"case",
	"break",
	"continue",
	"new",
	"delete",
	"namespace",
	"using",
	"std",
];

const RUST_KEYWORDS = [
	"fn",
	"let",
	"mut",
	"pub",
	"struct",
	"enum",
	"impl",
	"trait",
	"match",
	"if",
	"else",
	"for",
	"while",
	"loop",
	"return",
	"break",
	"continue",
	"mod",
	"use",
	"as",
	"self",
	"super",
	"crate",
	"true",
	"false",
	"Option",
	"Result",
	"Some",
	"None",
	"Ok",
	"Err",
	"String",
	"Vec",
	"i32",
	"i64",
	"u32",
	"u64",
	"f64",
	"bool",
];

function isPythonModuleAvailable(
	code: string,
	receiver: string,
): string | null {
	if (PYTHON_MEMBERS[receiver]) {
		const directPattern = new RegExp(
			`\\b(import\\s+([^;\\n]+,)?\\s*${receiver}\\b|from\\s+${receiver}\\b)`,
		);
		if (directPattern.test(code)) return receiver;
	}
	// Check aliases: import math as m
	for (const mod of Object.keys(PYTHON_MEMBERS)) {
		const aliasPattern = new RegExp(
			`\\bimport\\s+${mod}\\s+as\\s+${receiver}\\b`,
		);
		if (aliasPattern.test(code)) return mod;
	}
	return null;
}

// AST-accurate string / comment checker:
export function isNodeInsideStringOrComment(node: SyntaxNode | null): boolean {
	let curr: SyntaxNode | null = node;
	let insideInterpolation = false;
	let insideString = false;
	let insideComment = false;

	while (curr) {
		if (
			curr.name === "FormatReplacement" ||
			curr.name === "Interpolation" ||
			curr.name === "InterpolationStart"
		) {
			insideInterpolation = true;
		}
		if (
			curr.name === "String" ||
			curr.name === "FormatString" ||
			curr.name === "TemplateString" ||
			curr.name === "StringLiteral" ||
			curr.name === "RawStringLiteral" ||
			curr.name === "CharacterLiteral"
		) {
			insideString = true;
		}
		if (
			curr.name === "LineComment" ||
			curr.name === "BlockComment" ||
			curr.name === "Comment"
		) {
			insideComment = true;
		}
		curr = curr.parent;
	}

	if (insideComment) return true;
	if (insideString && !insideInterpolation) return true;
	return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Grammar-Backed Autocompletion Source
// ─────────────────────────────────────────────────────────────────────────────

export function createMrMdCompleter(lang: string) {
	const isJs = ["javascript", "js", "typescript", "ts", "node", "mjs"].includes(
		lang,
	);
	const isPy = ["python", "py", "py3", "python3"].includes(lang);
	const isCpp = ["cpp", "c++", "c"].includes(lang);
	const isRust = ["rust", "rs"].includes(lang);

	return (context: CompletionContext): CompletionResult | null => {
		const tree = syntaxTree(context.state);
		const node = tree.resolveInner(context.pos, -1);

		// AST-accurate string and comment suppression:
		// True strings and comments suppress completion.
		// Expressions inside f-strings {expr} or template literals ${expr} are allowed!
		if (isNodeInsideStringOrComment(node)) {
			return null;
		}

		const code = context.state.doc.toString();
		const textBefore = code.slice(0, context.pos);

		// 1. Check member access (receiver. or receiver::)
		const memberMatch = textBefore.match(
			/(?:([a-zA-Z0-9_$]+(?:\.[a-zA-Z0-9_$]+)*))(\.|::)([a-zA-Z0-9_$]*)$/,
		);

		if (memberMatch) {
			const receiver = memberMatch[1];
			const sep = memberMatch[2];
			const prefix = memberMatch[3];

			if (/^\d+$/.test(receiver)) return null;

			let candidates: string[] = [];

			if (isJs) {
				if (JS_MEMBERS[receiver]) {
					candidates = JS_MEMBERS[receiver];
				} else if (sep === ".") {
					candidates = JS_COMMON_METHODS;
				}
			} else if (isPy) {
				if (receiver === "self") {
					const matches = code.match(/\b[a-zA-Z_]\w{2,}\b/g) || [];
					candidates = Array.from(new Set(matches));
				} else {
					const availableMod = isPythonModuleAvailable(code, receiver);
					if (availableMod) {
						candidates = PYTHON_MEMBERS[availableMod] || [];
					} else if (PYTHON_MEMBERS[receiver]) {
						// Known module, but NOT imported -> strict suppression!
						candidates = [];
					} else if (sep === ".") {
						// Generic object method completions
						candidates = PYTHON_COMMON_METHODS;
					}
				}
			} else if (isCpp && (sep === "::" || sep === ".")) {
				if (CPP_MEMBERS[receiver]) {
					candidates = CPP_MEMBERS[receiver];
				}
			}

			if (candidates.length > 0) {
				const from = context.pos - prefix.length;
				const options: Completion[] = candidates
					.filter((c) => c.toLowerCase().startsWith(prefix.toLowerCase()))
					.map((label) => ({
						label,
						type: "property",
						detail: "prop",
						boost: label.startsWith(prefix) ? 1 : 0,
					}));

				if (options.length > 0) {
					return {
						from,
						options: options.slice(0, 10),
						validFor: /^[a-zA-Z0-9_$]*$/,
					};
				}
			}
			return null;
		}

		// 2. Normal word completion
		const word = context.matchBefore(/[a-zA-Z_$][a-zA-Z0-9_$]*/);
		if (!word || (word.from === word.to && !context.explicit)) return null;

		const prefix = word.text;
		const lowerPrefix = prefix.toLowerCase();
		const options: Completion[] = [];

		// Language Snippets & Keywords
		if (isJs) {
			if (
				"console.log".startsWith(lowerPrefix) ||
				"clg".startsWith(lowerPrefix) ||
				"log".startsWith(lowerPrefix)
			) {
				options.push({
					label: "clg",
					displayLabel: "console.log()",
					type: "snippet",
					apply: "console.log()",
					detail: "snip",
					boost: 2,
				});
			}
			if ("function".startsWith(lowerPrefix) || "fn".startsWith(lowerPrefix)) {
				options.push({
					label: "fn",
					displayLabel: "function () {}",
					type: "snippet",
					apply: "function () {\n  \n}",
					detail: "snip",
					boost: 2,
				});
			}
			for (const kw of JS_KEYWORDS) {
				if (kw.toLowerCase().startsWith(lowerPrefix) && kw !== prefix) {
					options.push({
						label: kw,
						type: "keyword",
						detail: "kw",
						boost: 1,
					});
				}
			}
			for (const globalObj of Object.keys(JS_MEMBERS)) {
				if (
					globalObj.toLowerCase().startsWith(lowerPrefix) &&
					globalObj !== prefix
				) {
					options.push({
						label: globalObj,
						type: "variable",
						detail: "var",
						boost: 1,
					});
				}
			}
		} else if (isPy) {
			if ("print".startsWith(lowerPrefix) || "pri".startsWith(lowerPrefix)) {
				options.push({
					label: "print",
					type: "function",
					apply: "print()",
					detail: "fn",
					boost: 2,
				});
			}
			if ("def".startsWith(lowerPrefix)) {
				options.push({
					label: "def",
					type: "snippet",
					apply: "def function_name():\n    pass",
					detail: "snip",
					boost: 2,
				});
			}
			for (const kw of PYTHON_KEYWORDS) {
				if (kw.toLowerCase().startsWith(lowerPrefix) && kw !== prefix) {
					options.push({
						label: kw,
						type: "keyword",
						detail: "kw",
						boost: 1,
					});
				}
			}
			for (const fn of PYTHON_BUILTINS) {
				if (fn.toLowerCase().startsWith(lowerPrefix) && fn !== prefix) {
					options.push({
						label: fn,
						type: "function",
						apply: `${fn}()`,
						detail: "fn",
						boost: 1,
					});
				}
			}
		} else if (isCpp) {
			if (
				"std::".startsWith(lowerPrefix) ||
				"std".startsWith(lowerPrefix) ||
				prefix === "s"
			) {
				options.push({
					label: "std::",
					type: "snippet",
					apply: "std::",
					detail: "snip",
					boost: 3,
				});
			}
			if (
				"std::cout".startsWith(lowerPrefix) ||
				"cout".startsWith(lowerPrefix)
			) {
				options.push({
					label: "cout",
					displayLabel: "std::cout",
					type: "snippet",
					apply: "std::cout <<  << std::endl;",
					detail: "snip",
					boost: 2,
				});
			}
			for (const kw of CPP_KEYWORDS) {
				if (kw.toLowerCase().startsWith(lowerPrefix) && kw !== prefix) {
					options.push({
						label: kw,
						type: "keyword",
						detail: "kw",
						boost: 1,
					});
				}
			}
		} else if (isRust) {
			if ("println!".startsWith(lowerPrefix) || "pri".startsWith(lowerPrefix)) {
				options.push({
					label: "println!",
					type: "snippet",
					apply: 'println!("{}");',
					detail: "snip",
					boost: 2,
				});
			}
			for (const kw of RUST_KEYWORDS) {
				if (kw.toLowerCase().startsWith(lowerPrefix) && kw !== prefix) {
					options.push({
						label: kw,
						type: "keyword",
						detail: "kw",
						boost: 1,
					});
				}
			}
		}

		// In-buffer variables declared above cursor
		const codeAbove = code.slice(0, word.from);
		const idMatches = codeAbove.match(/\b[a-zA-Z_$][a-zA-Z0-9_$]{2,}\b/g) || [];
		const seen = new Set<string>();

		for (const opt of options) {
			seen.add(opt.label);
		}

		for (const id of idMatches) {
			if (
				id !== prefix &&
				!seen.has(id) &&
				id.toLowerCase().startsWith(lowerPrefix)
			) {
				seen.add(id);
				options.push({
					label: id,
					type: "variable",
					detail: "var",
					boost: id.startsWith(prefix) ? 1 : 0,
				});
			}
		}

		// Sort by boost descending, then alphabetically
		options.sort((a, b) => {
			const bBoost = b.boost || 0;
			const aBoost = a.boost || 0;
			if (bBoost !== aBoost) return bBoost - aBoost;
			return a.label.localeCompare(b.label);
		});

		return {
			from: word.from,
			options: options.slice(0, 10),
			validFor: /^[a-zA-Z0-9_$]*$/,
		};
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. CodeMirror Editor Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createCodeMirrorEditor(
	runner: HTMLElement,
	textarea: HTMLTextAreaElement,
	onCodeChange: () => void,
	onRunShortcut: () => void,
): EditorView {
	const initialCode = textarea.value;
	const lang = (runner.getAttribute("data-lang") || "javascript").toLowerCase();
	const isEditable = runner.getAttribute("data-editable") !== "false";

	const extensions = [
		mrMdEditorTheme,
		syntaxHighlighting(mrMdHighlightStyle),
		lineNumbers(),
		highlightActiveLineGutter(),
		history(),
		closeBrackets(),
		autocompletion({
			override: [createMrMdCompleter(lang)],
			defaultKeymap: true,
		}),
		EditorView.updateListener.of((update) => {
			if (update.docChanged) {
				textarea.value = update.state.doc.toString();
				onCodeChange();
			}
		}),
		keymap.of([
			{
				key: "Mod-Enter",
				run: () => {
					onRunShortcut();
					return true;
				},
			},
			{
				key: "Mod-/",
				run: toggleComment,
			},
			...closeBracketsKeymap,
			...defaultKeymap,
			...historyKeymap,
			indentWithTab,
		]),
	];

	if (!isEditable) {
		extensions.push(EditorState.readOnly.of(true));
	}

	// Add language parser
	if (["javascript", "js", "typescript", "ts", "node", "mjs"].includes(lang)) {
		extensions.push(javascript({ typescript: lang.includes("ts") }));
	} else if (["python", "py", "py3", "python3"].includes(lang)) {
		extensions.push(python());
	} else if (["cpp", "c++", "c"].includes(lang)) {
		extensions.push(cpp());
	} else if (["rust", "rs"].includes(lang)) {
		extensions.push(rust());
	}

	const state = EditorState.create({
		doc: initialCode,
		extensions,
	});

	// Find the editor wrapper or parent
	const wrapper =
		runner.querySelector(".bk-runner-editor-wrapper") ||
		textarea.parentElement ||
		runner;

	const view = new EditorView({
		state,
		parent: wrapper,
	});

	// Keep textarea accessible for DOM events / tests while hiding visually
	textarea.style.position = "absolute";
	textarea.style.top = "0";
	textarea.style.left = "0";
	textarea.style.width = "1px";
	textarea.style.height = "1px";
	textarea.style.opacity = "0";
	textarea.style.pointerEvents = "none";
	textarea.style.zIndex = "-1";

	// Hide legacy static SSG highlight pre and line numbers so CodeMirror's live gutters show cleanly
	const highlightPre = runner.querySelector(
		".bk-runner-highlight",
	) as HTMLElement | null;
	if (highlightPre) highlightPre.style.display = "none";
	const linesEl = runner.querySelector(
		".bk-runner-lines",
	) as HTMLElement | null;
	if (linesEl) linesEl.style.display = "none";

	// Listen for input events dispatched directly to textarea (e.g. from tests or scripts)
	textarea.addEventListener("input", () => {
		const docText = view.state.doc.toString();
		if (docText !== textarea.value) {
			view.dispatch({
				changes: { from: 0, to: docText.length, insert: textarea.value },
			});
		}
	});

	if (typeof IntersectionObserver !== "undefined") {
		const observer = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					view.requestMeasure();
				}
			}
		});
		observer.observe(runner);
	}

	return view;
}
