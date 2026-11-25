import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./theme.css", import.meta.url), "utf8");

function escape(value) {
	return String(value).replace(/[&<>"']/g, character => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#39;",
	})[character]);
}

export default {
	render({ lesson, chapter, bodyHtml, navItems }) {
		const title = lesson?.meta.title ?? chapter.meta.title;
		const description = lesson?.meta.description ?? chapter?.meta.description;
		const firstLesson = chapter?.lessons[0];
		const action = lesson
			? '<a class="mission-action" href="#flight-deck">Open flight deck <span aria-hidden="true">↘</span></a>'
			: firstLesson
				? `<a class="mission-action" href="${escape(firstLesson.meta.slug)}.html">Open mission <span aria-hidden="true">↗</span></a>`
				: "";
		const index = navItems
			.filter(item => item.kind === "heading" || item.kind === "simulation")
			.map(item => `<a href="#${escape(item.id)}">${escape(item.label)}</a>`)
			.join("");

		return {
			css,
			html: `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>${escape(title)} | Mission Control</title>
</head>
<body class="mission-shell">
	<a href="#mission-main" class="mission-skip">Skip to lesson</a>
	<header class="mission-bar">
		<a href="./" class="mission-brand"><span aria-hidden="true"></span> Mission Control</a>
		<nav aria-label="Playground"><a href="../">Compare editions <span aria-hidden="true">↗</span></a></nav>
	</header>
	<main id="mission-main">
		<header class="mission-hero">
			<div>
				<p class="mission-channel">Flight dynamics / Earth departure</p>
				<h1>${escape(title)}</h1>
				${description ? `<p class="mission-description">${escape(description)}</p>` : ""}
				${action}
			</div>
			<div class="mission-emblem" aria-hidden="true">
				<span class="mission-planet"></span>
				<span class="mission-ring"></span>
				<span class="mission-target">+</span>
			</div>
		</header>
		${lesson ? `<div class="mission-body">
			<aside><nav aria-label="Lesson sections"><p>Mission brief</p>${index}</nav></aside>
			<article class="mission-reading">${bodyHtml}</article>
		</div>` : `<div class="mission-overview">${bodyHtml}</div>`}
	</main>
	<footer class="mission-footer"><a href="../">Back to the engine comparison</a></footer>
</body>
</html>`,
		};
	},
};
