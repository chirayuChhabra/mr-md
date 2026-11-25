import DOMPurify from "isomorphic-dompurify";
import { marked } from "marked";

const entities = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

export function escapeHtml(value) {
	return String(value).replace(/[&<>"']/g, (character) => entities[character]);
}

export default {
	render({ block, index, options }) {
		if (block.type !== "markdown" && block.type !== "heading") {
			throw new Error(`Field Notes expects inline Markdown, received ${block.type}`);
		}

		const renderer = new marked.Renderer();
		const navItems = [];
		let headingIndex = 0;
		renderer.heading = function (token) {
			const id = `field-note-${index}-${headingIndex++}`;
			const depth = Math.max(2, token.depth);
			const label = DOMPurify.sanitize(this.parser.parseInline(token.tokens), {
				ALLOWED_TAGS: [],
				ALLOWED_ATTR: [],
			});
			if (depth === 2) navItems.push({ id, label, kind: "heading" });
			return `<h${depth} id="${id}">${this.parser.parseInline(token.tokens)}</h${depth}>`;
		};
		if (options.codeRenderer) {
			renderer.code = ({ text, lang }) =>
				options.codeRenderer({ code: text, language: lang ?? "", options });
		}

		const markdown = block.type === "heading" && !block.src.startsWith("#")
			? `## ${block.src}`
			: block.src;
		const html = DOMPurify.sanitize(marked.parse(markdown, { renderer }));
		return { html: `<div class="field-prose">${html}</div>`, navItems };
	},
};
