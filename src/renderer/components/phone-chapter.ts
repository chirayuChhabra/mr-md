import type { Chapter } from "../../types.js";
import { escAttr, escHtml } from "../blocks.js";
import { getLessonStats } from "./timeline.js";

/** Phone catalogue stays deliberately compact, regardless of lesson length. */
export function renderPhoneChapter(chapter: Chapter): string {
	const lessons = chapter.lessons || [];
	return `<nav class="bk-phone-reading-header" aria-label="Course navigation"><span>Course</span><a href="#top">Back to top</a></nav><article class="bk-phone-catalogue">
  <header><h1>${escHtml(chapter.meta.title)}</h1>
  ${chapter.meta.description ? `<p>${escHtml(chapter.meta.description)}</p>` : ""}
  <span>${lessons.length} lessons</span></header>
  ${lessons[0] ? `<a class="bk-phone-start" href="${escAttr(lessons[0].meta.slug)}.html"><span>Start learning</span><span aria-hidden="true">›</span></a>` : ""}
  <h2>Lessons</h2>
  <ol>${lessons
		.map(
			(
				lesson,
				index,
			) => `<li><a href="${escAttr(lesson.meta.slug)}.html" data-phone-lesson="${escAttr(lesson.meta.slug)}">
   <span class="bk-phone-lesson-number" aria-hidden="true">${index + 1}</span>
   <span class="bk-phone-lesson-copy"><strong>${escHtml(lesson.meta.title)}</strong><small>${getLessonStats(lesson).estimatedMinutes} min<span class="bk-phone-lesson-status"></span></small></span>
   <span aria-hidden="true">›</span>
  </a></li>`,
		)
		.join("")}</ol>
 </article>`;
}
