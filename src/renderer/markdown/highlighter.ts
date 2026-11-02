import { marked } from "marked";
import {
	type BundledLanguage,
	bundledLanguages,
	createHighlighter,
	type Highlighter,
} from "shiki";

export let shiki: Highlighter | undefined;

export const COMMON_LANGUAGES: BundledLanguage[] = [
	"asm",
	"javascript",
	"typescript",
	"jsx",
	"tsx",
	"json",
	"jsonc",
	"html",
	"css",
	"scss",
	"sass",
	"less",
	"bash",
	"shellscript",
	"rust",
	"markdown",
	"mdx",
	"yaml",
	"toml",
	"xml",
	"cpp",
	"c",
	"csharp",
	"java",
	"kotlin",
	"swift",
	"go",
	"python",
	"ruby",
	"php",
	"perl",
	"sql",
	"graphql",
	"prisma",
	"dockerfile",
	"makefile",
	"diff",
	"lua",
	"r",
	"matlab",
	"zig",
	"solidity",
	"latex",
	"wasm",
	"ini",
	"vue",
	"svelte",
	"astro",
	"dart",
	"scala",
	"elixir",
	"clojure",
	"haskell",
	"ocaml",
	"powershell",
	"cmake",
	"glsl",
	"wgsl",
];

export const LANGUAGE_ALIASES: Record<string, string> = {
	assembly: "asm",
	x86: "asm",
	nasm: "asm",
	"c++": "cpp",
	cpp: "cpp",
	"c#": "csharp",
	cs: "csharp",
	csharp: "csharp",
	py: "python",
	python: "python",
	py3: "python",
	python3: "python",
	js: "javascript",
	javascript: "javascript",
	node: "javascript",
	nodejs: "javascript",
	ts: "typescript",
	typescript: "typescript",
	jsx: "jsx",
	tsx: "tsx",
	sh: "bash",
	bash: "bash",
	shell: "bash",
	shellscript: "shellscript",
	zsh: "bash",
	console: "bash",
	terminal: "bash",
	cmd: "powershell",
	ps: "powershell",
	ps1: "powershell",
	powershell: "powershell",
	yml: "yaml",
	yaml: "yaml",
	md: "markdown",
	markdown: "markdown",
	mdx: "mdx",
	rb: "ruby",
	ruby: "ruby",
	golang: "go",
	go: "go",
	rs: "rust",
	rust: "rust",
	kt: "kotlin",
	kts: "kotlin",
	kotlin: "kotlin",
	docker: "dockerfile",
	dockerfile: "dockerfile",
	tex: "latex",
	latex: "latex",
	make: "makefile",
	makefile: "makefile",
	htm: "html",
	html: "html",
	svg: "xml",
	xml: "xml",
	json: "json",
	jsonc: "jsonc",
	toml: "toml",
	ini: "ini",
	scss: "scss",
	sass: "sass",
	less: "less",
	css: "css",
	sql: "sql",
	mysql: "sql",
	pgsql: "sql",
	postgres: "sql",
	postgresql: "sql",
	plsql: "sql",
	graphql: "graphql",
	gql: "graphql",
	txt: "text",
	text: "text",
	plain: "text",
	plaintext: "text",
};

export function normalizeLanguage(lang?: string): string {
	if (!lang) return "text";
	const raw = lang.trim().split(/\s+/)[0].toLowerCase();
	return LANGUAGE_ALIASES[raw] || raw;
}

export async function initHighlighter(): Promise<Highlighter> {
	if (!shiki) {
		shiki = await createHighlighter({
			themes: ["github-dark", "github-light"],
			langs: COMMON_LANGUAGES,
		});
	}
	return shiki;
}

export async function ensureLanguageLoaded(lang?: string): Promise<void> {
	if (!lang) return;
	const normalized = normalizeLanguage(lang);
	if (normalized === "text") return;

	if (!shiki) {
		await initHighlighter();
	}

	if (
		shiki &&
		!shiki.getLoadedLanguages().includes(normalized) &&
		normalized in bundledLanguages
	) {
		try {
			await shiki.loadLanguage(normalized as BundledLanguage);
		} catch (_e) {
			// Fall back silently
		}
	}
}

export async function preloadLanguagesFromMarkdown(
	markdown: string,
): Promise<void> {
	const tokens = marked.lexer(markdown);
	const langsToLoad = new Set<string>();

	marked.walkTokens(tokens, (token) => {
		if (token.type === "code" && token.lang) {
			langsToLoad.add(token.lang);
		}
	});

	for (const lang of langsToLoad) {
		await ensureLanguageLoaded(lang);
	}
}
