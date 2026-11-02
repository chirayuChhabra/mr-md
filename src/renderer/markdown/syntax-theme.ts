import type { ThemeRegistration } from "shiki";

export const LANG_DISPLAY: Record<string, string> = {
	javascript: "JavaScript",
	js: "JavaScript",
	mjs: "JavaScript",
	typescript: "TypeScript",
	ts: "TypeScript",
	python: "Python",
	py: "Python",
	py3: "Python",
	cpp: "C++",
	"c++": "C++",
	c: "C",
	rust: "Rust",
	rs: "Rust",
	go: "Go",
	golang: "Go",
	java: "Java",
	csharp: "C#",
	cs: "C#",
	"c#": "C#",
	ruby: "Ruby",
	rb: "Ruby",
	php: "PHP",
	swift: "Swift",
	zig: "Zig",
	sql: "SQL",
	bash: "Bash",
	sh: "Shell",
	shell: "Shell",
	zsh: "Zsh",
	html: "HTML",
	css: "CSS",
	scss: "SCSS",
	sass: "Sass",
	json: "JSON",
	jsonc: "JSON",
	yaml: "YAML",
	yml: "YAML",
	toml: "TOML",
	markdown: "Markdown",
	md: "Markdown",
	mdx: "MDX",
	xml: "XML",
	dockerfile: "Dockerfile",
	docker: "Dockerfile",
	diff: "Diff",
	lua: "Lua",
	graphql: "GraphQL",
	gql: "GraphQL",
};

export function getLanguageDisplay(
	rawLang: string,
	normalizedLang: string,
): string {
	const rawLower = rawLang.toLowerCase();
	return (
		LANG_DISPLAY[normalizedLang] ||
		LANG_DISPLAY[rawLower] ||
		rawLang.toUpperCase()
	);
}

/**
 * Unified theme for Shiki using mr-md CSS design tokens as the single source of truth.
 * Outputs CSS variable references directly into inline styles so highlighting adapts dynamically
 * to active themes (Default, Neo, Playful) and light/dark modes with zero client runtime overhead.
 */
export const mrMdShikiTheme: ThemeRegistration = {
	name: "mr-md",
	type: "dark",
	colors: {
		"editor.background": "transparent",
		"editor.foreground": "var(--text-code)",
	},
	tokenColors: [
		{
			scope: [
				"keyword",
				"storage",
				"storage.type",
				"storage.modifier",
				"keyword.control",
				"keyword.other",
			],
			settings: { foreground: "var(--accent)", fontStyle: "bold" },
		},
		{
			scope: [
				"entity.name.function",
				"support.function",
				"entity.name.method",
				"meta.function-call.generic",
			],
			settings: { foreground: "var(--blue, #2563eb)" },
		},
		{
			scope: [
				"string",
				"string.quoted",
				"string.template",
				"punctuation.definition.string",
			],
			settings: { foreground: "var(--teal, #0d9488)" },
		},
		{
			scope: [
				"constant.numeric",
				"constant.language",
				"constant.character",
				"constant.other",
				"variable.other.property",
				"support.type.property-name",
				"entity.name.tag",
			],
			settings: { foreground: "var(--amber, #d97706)" },
		},
		{
			scope: [
				"keyword.operator",
				"keyword.operator.comparison",
				"keyword.operator.assignment",
				"keyword.operator.arithmetic",
				"keyword.operator.logical",
				"punctuation.separator.annotation.result.python",
			],
			settings: { foreground: "var(--violet, #7c3aed)", fontStyle: "" },
		},
		{
			scope: [
				"entity.name.type",
				"entity.name.class",
				"entity.other.inherited-class",
				"support.class",
				"support.type",
				"meta.indexed-name.python",
				"variable.other.unknown.vector",
			],
			settings: { foreground: "var(--blue, #2563eb)" },
		},
		{
			scope: ["meta.template.expression", "meta.embedded"],
			settings: { foreground: "var(--text-code)" },
		},
		{
			scope: [
				"comment",
				"comment.line",
				"comment.block",
				"punctuation.definition.comment",
			],
			settings: { foreground: "var(--muted)", fontStyle: "italic" },
		},
		{
			scope: [
				"punctuation",
				"punctuation.section.angle-brackets",
				"meta.brace",
			],
			settings: { foreground: "var(--faint)" },
		},
	],
};
