import type { BuildOptions, Lesson } from "../../types.js";
import { escHtml } from "../blocks.js";
import type { NavItem } from "../utils.js";
import { renderLayout } from "./layout.js";

export function renderNavItem(item: NavItem): string {
	const kindClass =
		item.kind === "heading"
			? "bk-nav-heading"
			: item.kind === "quiz"
				? "bk-nav-quiz"
				: item.kind === "simulation"
					? "bk-nav-sim"
					: "bk-nav-sub";
	return `<a href="#${item.id}" class="bk-nav-item ${kindClass}" data-id="${item.id}">${escHtml(item.label)}</a>`;
}

export function renderEndNav(lesson: Lesson): string {
	const { prevSlug, prevTitle, nextSlug, nextTitle } = lesson.meta;
	if (!prevSlug && !nextSlug) return "";

	return `<nav class="bk-end-nav" aria-label="Lesson navigation" style="grid-template-columns: repeat(2, minmax(0, 1fr));">
    ${
			prevSlug
				? `
    <a class="bk-end-link bk-end-link--prev" href="${prevSlug}.html">
      <span>Previous Lesson</span>
      <strong>${escHtml(prevTitle || "Previous")}</strong>
    </a>
    `
				: `<div class="bk-end-link" style="visibility:hidden"></div>`
		}
    ${
			nextSlug
				? `
    <a class="bk-end-link bk-end-link--next" href="${nextSlug}.html">
      <span>Next Lesson</span>
      <strong>${escHtml(nextTitle || "Next")}</strong>
    </a>
    `
				: `<div class="bk-end-link" style="visibility:hidden"></div>`
		}
  </nav>`;
}

export function renderPage(
	lesson: Lesson,
	navItems: NavItem[],
	bodyHtml: string,
	opts: BuildOptions,
): string {
	const navHtml = navItems.map(renderNavItem).join("\n");
	const endNavHtml = renderEndNav(lesson);

	const extraSidebar = `
		${lesson.meta.parentSlug ? `<div style="margin-top: 8px;"><a href="index.html" class="bk-back-link" aria-label="Back to Chapter" style="margin-bottom: 12px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>Back to Chapter</a></div>` : `<div style="margin-top: 8px;"></div>`}
	`;
	const authorHtml = lesson.meta.author
		? `<div class="bk-sidebar-author">By ${escHtml(lesson.meta.author)}</div>`
		: "";
	const tagsHtml = lesson.meta.tags?.length
		? `<div class="bk-tag-row">${lesson.meta.tags.map((tag) => `<span>${escHtml(tag)}</span>`).join("")}</div>`
		: "";

	const contentHtml = `
    <article class="bk-content">
      <header class="bk-hero">
        <p class="bk-eyebrow">Interactive Lesson</p>
        <h1 style="view-transition-name: title-${lesson.meta.slug}">${escHtml(lesson.meta.title)}</h1>
        ${lesson.meta.description ? `<p class="bk-deck">${escHtml(lesson.meta.description)}</p>` : ""}
      </header>
      ${bodyHtml}
      ${endNavHtml}
    </article>
	`;

	return renderLayout(
		lesson.meta.title,
		lesson.meta.description,
		navHtml,
		contentHtml,
		opts,
		extraSidebar + authorHtml + tagsHtml,
	);
}
