import type { Chapter, Lesson } from "../../types.js";
import { escAttr, escHtml } from "../blocks.js";

export interface LessonStats {
	simulationsCount: number;
	quizzesCount: number;
	mediaCount: number;
	estimatedMinutes: number;
}

export function getLessonStats(lesson: Lesson): LessonStats {
	const blocks = lesson.blocks || [];
	let words = 0;
	let simulationsCount = 0;
	let quizzesCount = 0;
	let mediaCount = 0;

	for (const block of blocks) {
		if (block.type === "simulation" || block.type === "animation") {
			simulationsCount++;
		} else if (block.type === "quiz") {
			quizzesCount++;
		} else if (block.type === "youtube" || block.type === "media") {
			mediaCount++;
		} else if (
			block.type === "markdown" ||
			block.type === "heading" ||
			block.type === "section"
		) {
			const textBlock = block as {
				src?: string;
				title?: string;
				label?: string;
			};
			const text = textBlock.src || textBlock.title || textBlock.label || "";
			words += text.trim().split(/\s+/).filter(Boolean).length;
		}
	}

	const estimatedMinutes = Math.max(
		1,
		Math.round(words / 180) +
			simulationsCount * 2 +
			quizzesCount * 1 +
			mediaCount * 2,
	);

	return { simulationsCount, quizzesCount, mediaCount, estimatedMinutes };
}

export function renderChapterTimeline(chapter: Chapter): string {
	const timelineHtml = `
<div class="bk-chapter-timeline-wrapper">
  <div class="bk-chapter-timeline">
    ${chapter.lessons
			.map((lesson, idx) => {
				const stats = getLessonStats(lesson);
				const isRead = lesson.meta.status === "read";
				const indexFormatted = String(idx + 1).padStart(2, "0");

				return `
      <a href="${escAttr(lesson.meta.slug)}.html" class="bk-timeline-card bk-status-${lesson.meta.status ?? "unread"}" data-lesson-slug="${escAttr(lesson.meta.slug)}">
        <div class="bk-timeline-node">
          <span class="bk-timeline-node-index">${indexFormatted}</span>
        </div>
        <div class="bk-timeline-content">
          <div class="bk-timeline-card-meta">
            <div class="bk-card-badges">
              <span class="bk-card-badge bk-badge-lesson">Lesson ${idx + 1}</span>
              ${
								stats.simulationsCount > 0
									? `<span class="bk-card-badge bk-badge-sim" title="${stats.simulationsCount} interactive simulation${stats.simulationsCount > 1 ? "s" : ""}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                    <span>${stats.simulationsCount} Sim${stats.simulationsCount > 1 ? "s" : ""}</span>
                  </span>`
									: ""
							}
              ${
								stats.quizzesCount > 0
									? `<span class="bk-card-badge bk-badge-quiz" title="${stats.quizzesCount} quiz${stats.quizzesCount > 1 ? "zes" : ""}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    <span>${stats.quizzesCount} Quiz</span>
                  </span>`
									: ""
							}
              <span class="bk-card-badge bk-badge-time">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                <span>~${stats.estimatedMinutes}m</span>
              </span>
            </div>
            <span class="bk-card-status-label">${isRead ? "Completed" : "Start"}</span>
          </div>
          <h3 class="bk-timeline-title" style="view-transition-name: title-${escAttr(lesson.meta.slug)}">${escHtml(lesson.meta.title)}</h3>
          ${lesson.meta.description ? `<p class="bk-timeline-desc">${escHtml(lesson.meta.description)}</p>` : ""}
          <div class="bk-timeline-footer">
            <span class="bk-timeline-action">
              ${isRead ? "Review Lesson" : "Start Lesson"} 
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
            </span>
          </div>
        </div>
      </a>
    `;
			})
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
