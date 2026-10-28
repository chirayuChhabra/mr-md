// @ts-nocheck
/**
 * Lightweight, zero-dependency, production-grade Code Autocomplete & Hints
 * for Mr Markdown's interactive code runners.
 */

export type AutocompleteKind =
	| "keyword"
	| "function"
	| "variable"
	| "property"
	| "snippet";

export interface AutocompleteItem {
	label: string;
	insertText?: string;
	kind: AutocompleteKind;
	detail?: string;
	cursorOffset?: number; // Relative to insertText start
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Offscreen Mirror Caret Coordinates Calculation
// ─────────────────────────────────────────────────────────────────────────────

const MIRROR_PROPERTIES = [
	"boxSizing",
	"width",
	"height",
	"overflowX",
	"overflowY",
	"borderTopWidth",
	"borderRightWidth",
	"borderBottomWidth",
	"borderLeftWidth",
	"borderStyle",
	"paddingTop",
	"paddingRight",
	"paddingBottom",
	"paddingLeft",
	"fontStyle",
	"fontVariant",
	"fontWeight",
	"fontStretch",
	"fontSize",
	"fontSizeAdjust",
	"lineHeight",
	"fontFamily",
	"textAlign",
	"textTransform",
	"textIndent",
	"textDecoration",
	"letterSpacing",
	"wordSpacing",
	"tabSize",
	"whiteSpace",
	"wordBreak",
	"wordWrap",
];

let cachedMirror: HTMLDivElement | null = null;

function getMirrorDiv(): HTMLDivElement {
	if (cachedMirror && document.body.contains(cachedMirror)) {
		return cachedMirror;
	}
	const div = document.createElement("div");
	div.id = "__bk_caret_mirror";
	div.style.position = "absolute";
	div.style.top = "0";
	div.style.left = "-9999px";
	div.style.visibility = "hidden";
	div.style.pointerEvents = "none";
	document.body.appendChild(div);
	cachedMirror = div;
	return div;
}

export function getCaretCoordinates(
	element: HTMLTextAreaElement,
	position: number,
): { top: number; left: number; lineHeight: number } {
	const mirror = getMirrorDiv();
	const computed = window.getComputedStyle(element);

	// Copy all layout and typography styles
	for (const prop of MIRROR_PROPERTIES) {
		mirror.style[prop as unknown as number] =
			computed[prop as unknown as number];
	}

	// Always respect textarea scroll and wrapping
	mirror.style.position = "absolute";
	mirror.style.visibility = "hidden";
	mirror.style.pointerEvents = "none";
	mirror.style.top = "0";
	mirror.style.left = "-9999px";

	// Put text up to cursor into mirror
	mirror.textContent = element.value.substring(0, position);

	const span = document.createElement("span");
	span.textContent = element.value.substring(position) || ".";
	mirror.appendChild(span);

	const borderTop = parseInt(computed.borderTopWidth || "0", 10) || 0;
	const borderLeft = parseInt(computed.borderLeftWidth || "0", 10) || 0;
	const lineHeight = parseInt(computed.lineHeight || "20", 10) || 20;

	return {
		top: span.offsetTop + borderTop,
		left: span.offsetLeft + borderLeft,
		lineHeight: Math.max(lineHeight, span.offsetHeight || 20),
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Language Keywords, Globals, Members & Snippets
// ─────────────────────────────────────────────────────────────────────────────

const JS_KEYWORDS = [
	"const",
	"let",
	"var",
	"function",
	"return",
	"async",
	"await",
	"if",
	"else",
	"for",
	"while",
	"do",
	"switch",
	"case",
	"break",
	"continue",
	"default",
	"try",
	"catch",
	"finally",
	"throw",
	"new",
	"class",
	"extends",
	"super",
	"this",
	"import",
	"export",
	"from",
	"as",
	"typeof",
	"instanceof",
	"in",
	"of",
	"yield",
	"null",
	"undefined",
	"true",
	"false",
	"interface",
	"type",
	"enum",
	"implements",
	"declare",
	"readonly",
];

const JS_GLOBALS = [
	"console",
	"Math",
	"JSON",
	"Promise",
	"Array",
	"Object",
	"String",
	"Number",
	"Boolean",
	"Date",
	"RegExp",
	"Map",
	"Set",
	"Error",
	"setTimeout",
	"setInterval",
	"clearTimeout",
	"clearInterval",
	"parseInt",
	"parseFloat",
	"fetch",
	"document",
	"window",
];

const JS_MEMBERS: Record<string, string[]> = {
	console: [
		"log",
		"error",
		"warn",
		"info",
		"table",
		"clear",
		"time",
		"timeEnd",
		"assert",
		"count",
		"dir",
		"trace",
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
		"sin",
		"cos",
		"tan",
	],
	JSON: ["stringify", "parse"],
	Object: [
		"keys",
		"values",
		"entries",
		"assign",
		"freeze",
		"seal",
		"hasOwn",
		"create",
		"getPrototypeOf",
	],
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
	window: [
		"addEventListener",
		"setTimeout",
		"setInterval",
		"clearTimeout",
		"clearInterval",
		"requestAnimationFrame",
		"localStorage",
		"fetch",
	],
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
	"concat",
	"flat",
	"flatMap",
	"sort",
	"reverse",
	"length",
	"toString",
	"trim",
	"toLowerCase",
	"toUpperCase",
	"replace",
	"replaceAll",
	"startsWith",
	"endsWith",
	"substring",
	"charAt",
	"entries",
	"keys",
	"values",
	"then",
	"catch",
	"finally",
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
	"break",
	"continue",
	"pass",
	"try",
	"except",
	"finally",
	"raise",
	"import",
	"from",
	"as",
	"with",
	"in",
	"is",
	"not",
	"and",
	"or",
	"lambda",
	"yield",
	"global",
	"nonlocal",
	"assert",
	"del",
	"True",
	"False",
	"None",
];

const PYTHON_GLOBALS = [
	"print",
	"len",
	"range",
	"enumerate",
	"zip",
	"map",
	"filter",
	"sum",
	"min",
	"max",
	"abs",
	"round",
	"sorted",
	"list",
	"dict",
	"set",
	"tuple",
	"str",
	"int",
	"float",
	"bool",
	"type",
	"isinstance",
	"input",
	"open",
	"reversed",
	"any",
	"all",
	"id",
	"dir",
	"help",
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
	"format",
];

const CPP_KEYWORDS = [
	"std::",
	"std::cout",
	"std::cin",
	"std::endl",
	"std::vector",
	"std::string",
	"size_t",
	"int",
	"char",
	"float",
	"double",
	"void",
	"bool",
	"long",
	"short",
	"unsigned",
	"signed",
	"const",
	"static",
	"auto",
	"sizeof",
	"struct",
	"class",
	"public",
	"private",
	"protected",
	"template",
	"typename",
	"namespace",
	"using",
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
	"default",
	"true",
	"false",
	"nullptr",
	"new",
	"delete",
	"try",
	"catch",
	"throw",
	"virtual",
	"override",
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
		"unordered_map",
		"unordered_set",
		"pair",
		"make_pair",
		"tuple",
		"make_tuple",
		"min",
		"max",
		"sort",
		"reverse",
		"find",
		"unique_ptr",
		"shared_ptr",
		"make_shared",
		"make_unique",
		"to_string",
		"stoi",
		"stod",
	],
};

const RUST_KEYWORDS = [
	"fn",
	"let",
	"mut",
	"pub",
	"struct",
	"enum",
	"impl",
	"trait",
	"type",
	"match",
	"if",
	"else",
	"loop",
	"while",
	"for",
	"in",
	"return",
	"break",
	"continue",
	"use",
	"mod",
	"as",
	"const",
	"static",
	"self",
	"Self",
	"true",
	"false",
	"where",
	"async",
	"await",
	"unsafe",
	"move",
];

const RUST_GLOBALS = [
	"println!",
	"print!",
	"format!",
	"vec!",
	"panic!",
	"assert!",
	"assert_eq!",
	"Option",
	"Result",
	"Some",
	"None",
	"Ok",
	"Err",
	"Vec",
	"String",
	"Box",
	"i32",
	"i64",
	"u32",
	"u64",
	"usize",
	"f64",
	"bool",
	"char",
];

const RUST_MEMBERS: Record<string, string[]> = {
	Vec: ["new", "with_capacity"],
	String: ["from", "new"],
	Option: ["Some", "None"],
	Result: ["Ok", "Err"],
};

const GO_KEYWORDS = [
	"func",
	"return",
	"package",
	"import",
	"var",
	"const",
	"type",
	"struct",
	"interface",
	"if",
	"else",
	"for",
	"range",
	"switch",
	"case",
	"default",
	"select",
	"chan",
	"go",
	"defer",
	"map",
	"break",
	"continue",
	"fallthrough",
	"make",
	"len",
	"cap",
	"append",
	"new",
	"panic",
	"recover",
	"nil",
	"true",
	"false",
];

const GO_MEMBERS: Record<string, string[]> = {
	fmt: ["Println", "Printf", "Sprintf", "Print", "Errorf", "Scanln"],
	strings: [
		"Contains",
		"Split",
		"Join",
		"HasPrefix",
		"HasSuffix",
		"ToLower",
		"ToUpper",
		"ReplaceAll",
		"TrimSpace",
	],
	os: ["Open", "Create", "ReadFile", "WriteFile", "Args", "Exit", "Getenv"],
};

// Snippet templates with cursor placeholder ($1)
const LANGUAGE_SNIPPETS: Record<string, AutocompleteItem[]> = {
	javascript: [
		{
			label: "clg",
			insertText: "console.log($1)",
			kind: "snippet",
			detail: "console.log(...)",
		},
		{
			label: "log",
			insertText: "console.log($1)",
			kind: "snippet",
			detail: "console.log(...)",
		},
		{
			label: "fn",
			insertText: "function $1() {\n  \n}",
			kind: "snippet",
			detail: "function declaration",
		},
		{
			label: "afn",
			insertText: "($1) => {\n  \n}",
			kind: "snippet",
			detail: "arrow function",
		},
		{
			label: "fori",
			insertText: "for (let i = 0; i < $1; i++) {\n  \n}",
			kind: "snippet",
			detail: "for loop",
		},
		{
			label: "prom",
			insertText: "new Promise((resolve, reject) => {\n  $1\n})",
			kind: "snippet",
			detail: "new Promise",
		},
	],
	python: [
		{
			label: "def",
			insertText: "def $1():\n    pass",
			kind: "snippet",
			detail: "def function",
		},
		{
			label: "pr",
			insertText: "print($1)",
			kind: "snippet",
			detail: "print(...)",
		},
		{
			label: "main",
			insertText: 'if __name__ == "__main__":\n    $1',
			kind: "snippet",
			detail: "main guard",
		},
		{
			label: "fori",
			insertText: "for i in range($1):\n    ",
			kind: "snippet",
			detail: "for range loop",
		},
	],
	cpp: [
		{
			label: "s",
			insertText: "std::",
			kind: "snippet",
			detail: "std:: namespace",
		},
		{
			label: "std",
			insertText: "std::",
			kind: "snippet",
			detail: "std:: namespace",
		},
		{
			label: "cout",
			insertText: "std::cout << $1 << std::endl;",
			kind: "snippet",
			detail: "std::cout stream",
		},
		{
			label: "scout",
			insertText: "std::cout << $1 << std::endl;",
			kind: "snippet",
			detail: "std::cout stream",
		},
		{
			label: "cin",
			insertText: "std::cin >> $1;",
			kind: "snippet",
			detail: "std::cin stream",
		},
		{
			label: "main",
			insertText: "int main() {\n    $1\n    return 0;\n}",
			kind: "snippet",
			detail: "main function",
		},
		{
			label: "fori",
			insertText: "for (int i = 0; i < $1; ++i) {\n    \n}",
			kind: "snippet",
			detail: "for loop",
		},
		{
			label: "inc",
			insertText: "#include <$1>",
			kind: "snippet",
			detail: "#include header",
		},
	],
	rust: [
		{
			label: "main",
			insertText: "fn main() {\n    $1\n}",
			kind: "snippet",
			detail: "main entrypoint",
		},
		{
			label: "pln",
			insertText: "println!($1);",
			kind: "snippet",
			detail: "println! macro",
		},
	],
	go: [
		{
			label: "main",
			insertText: "func main() {\n\t$1\n}",
			kind: "snippet",
			detail: "main function",
		},
		{
			label: "fp",
			insertText: "fmt.Println($1)",
			kind: "snippet",
			detail: "fmt.Println",
		},
	],
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Dynamic Buffer Identifier Extraction
// ─────────────────────────────────────────────────────────────────────────────

export function extractBufferIdentifiers(
	code: string,
	currentWord: string,
): AutocompleteItem[] {
	const words = code.match(/\b[a-zA-Z_$][a-zA-Z0-9_$]{2,}\b/g) || [];
	const seen = new Set<string>();
	const items: AutocompleteItem[] = [];

	for (const word of words) {
		if (word !== currentWord && !seen.has(word)) {
			seen.add(word);
			items.push({
				label: word,
				kind: "variable",
				detail: "identifier",
			});
		}
	}
	return items;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3b. String & Comment Context Detection
// ─────────────────────────────────────────────────────────────────────────────

export function isInsideStringOrComment(
	code: string,
	cursorPos: number,
	rawLang: string,
): boolean {
	const lang = rawLang.toLowerCase();
	const isPy = ["python", "py", "py3", "python3"].includes(lang);

	let inDouble = false;
	let inSingle = false;
	let inTripleDouble = false;
	let inTripleSingle = false;
	let inBacktick = false;
	let inLineComment = false;
	let inBlockComment = false;
	let templateExprDepth = 0;

	for (let i = 0; i < cursorPos; i++) {
		const ch = code[i];
		const next = i + 1 < code.length ? code[i + 1] : "";
		const next2 = i + 2 < code.length ? code[i + 2] : "";

		// 1. Line Comment
		if (inLineComment) {
			if (ch === "\n") {
				inLineComment = false;
			}
			continue;
		}

		// 2. Block Comment
		if (inBlockComment) {
			if (ch === "*" && next === "/") {
				inBlockComment = false;
				i++; // skip /
			}
			continue;
		}

		// 3. Python Triple Double Quotes
		if (inTripleDouble) {
			if (ch === "\\" && next) {
				i++; // skip escaped char
			} else if (ch === '"' && next === '"' && next2 === '"') {
				inTripleDouble = false;
				i += 2; // skip remaining quotes
			}
			continue;
		}

		// 4. Python Triple Single Quotes
		if (inTripleSingle) {
			if (ch === "\\" && next) {
				i++; // skip escaped char
			} else if (ch === "'" && next === "'" && next2 === "'") {
				inTripleSingle = false;
				i += 2; // skip remaining quotes
			}
			continue;
		}

		// 5. Standard Double-Quoted String
		if (inDouble) {
			if (ch === "\\" && next) {
				i++; // skip escaped char
			} else if (ch === '"') {
				inDouble = false;
			}
			continue;
		}

		// 6. Standard Single-Quoted String
		if (inSingle) {
			if (ch === "\\" && next) {
				i++; // skip escaped char
			} else if (ch === "'") {
				inSingle = false;
			}
			continue;
		}

		// 7. Backtick Template Literal (JS/TS)
		if (inBacktick) {
			if (ch === "\\" && next) {
				i++; // skip escaped char
			} else if (ch === "$" && next === "{") {
				templateExprDepth++;
				i++; // skip {
			} else if (ch === "`" && templateExprDepth === 0) {
				inBacktick = false;
			}
			continue;
		}

		// 8. Template expression inside JS/TS backticks ${ ... }
		if (templateExprDepth > 0) {
			if (ch === "}") {
				templateExprDepth--;
				if (templateExprDepth === 0) {
					inBacktick = true;
				}
				continue;
			}
		}

		// 9. Comments start
		if (isPy) {
			if (ch === "#") {
				inLineComment = true;
				continue;
			}
		} else {
			if (ch === "/" && next === "/") {
				inLineComment = true;
				i++;
				continue;
			}
			if (ch === "/" && next === "*") {
				inBlockComment = true;
				i++;
				continue;
			}
			if (
				ch === "#" &&
				(lang === "bash" || lang === "sh" || lang === "ruby" || lang === "r")
			) {
				inLineComment = true;
				continue;
			}
		}

		// 10. Strings start
		if (isPy && ch === '"' && next === '"' && next2 === '"') {
			inTripleDouble = true;
			i += 2;
			continue;
		}
		if (isPy && ch === "'" && next === "'" && next2 === "'") {
			inTripleSingle = true;
			i += 2;
			continue;
		}
		if (ch === '"') {
			inDouble = true;
		} else if (ch === "'") {
			inSingle = true;
		} else if (ch === "`" && !isPy) {
			inBacktick = true;
		}
	}

	return (
		inDouble ||
		inSingle ||
		inTripleDouble ||
		inTripleSingle ||
		(inBacktick && templateExprDepth === 0) ||
		inLineComment ||
		inBlockComment
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Suggestion Matcher & Ranker
// ─────────────────────────────────────────────────────────────────────────────

export function getCompletions(
	code: string,
	cursorPos: number,
	rawLang: string,
): { items: AutocompleteItem[]; replaceStart: number; prefix: string } | null {
	// Suppress suggestions when typing inside strings or comments
	if (isInsideStringOrComment(code, cursorPos, rawLang)) {
		return null;
	}

	const lang = rawLang.toLowerCase();
	const isJs = ["javascript", "js", "typescript", "ts", "node", "mjs"].includes(
		lang,
	);
	const isPy = ["python", "py", "py3", "python3"].includes(lang);
	const isCpp = ["cpp", "c++", "c"].includes(lang);
	const isRust = ["rust", "rs"].includes(lang);
	const isGo = ["go", "golang"].includes(lang);

	const textBeforeCursor = code.slice(0, cursorPos);

	// Check if typing member access: receiver followed by dot or ::
	// e.g. "console.l" or "std::co" or "users."
	const memberMatch = textBeforeCursor.match(
		/(?:([a-zA-Z0-9_$]+(?:\.[a-zA-Z0-9_$]+)*))(\.|::)([a-zA-Z0-9_$]*)$/,
	);

	if (memberMatch) {
		const receiver = memberMatch[1];
		const sep = memberMatch[2];
		const prefix = memberMatch[3];

		// Ignore numbers with decimal points (e.g. 3.14 or 100.)
		if (/^\d+$/.test(receiver)) {
			return null;
		}

		const replaceStart = cursorPos - prefix.length;
		const textAfterCursor = code.slice(cursorPos);
		const restOfWordMatch = textAfterCursor.match(/^[a-zA-Z0-9_$]*/);
		const replaceEnd =
			cursorPos + (restOfWordMatch ? restOfWordMatch[0].length : 0);

		let candidates: string[] = [];

		if (isJs) {
			if (JS_MEMBERS[receiver]) {
				candidates = JS_MEMBERS[receiver];
			} else if (sep === ".") {
				candidates = JS_COMMON_METHODS;
			}
		} else if (isPy) {
			if (receiver === "self") {
				// Suggest user's in-buffer variables and methods on self.
				candidates = extractBufferIdentifiers(code, "").map((b) => b.label);
			} else if (PYTHON_MEMBERS[receiver]) {
				candidates = PYTHON_MEMBERS[receiver];
			} else if (sep === ".") {
				candidates = PYTHON_COMMON_METHODS;
			}
		} else if (isCpp && (sep === "::" || sep === ".")) {
			if (CPP_MEMBERS[receiver]) {
				candidates = CPP_MEMBERS[receiver];
			}
		} else if (isRust && sep === "::") {
			if (RUST_MEMBERS[receiver]) {
				candidates = RUST_MEMBERS[receiver];
			}
		} else if (isGo && sep === ".") {
			if (GO_MEMBERS[receiver]) {
				candidates = GO_MEMBERS[receiver];
			}
		}

		if (candidates.length > 0) {
			let filtered = candidates.filter((c) =>
				c.toLowerCase().startsWith(prefix.toLowerCase()),
			);

			if (prefix.length > 0) {
				filtered = filtered.sort((a, b) => {
					// Exact prefix casing first
					const aExact = a.startsWith(prefix);
					const bExact = b.startsWith(prefix);
					if (aExact && !bExact) return -1;
					if (!aExact && bExact) return 1;
					return a.localeCompare(b);
				});
			}

			const items = filtered.map((label) => ({
				label,
				insertText: label,
				kind: "property" as AutocompleteKind,
				detail: `${receiver}${sep}${label}`,
			}));

			if (items.length > 0) {
				return { items: items.slice(0, 10), replaceStart, replaceEnd, prefix };
			}
		}
	}

	// Normal identifier / keyword completion
	const wordMatch = textBeforeCursor.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)$/);
	if (!wordMatch) return null;

	const prefix = wordMatch[1];
	// Trigger on word prefix of at least 1 character
	if (prefix.length < 1) return null;

	const replaceStart = cursorPos - prefix.length;
	const textAfterCursor = code.slice(cursorPos);
	const restOfWordMatch = textAfterCursor.match(/^[a-zA-Z0-9_$]*/);
	const replaceEnd =
		cursorPos + (restOfWordMatch ? restOfWordMatch[0].length : 0);
	const lowerPrefix = prefix.toLowerCase();

	const allItems: AutocompleteItem[] = [];

	// 1. Language Snippets
	const snippets =
		LANGUAGE_SNIPPETS[
			isJs
				? "javascript"
				: isPy
					? "python"
					: isCpp
						? "cpp"
						: isRust
							? "rust"
							: isGo
								? "go"
								: ""
		] || [];
	for (const snip of snippets) {
		if (snip.label.toLowerCase().startsWith(lowerPrefix)) {
			allItems.push(snip);
		}
	}

	// 2. Language Globals & Functions
	const globals = isJs
		? JS_GLOBALS
		: isPy
			? PYTHON_GLOBALS
			: isRust
				? RUST_GLOBALS
				: [];
	for (const fn of globals) {
		if (fn.toLowerCase().startsWith(lowerPrefix)) {
			allItems.push({
				label: fn,
				insertText: fn.includes("!") || fn === "print" ? `${fn}($1)` : fn,
				kind: "function",
				detail: "built-in",
			});
		}
	}

	// 3. Language Keywords
	const keywords = isJs
		? JS_KEYWORDS
		: isPy
			? PYTHON_KEYWORDS
			: isCpp
				? CPP_KEYWORDS
				: isRust
					? RUST_KEYWORDS
					: isGo
						? GO_KEYWORDS
						: [];
	for (const kw of keywords) {
		if (kw.toLowerCase().startsWith(lowerPrefix)) {
			allItems.push({
				label: kw,
				insertText: kw,
				kind: "keyword",
				detail: "keyword",
			});
		}
	}

	// 4. In-Buffer Identifiers
	const bufferItems = extractBufferIdentifiers(code, prefix);
	for (const item of bufferItems) {
		if (
			item.label.toLowerCase().startsWith(lowerPrefix) &&
			!allItems.some((existing) => existing.label === item.label)
		) {
			allItems.push(item);
		}
	}

	if (allItems.length === 0) return null;

	// Sort: Exact prefix case match first, then shorter labels, then alphabetically
	allItems.sort((a, b) => {
		const aExact = a.label.startsWith(prefix);
		const bExact = b.label.startsWith(prefix);
		if (aExact && !bExact) return -1;
		if (!aExact && bExact) return 1;

		// Exact snippet trigger match
		if (a.kind === "snippet" && a.label === prefix) return -1;
		if (b.kind === "snippet" && b.label === prefix) return 1;

		// Prioritize keywords and functions over variables
		const kindOrder: Record<AutocompleteKind, number> = {
			snippet: 0,
			keyword: 1,
			function: 2,
			property: 3,
			variable: 4,
		};
		const diff = kindOrder[a.kind] - kindOrder[b.kind];
		if (diff !== 0) return diff;

		return a.label.length - b.label.length || a.label.localeCompare(b.label);
	});

	return { items: allItems.slice(0, 10), replaceStart, replaceEnd, prefix };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Autocomplete Controller Class
// ─────────────────────────────────────────────────────────────────────────────

export class BkAutocomplete {
	private static activeInstance: BkAutocomplete | null = null;
	private textarea: HTMLTextAreaElement;
	private runner: HTMLElement;
	private popup: HTMLDivElement;
	public isOpen = false;
	private items: AutocompleteItem[] = [];
	private selectedIndex = 0;
	private replaceStart = 0;
	private replaceEnd = 0;
	private activePrefix = "";
	private onCodeChanged: () => void;

	constructor(
		textarea: HTMLTextAreaElement,
		runner: HTMLElement,
		onCodeChanged: () => void,
	) {
		this.textarea = textarea;
		this.runner = runner;
		this.onCodeChanged = onCodeChanged;

		// Create floating popup
		this.popup = document.createElement("div");
		this.popup.className = "bk-autocomplete-popup";
		this.popup.setAttribute("role", "listbox");
		this.popup.style.display = "none";
		document.body.appendChild(this.popup);

		this.bindEvents();
	}

	private bindEvents(): void {
		// Reposition or close when window resizes or document scrolls
		window.addEventListener("resize", () => {
			if (this.isOpen) this.close();
		});

		window.addEventListener(
			"scroll",
			() => {
				if (this.isOpen) this.close();
			},
			{ passive: true },
		);

		document.addEventListener("click", (e) => {
			if (
				this.isOpen &&
				!this.popup.contains(e.target as Node) &&
				e.target !== this.textarea
			) {
				this.close();
			}
		});
	}

	public handleInput(): void {
		if (this.textarea.hasAttribute("readonly")) {
			this.close();
			return;
		}

		const code = this.textarea.value;
		const cursorPos = this.textarea.selectionStart;
		const lang = this.runner.getAttribute("data-lang") || "javascript";

		const result = getCompletions(code, cursorPos, lang);
		if (!result || result.items.length === 0) {
			this.close();
			return;
		}

		this.items = result.items;
		this.replaceStart = result.replaceStart;
		this.replaceEnd = result.replaceEnd;
		this.activePrefix = result.prefix;
		this.selectedIndex = 0;

		this.render();
		this.position();
		this.show();
	}

	public handleKeyDown(e: KeyboardEvent): boolean {
		// Manual Trigger: Ctrl+Space (or Cmd+Space)
		if ((e.ctrlKey || e.metaKey) && e.code === "Space") {
			e.preventDefault();
			const code = this.textarea.value;
			const cursorPos = this.textarea.selectionStart;
			const lang = this.runner.getAttribute("data-lang") || "javascript";
			const result = getCompletions(code, cursorPos, lang);
			if (result && result.items.length > 0) {
				this.items = result.items;
				this.replaceStart = result.replaceStart;
				this.replaceEnd = result.replaceEnd;
				this.activePrefix = result.prefix;
				this.selectedIndex = 0;
				this.render();
				this.position();
				this.show();
				return true;
			}
			return false;
		}

		if (!this.isOpen) return false;

		// Shift+Tab should unindent, never accept autocomplete
		if (e.key === "Tab" && e.shiftKey) {
			this.close();
			return false;
		}

		// Cursor movement dismisses autocomplete cleanly
		if (
			e.key === "ArrowLeft" ||
			e.key === "ArrowRight" ||
			e.key === "Home" ||
			e.key === "End"
		) {
			this.close();
			return false;
		}

		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
				this.updateActiveItem();
				return true;

			case "ArrowUp":
				e.preventDefault();
				this.selectedIndex =
					(this.selectedIndex - 1 + this.items.length) % this.items.length;
				this.updateActiveItem();
				return true;

			case "Tab":
			case "Enter":
				e.preventDefault();
				this.selectItem(this.selectedIndex);
				return true;

			case "Escape":
				e.preventDefault();
				this.close();
				return true;

			case "PageDown":
				e.preventDefault();
				this.selectedIndex = Math.min(
					this.items.length - 1,
					this.selectedIndex + 4,
				);
				this.updateActiveItem();
				return true;

			case "PageUp":
				e.preventDefault();
				this.selectedIndex = Math.max(0, this.selectedIndex - 4);
				this.updateActiveItem();
				return true;

			default:
				return false;
		}
	}

	public selectItem(index: number): void {
		const item = this.items[index];
		if (!item) return;

		let insertText = item.insertText || item.label;
		let cursorTargetOffset = insertText.length;

		// Handle snippet placeholder ($1) or function call parens
		if (insertText.includes("$1")) {
			cursorTargetOffset = insertText.indexOf("$1");
			insertText = insertText.replace("$1", "");
		} else if (insertText.endsWith("()")) {
			cursorTargetOffset = insertText.length - 1; // Put cursor inside parens
		}

		const targetCursor = this.replaceStart + cursorTargetOffset;

		// Preserve native Undo stack via execCommand when possible
		this.textarea.focus();
		this.textarea.setSelectionRange(this.replaceStart, this.replaceEnd);

		if (document.queryCommandSupported?.("insertText")) {
			document.execCommand("insertText", false, insertText);
		} else {
			this.textarea.setRangeText(
				insertText,
				this.replaceStart,
				this.replaceEnd,
				"end",
			);
		}

		this.textarea.setSelectionRange(targetCursor, targetCursor);

		this.close();
		this.onCodeChanged();
	}

	private render(): void {
		this.popup.innerHTML = "";

		this.items.forEach((item, index) => {
			const row = document.createElement("div");
			row.className = `bk-autocomplete-item ${index === this.selectedIndex ? "active" : ""}`;
			row.setAttribute("role", "option");
			row.setAttribute(
				"aria-selected",
				index === this.selectedIndex ? "true" : "false",
			);

			// Prevent textarea blur when clicking dropdown items
			row.addEventListener("mousedown", (e) => {
				e.preventDefault();
				this.selectItem(index);
			});

			// Left: Label with highlighted matched prefix
			const labelEl = document.createElement("div");
			labelEl.className = "bk-autocomplete-label";

			if (
				this.activePrefix &&
				item.label.toLowerCase().startsWith(this.activePrefix.toLowerCase())
			) {
				const matchLen = this.activePrefix.length;
				const matchPart = item.label.slice(0, matchLen);
				const restPart = item.label.slice(matchLen);
				labelEl.innerHTML = `<span class="bk-autocomplete-match">${escapeHtml(matchPart)}</span>${escapeHtml(restPart)}`;
			} else {
				labelEl.textContent = item.label;
			}

			// Right: Type Badge (kw, fn, var, snip, prop)
			const badgeEl = document.createElement("span");
			const badgeClass =
				item.kind === "keyword"
					? "kw"
					: item.kind === "function"
						? "fn"
						: item.kind === "snippet"
							? "snip"
							: item.kind === "property"
								? "prop"
								: "var";
			const badgeText =
				item.kind === "keyword"
					? "kw"
					: item.kind === "function"
						? "fn"
						: item.kind === "snippet"
							? "snip"
							: item.kind === "property"
								? "prop"
								: "var";

			badgeEl.className = `bk-autocomplete-badge ${badgeClass}`;
			badgeEl.textContent = badgeText;

			row.appendChild(labelEl);
			row.appendChild(badgeEl);
			this.popup.appendChild(row);
		});

		// Subtle helpful keyboard hints footer
		const footerEl = document.createElement("div");
		footerEl.className = "bk-autocomplete-footer";
		footerEl.innerHTML =
			"<span><kbd>Tab</kbd> / <kbd>↵</kbd> select</span><span><kbd>Esc</kbd> exit</span>";
		this.popup.appendChild(footerEl);
	}

	private updateActiveItem(): void {
		const children = this.popup.children;
		for (let i = 0; i < children.length; i++) {
			const child = children[i] as HTMLElement;
			if (child.classList.contains("bk-autocomplete-footer")) continue;
			const isActive = i === this.selectedIndex;
			child.classList.toggle("active", isActive);
			child.setAttribute("aria-selected", isActive ? "true" : "false");
			if (isActive) {
				child.scrollIntoView({ block: "nearest" });
			}
		}
	}

	private position(): void {
		const cursorPos = this.textarea.selectionStart;
		const caretCoords = getCaretCoordinates(this.textarea, cursorPos);
		const textareaRect = this.textarea.getBoundingClientRect();

		// Calculate viewport coordinates
		const caretTopInViewport =
			textareaRect.top + (caretCoords.top - this.textarea.scrollTop);
		const caretLeftInViewport =
			textareaRect.left + (caretCoords.left - this.textarea.scrollLeft);

		// If caret is scrolled outside visible textarea boundaries, do not show
		if (
			caretTopInViewport < textareaRect.top ||
			caretTopInViewport > textareaRect.bottom ||
			caretLeftInViewport < textareaRect.left ||
			caretLeftInViewport > textareaRect.right
		) {
			this.close();
			return;
		}

		const popupHeight = 220; // estimated max height
		const popupWidth = 240;

		// Default placement: below the caret
		let top = caretTopInViewport + caretCoords.lineHeight + 4;

		// Flip above if not enough clearance at bottom of viewport
		if (top + popupHeight > window.innerHeight - 10) {
			top = Math.max(10, caretTopInViewport - popupHeight - 4);
		}

		// Horizontal clamping
		let left = caretLeftInViewport;
		if (left + popupWidth > window.innerWidth - 16) {
			left = Math.max(16, window.innerWidth - popupWidth - 16);
		}
		if (left < 16) left = 16;

		this.popup.style.top = `${Math.round(top)}px`;
		this.popup.style.left = `${Math.round(left)}px`;
	}

	public show(): void {
		if (
			BkAutocomplete.activeInstance &&
			BkAutocomplete.activeInstance !== this
		) {
			BkAutocomplete.activeInstance.close();
		}
		BkAutocomplete.activeInstance = this;

		this.isOpen = true;
		this.popup.style.display = "block";
		this.updateActiveItem();
	}

	public close(): void {
		if (BkAutocomplete.activeInstance === this) {
			BkAutocomplete.activeInstance = null;
		}
		this.isOpen = false;
		this.popup.style.display = "none";
	}

	public destroy(): void {
		this.close();
		if (this.popup.parentElement) {
			this.popup.parentElement.removeChild(this.popup);
		}
	}
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}
