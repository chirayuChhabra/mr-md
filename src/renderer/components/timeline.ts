import type { Chapter } from "../../types.js";
import { escAttr, escHtml } from "../blocks.js";

export function renderChapterTimeline(chapter: Chapter): string {
	const timelineHtml = `
<div class="bk-chapter-timeline-wrapper">
  <div class="bk-chapter-timeline">
    ${chapter.lessons
			.map(
				(lesson) => `
      <a href="${escAttr(lesson.meta.slug)}.html" class="bk-timeline-card bk-status-${lesson.meta.status ?? "unread"}">
        <div class="bk-timeline-node"></div>
        <div class="bk-timeline-content">
          <h3 class="bk-timeline-title" style="view-transition-name: title-${escAttr(lesson.meta.slug)}">${escHtml(lesson.meta.title)}</h3>
          ${lesson.meta.description ? `<p class="bk-timeline-desc">${escHtml(lesson.meta.description)}</p>` : ""}
          <span class="bk-timeline-action">${lesson.meta.status === "read" ? "Read again" : "Start Lesson"} <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-7-7 7 7-7 7"/></svg></span>
        </div>
      </a>
    `,
			)
			.join("")}
  </div>
</div>
<script>
  if (!CSS.supports('(animation-timeline: view()) and (animation-range: entry)')) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('js-visible');
            entry.target.classList.remove('js-hidden');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.1 }
    );
    document.querySelectorAll('.bk-timeline-card').forEach((el) => {
      el.classList.add('js-hidden');
      observer.observe(el);
    });
  }
</script>`;
	return timelineHtml;
}
