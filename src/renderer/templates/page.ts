import type { BuildOptions, Lesson } from "../../types.js";
import { escAttr, escHtml } from "../blocks.js";
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

	const topBarHtml = lesson.meta.parentSlug
		? `<a href="index.html" class="bk-back-link" style="display:none" aria-hidden="true">Back to Chapter</a>`
		: "";

	const parentSlug = lesson.meta.parentSlug || "index";
	const parentTitle = lesson.meta.parentTitle || "Overview";

	const breadcrumbsHtml = `
		<a href="${escAttr(parentSlug)}.html" class="bk-topbar-crumb-link" id="bk-topbar-back-btn" aria-label="Back to ${escAttr(parentTitle)}" title="Back to ${escAttr(parentTitle)}">${escHtml(parentTitle)}</a>
		<span class="bk-topbar-crumb-sep">/</span>
		<a href="#" class="bk-topbar-crumb-link bk-topbar-crumb-lesson" title="Scroll to top of ${escAttr(lesson.meta.title)}">${escHtml(lesson.meta.title)}</a>
		<span class="bk-topbar-crumb-sep bk-topbar-active-sep" style="display:none">/</span>
		<a href="#" class="bk-topbar-crumb-link bk-topbar-active-section" style="display:none"></a>
	`;

	const author = lesson.meta.author;
	const tags = lesson.meta.tags;
	const MAX_VISIBLE_TAGS = 4;
	const visibleTags = tags ? tags.slice(0, MAX_VISIBLE_TAGS) : [];
	const overflowCount = tags ? Math.max(0, tags.length - MAX_VISIBLE_TAGS) : 0;

	const tagsHtml =
		visibleTags.length > 0
			? `<div class="bk-hero-tags">${visibleTags
					.map(
						(tag) =>
							`<span class="bk-tag"><span class="bk-tag-hash">#</span>${escHtml(tag)}</span>`,
					)
					.join("")}${
					overflowCount > 0
						? `<span class="bk-tag bk-tag-overflow" title="${tags
								?.slice(MAX_VISIBLE_TAGS)
								.map((t) => `#${t}`)
								.join(", ")}">+${overflowCount}</span>`
						: ""
				}</div>`
			: "";

	const eyebrowText = lesson.meta.eyebrow
		? String(lesson.meta.eyebrow).trim()
		: "";
	const eyebrowRowHtml =
		eyebrowText || tagsHtml
			? `<div class="bk-hero-eyebrow-row">
          ${eyebrowText ? `<p class="bk-eyebrow">${escHtml(eyebrowText)}</p>` : `<span class="bk-eyebrow-spacer"></span>`}
          ${tagsHtml}
        </div>`
			: "";

	const authorName = author ? author.replace(/^by\s+/i, "").trim() : "";

	const contentHtml = `
    <article class="bk-content">
      <header class="bk-hero">
        ${eyebrowRowHtml}
        <h1 style="view-transition-name: title-${lesson.meta.slug}">${escHtml(lesson.meta.title)}</h1>
        ${lesson.meta.description ? `<p class="bk-deck">${escHtml(lesson.meta.description)}</p>` : ""}
        ${
					authorName
						? `<div class="bk-hero-byline">
						<span class="bk-hero-by">${/^by\s+/i.test((author ?? "").trim()) ? "" : "By "}</span>
						<strong class="bk-hero-name">${escHtml(authorName)}</strong>
					</div>`
						: ""
				}
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
		"",
		topBarHtml,
		breadcrumbsHtml,
		false,
	);
}
