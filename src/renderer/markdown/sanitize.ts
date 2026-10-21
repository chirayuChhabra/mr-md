import matter from "@11ty/gray-matter";
import DOMPurify from "isomorphic-dompurify";
import { logger } from "../../cli/logger.js";
import { escAttr, escHtml } from "../blocks.js";
import { resolveAssetSrc } from "../utils.js";
import { normalizeLanguage, shiki } from "./highlighter.js";
import { marked } from "./math.js";
import { highlightCode } from "./runner-highlighter.js";

const COMPILED_LANGUAGES = new Set([
	"cpp",
	"c++",
	"c",
	"rust",
	"rs",
	"go",
	"golang",
	"java",
	"csharp",
	"cs",
	"c#",
	"zig",
	"swift",
	"haskell",
	"hs",
]);

const LANG_DISPLAY: Record<string, string> = {
	javascript: "JavaScript",
	js: "JavaScript",
	typescript: "TypeScript",
	ts: "TypeScript",
	python: "Python",
	py: "Python",
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
};

const domPurifyConfig = {
	USE_PROFILES: { html: true, mathMl: true, svg: true },
	ADD_TAGS: [
		"semantics",
		"annotation",
		"path",
		"svg",
		"polyline",
		"polygon",
		"rect",
		"line",
		"circle",
		"textarea",
	],
	ADD_ATTR: [
		"encoding",
		"d",
		"viewBox",
		"preserveAspectRatio",
		"data-lang",
		"data-initial-code",
		"data-editable",
		"data-autorun",
		"data-timeout",
		"data-title",
		"data-stdin",
		"data-challenge",
		"data-expected",
		"data-match",
		"data-hint",
		"data-mode",
		"points",
		"stroke",
		"stroke-width",
		"stroke-linecap",
		"stroke-linejoin",
		"fill",
		"spellcheck",
		"autocomplete",
		"autocapitalize",
		"readonly",
		"aria-hidden",
	],
};

export function sanitizeHtml(htmlRaw: string): string {
	return DOMPurify.sanitize(htmlRaw, domPurifyConfig);
}

import type { BuildOptions } from "../../types.js";

export function mdToHtml(
	md: string,
	options?: BuildOptions,
	_callerDir?: string,
): {
	html: string;
	title: string;
	headings: { id: string; text: string; level: number }[];
} {
	let title = "";

	// Extract first H1 or H2 as title
	const titleMatch = md.match(/^(?:#|##)\s+(.+)$/m);
	if (titleMatch) {
		title = titleMatch[1].trim();
	}

	const headings: { id: string; text: string; level: number }[] = [];
	let headingIdCounter = 0;

	const renderer = new marked.Renderer();
	renderer.heading = function (token) {
		const depth = token.depth;
		const rawText = token.text;
		const plainText = DOMPurify.sanitize(rawText.replace(/`/g, ""), {
			ALLOWED_TAGS: [],
		});
		const slug = plainText
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/(^-|-$)/g, "");
		const id = `bk-${slug}-${headingIdCounter++}`;
		if (depth === 2 || depth === 3) {
			headings.push({ id, text: plainText, level: depth });
		}
		const parsedText = sanitizeHtml(this.parser.parseInline(token.tokens));
		return `<h${depth} id="${id}" class="bk-heading-${depth}">${parsedText}</h${depth}>`;
	};

	renderer.hr = () => {
		return '<hr class="bk-divider">';
	};

	renderer.code = ({ text, lang }) => {
		const raw = (lang || "").trim();
		const tokens = raw.split(/\s+/);
		const rawLang = tokens[0] || "";
		const flags = tokens.slice(1);

		let studentCode = text;
		let frontmatterData: Record<string, unknown> = {};

		if (text.startsWith("---")) {
			try {
				const parsed = matter(text);
				studentCode = parsed.content.replace(/^\r?\n/, "");
				frontmatterData = parsed.data || {};
			} catch (_e) {
				// Forgiving fallback for unquoted YAML special characters (e.g., regex brackets [1-6])
				const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
				if (fmMatch) {
					studentCode = text.slice(fmMatch[0].length).replace(/^\r?\n/, "");
					for (const line of fmMatch[1].split("\n")) {
						const colonIdx = line.indexOf(":");
						if (colonIdx !== -1) {
							const k = line.slice(0, colonIdx).trim().toLowerCase();
							const v = line
								.slice(colonIdx + 1)
								.trim()
								.replace(/^["'](.*)["']$/, "$1");
							frontmatterData[k] = v;
						}
					}
				}
			}
		}

		const isChallengeFlag = flags.some(
			(f) => f === "challenge" || f === "quiz" || f === "test",
		);
		const isChallenge =
			isChallengeFlag ||
			Boolean(frontmatterData.expected) ||
			raw.includes("expected=");

		const isRunnable =
			isChallenge ||
			flags.some(
				(f) => f === "run" || f === "runnable" || f.startsWith("run="),
			);

		const safeLang = rawLang || "text";
		const normalizedLang = normalizeLanguage(rawLang);

		if (isRunnable) {
			const isEditable = !flags.some(
				(f) => f === "readonly" || f === "editable=false",
			);
			const autorun = flags.some(
				(f) => f === "autorun" || f === "autorun=true",
			);

			const timeoutMatch = raw.match(/\btimeout=(\d+)\b/);
			const timeout =
				(frontmatterData.timeout as number) ||
				(timeoutMatch ? parseInt(timeoutMatch[1], 10) : 3000);

			const titleMatch = raw.match(/\btitle=(["'])(.*?)\1/);
			const title =
				(frontmatterData.title as string) || (titleMatch ? titleMatch[2] : "");

			let displayTitle = title;
			if (isChallenge && displayTitle) {
				displayTitle = displayTitle.replace(/^(quiz|challenge)\s*:\s*/i, "");
			}

			const stdinMatch = raw.match(/\bstdin=(["'])(.*?)\1/);
			const stdin =
				(frontmatterData.stdin as string) || (stdinMatch ? stdinMatch[2] : "");

			const expectedMatch = raw.match(/\bexpected=(["'])(.*?)\1/);
			const expected =
				frontmatterData.expected != null
					? String(frontmatterData.expected).trimEnd()
					: expectedMatch
						? expectedMatch[2]
						: "";

			const matchMatch = raw.match(/\bmatch=(["'])(.*?)\1/);
			const match =
				(frontmatterData.match as string) ||
				(matchMatch ? matchMatch[2] : "exact");

			const hintMatch = raw.match(/\bhint=(["'])(.*?)\1/);
			const hint =
				(frontmatterData.hint as string) || (hintMatch ? hintMatch[2] : "");

			const modeMatch = raw.match(/\bmode=(["'])(compile|run|two-step)\1/);
			const defaultMode = isChallenge
				? "run"
				: COMPILED_LANGUAGES.has(normalizedLang)
					? "two-step"
					: "run";
			const mode =
				(frontmatterData.mode as string) ||
				(modeMatch ? modeMatch[2] : defaultMode);

			const lineCount = Math.max(1, studentCode.split("\n").length);
			const linesHtml = Array.from({ length: lineCount }, (_, i) => i + 1).join(
				"\n",
			);
			const highlightedCode = highlightCode(studentCode, normalizedLang);

			const langLabel = LANG_DISPLAY[normalizedLang] || safeLang.toUpperCase();

			return `<div class="bk-code-runner" data-lang="${escAttr(normalizedLang)}" data-initial-code="${escAttr(studentCode)}" data-editable="${isEditable ? "true" : "false"}" data-autorun="${autorun ? "true" : "false"}" data-timeout="${timeout}" data-mode="${escAttr(mode)}" ${isChallenge ? 'data-challenge="true"' : ""} ${expected ? `data-expected="${escAttr(expected)}"` : ""} ${match ? `data-match="${escAttr(match)}"` : ""} ${hint ? `data-hint="${escAttr(hint)}"` : ""} ${title ? `data-title="${escAttr(title)}"` : ""} ${stdin ? `data-stdin="${escAttr(stdin)}"` : ""}>
  <div class="bk-runner-header">
    <div class="bk-runner-header-left">
      ${
				isChallenge
					? `<span class="bk-runner-badge challenge">${escHtml(langLabel)} Challenge</span>`
					: `<span class="bk-runner-lang">${escHtml(safeLang)}</span>`
			}
      ${displayTitle ? `<span class="bk-runner-title">${escHtml(displayTitle)}</span>` : ""}
    </div>
    <div class="bk-runner-header-actions">
      ${
				hint
					? `<button type="button" class="bk-hint-btn" title="Toggle Hint">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        <span>Hint</span>
      </button>`
					: ""
			}
      ${
				mode === "two-step"
					? `<button type="button" class="bk-run-btn bk-compile-btn" title="Compile code (Ctrl+Enter)">
        <svg class="bk-run-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
          <polyline points="2 17 12 22 22 17"></polyline>
          <polyline points="2 12 12 17 22 12"></polyline>
        </svg>
        <span class="bk-run-text">Compile</span>
      </button>`
					: isChallenge
						? `<button type="button" class="bk-run-btn bk-check-btn" title="Check answer (Ctrl+Enter)">
        <svg class="bk-run-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span class="bk-run-text">Check Answer</span>
      </button>`
						: `<button type="button" class="bk-run-btn" title="Run code (Ctrl+Enter)">
        <svg class="bk-run-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span class="bk-run-text">Run</span>
      </button>`
			}
      ${
				isEditable
					? `<button type="button" class="bk-reset-btn" title="Reset code to original" aria-label="Reset code">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="1 4 1 10 7 10"></polyline>
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
        </svg>
      </button>`
					: ""
			}
      <button type="button" class="bk-copy-btn" title="Copy code" aria-label="Copy code">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>
    </div>
  </div>
  ${
		hint
			? `<div class="bk-runner-hint" style="display: none;">
    <div class="bk-hint-inner">
      <span class="bk-hint-icon">💡</span>
      <div class="bk-hint-text">${escHtml(hint)}</div>
    </div>
  </div>`
			: ""
	}
  <div class="bk-runner-editor-wrapper">
    <div class="bk-runner-lines" aria-hidden="true">${linesHtml}</div>
    <div class="bk-runner-code-area">
      <pre class="bk-runner-highlight" aria-hidden="true"><code class="bk-runner-code-layer language-${escAttr(normalizedLang)}">${highlightedCode}</code></pre>
      <textarea class="bk-runner-editor" spellcheck="false" autocomplete="off" autocapitalize="off" ${!isEditable ? "readonly" : ""}>${escHtml(studentCode)}</textarea>
    </div>
  </div>
  <div class="bk-runner-output" style="display: none;">
    <div class="bk-runner-output-header">
      <div class="bk-runner-output-title">
        <span>Output</span>
        <span class="bk-runner-status"></span>
        <span class="bk-runner-duration"></span>
      </div>
      <button type="button" class="bk-clear-btn" title="Clear output">Clear</button>
    </div>
    <div class="bk-runner-logs"></div>
  </div>
</div>`;
		}

		let highlightedHtml = `<pre><code>${escHtml(text)}</code></pre>`;

		if (shiki && normalizedLang !== "text") {
			try {
				highlightedHtml = shiki.codeToHtml(text, {
					lang: normalizedLang,
					themes: { light: "github-light", dark: "github-dark" },
				});
			} catch (_e) {
				highlightedHtml = `<pre><code>${escHtml(text)}</code></pre>`;
			}
		}

		return `<div class="bk-code-block">
          ${safeLang !== "text" ? `<div class="bk-code-header"><span class="bk-code-lang">${escHtml(safeLang)}</span></div>` : ""}
          <div class="bk-code-scroll">
            ${highlightedHtml}
          </div>
        </div>`;
	};

	renderer.image = ({ href, title, text }) => {
		let resolvedHref = href;
		if (options) {
			try {
				resolvedHref = resolveAssetSrc(href, options);
			} catch (e) {
				logger.error(
					`resolveAssetSrc failed: ${e instanceof Error ? e.message : e}`,
				);
			}
		}
		return `<img src="${resolvedHref}" alt="${text || ""}" title="${title || ""}" loading="lazy" decoding="async">`;
	};

	const processedMd = md.replace(
		/\|(\s*):(center|left|right):(\s*)(?=\|)/gi,
		(match, p1, p2, p3) => {
			const lower = p2.toLowerCase();
			if (lower === "center") return `|${p1}:-:${p3}`;
			if (lower === "left") return `|${p1}:---${p3}`;
			if (lower === "right") return `|${p1}---:${p3}`;
			return match;
		},
	);

	const htmlRaw = marked.parse(processedMd, { renderer }) as string;
	const html = sanitizeHtml(htmlRaw);

	return { html, title, headings };
}

export function mdInline(text: string): string {
	const htmlRaw = marked.parseInline(text) as string;
	return sanitizeHtml(htmlRaw);
}
