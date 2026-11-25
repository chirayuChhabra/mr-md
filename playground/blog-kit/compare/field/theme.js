import { readFileSync } from "node:fs";
import { escapeHtml } from "./content.js";

const css = readFileSync(new URL("./field.css", import.meta.url), "utf8");

function renderContents(items) {
	if (!items.length) return "";
	return `<nav class="field-index" aria-label="On this page">
		<p>In this notebook</p>
		<ol>${items.map(({ href, label }) =>
			`<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`
		).join("")}</ol>
	</nav>`;
}

function renderChapter(chapter) {
	return `<ul class="field-chapter">${chapter.lessons.map(({ meta }) =>
		`<li><a href="./${encodeURIComponent(meta.slug)}.html">${escapeHtml(meta.title)}</a>
		${meta.description ? `<p>${escapeHtml(meta.description)}</p>` : ""}</li>`
	).join("")}</ul>`;
}

export default {
	render({ lesson, chapter, bodyHtml, navItems }) {
		const meta = lesson?.meta ?? chapter.meta;
		const description = meta.description ? `<p>${escapeHtml(meta.description)}</p>` : "";
		const contents = lesson ? navItems
			.filter(({ kind }) => kind === "heading")
			.map(({ id, label }) => ({ href: `#${encodeURIComponent(id)}`, label })) : [];
		return {
			css,
			html: `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>${escapeHtml(meta.title)} · Field Notes</title>
</head>
<body>
	<header class="field-top">
		<a class="field-back" href="../">All renderers</a>
		<a class="field-name" href="./">Field Notes</a>
	</header>
	<main class="field-sheet">
		<header class="field-cover">
			<div>
				<h1>${escapeHtml(meta.title)}</h1>
				${description}
			</div>
			<div class="field-orbits" aria-hidden="true"><span></span><span></span><span></span></div>
		</header>
		<div class="field-body">
			${renderContents(contents)}
			<article class="field-entry">${lesson ? bodyHtml : renderChapter(chapter)}</article>
		</div>
	</main>
</body>
</html>`,
		};
	},
};
