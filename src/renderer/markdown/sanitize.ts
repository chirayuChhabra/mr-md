import DOMPurify from "isomorphic-dompurify";
import { logger } from "../../cli/logger.js";
import { escHtml } from "../blocks.js";
import { resolveAssetSrc } from "../utils.js";
import { normalizeLanguage, shiki } from "./highlighter.js";
import { marked } from "./math.js";

const domPurifyConfig = {
	USE_PROFILES: { html: true, mathMl: true, svg: true },
	ADD_TAGS: ["semantics", "annotation", "path"],
	ADD_ATTR: ["encoding", "d", "viewBox", "preserveAspectRatio"],
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
	renderer.heading = ({ depth, text }) => {
		const plainText = text.replace(/<[^>]+>/g, "");
		const slug = plainText
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/(^-|-$)/g, "");
		const id = `bk-${slug}-${headingIdCounter++}`;
		if (depth === 2 || depth === 3) {
			const plainText = text.replace(/<[^>]+>/g, "");
			headings.push({ id, text: plainText, level: depth });
		}
		return `<h${depth} id="${id}" class="bk-heading-${depth}">${text}</h${depth}>`;
	};

	renderer.hr = () => {
		return '<hr class="bk-divider">';
	};

	renderer.code = ({ text, lang }) => {
		const rawLang = lang ? lang.trim().split(/\s+/)[0] : "";
		const safeLang = rawLang || "text";
		const normalizedLang = normalizeLanguage(rawLang);

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
