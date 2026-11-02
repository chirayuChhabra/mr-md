import type { BuildOptions, Chapter } from "../types.js";
import { escAttr, escHtml } from "./blocks.js";
import { renderChapterTimeline } from "./components/timeline.js";
import { renderLayout } from "./html.js";

export function renderChapter(
	chapter: Chapter,
	opts: BuildOptions = {},
): string {
	const navHtml = chapter.lessons
		.map(
			(l) =>
				`<a href="${escAttr(l.meta.slug)}.html" class="bk-nav-item bk-nav-chapter">${escHtml(l.meta.title)}</a>`,
		)
		.join("\n");

	const timelineHtml = renderChapterTimeline(chapter);

	const contentHtml = `
    <article class="bk-content" style="max-width: 1000px; margin: 0 auto;">
      <header class="bk-hero" style="border-bottom: none;">
        <p class="bk-eyebrow">Chapter</p>
        <h1>${escHtml(chapter.meta.title)}</h1>
        ${chapter.meta.description ? `<p class="bk-deck">${escHtml(chapter.meta.description)}</p>` : ""}
      </header>
      ${timelineHtml}
    </article>
	`;

	return renderLayout(
		chapter.meta.title,
		chapter.meta.description,
		navHtml,
		contentHtml,
		opts,
	);
}
