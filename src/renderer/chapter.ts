import type { BuildOptions, Chapter } from "../types.js";
import { escAttr, escHtml } from "./blocks.js";
import {
	getLessonStats,
	renderChapterTimeline,
} from "./components/timeline.js";
import { renderLayout } from "./html.js";

export function renderChapter(
	chapter: Chapter,
	opts: BuildOptions = {},
): string {
	const lessons = chapter.lessons || [];
	const navHtml = lessons
		.map(
			(l) =>
				`<a href="${escAttr(l.meta.slug)}.html" class="bk-nav-item bk-nav-chapter">${escHtml(l.meta.title)}</a>`,
		)
		.join("\n");

	let totalSims = 0;
	let totalQuizzes = 0;
	let totalMinutes = 0;

	for (const lesson of lessons) {
		const s = getLessonStats(lesson);
		totalSims += s.simulationsCount;
		totalQuizzes += s.quizzesCount;
		totalMinutes += s.estimatedMinutes;
	}

	const totalLessons = lessons.length;
	const firstLessonSlug = lessons[0]?.meta?.slug;
	const timelineHtml = renderChapterTimeline(chapter);

	const breadcrumbsHtml = `
		<span class="bk-topbar-crumb-item bk-topbar-crumb-current">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
			<span>${escHtml(chapter.meta.title)}</span>
		</span>
	`;

	const contentHtml = `
    <article class="bk-content bk-chapter-dashboard" style="max-width: 1024px; margin: 0 auto;">
      <header class="bk-hero bk-chapter-hero">
        <div class="bk-chapter-eyebrow-row">
          <p class="bk-eyebrow">Interactive Course</p>
          <span class="bk-chapter-lesson-counter">${totalLessons} ${totalLessons === 1 ? "Lesson" : "Lessons"}</span>
        </div>
        <h1>${escHtml(chapter.meta.title)}</h1>
        ${chapter.meta.description ? `<p class="bk-deck">${escHtml(chapter.meta.description)}</p>` : ""}

        <div class="bk-chapter-stats-bar">
          <div class="bk-chapter-stat">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
            <span><strong>${totalLessons}</strong> ${totalLessons === 1 ? "Lesson" : "Lessons"}</span>
          </div>
          ${
						totalSims > 0
							? `<div class="bk-chapter-stat">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            <span><strong>${totalSims}</strong> Simulation${totalSims > 1 ? "s" : ""}</span>
          </div>`
							: ""
					}
          ${
						totalQuizzes > 0
							? `<div class="bk-chapter-stat">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            <span><strong>${totalQuizzes}</strong> Quiz${totalQuizzes > 1 ? "zes" : ""}</span>
          </div>`
							: ""
					}
          <div class="bk-chapter-stat">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            <span><strong>~${totalMinutes}</strong> min total</span>
          </div>
        </div>

        ${
					firstLessonSlug
						? `<div class="bk-chapter-hero-actions">
          <a href="${escAttr(firstLessonSlug)}.html" class="bk-hero-start-btn" id="bk-hero-continue-btn">
            <span>Start Learning</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          </a>
        </div>`
						: ""
				}
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
		"",
		"",
		breadcrumbsHtml,
		true,
	);
}
