import { readFileSync } from "node:fs";
import { escapeHtml } from "./html.js";

export default {
  render({ block, index, settings }) {
    if (block.type !== "quiz" || !["check.json", "./check.json"].includes(block.src)) {
      throw new Error("The comparison quiz engine expects check.json");
    }

    const { questions: [question] } = JSON.parse(
      readFileSync(new URL("./check.json", import.meta.url), "utf8"),
    );
    return {
      html: `<form class="burn-check">
        <fieldset><legend>${escapeHtml(question.q)}</legend>
          ${question.options.map((option, optionIndex) => `
            <label><input type="radio" name="answer-${index}" required data-correct="${optionIndex === question.answer}"> ${escapeHtml(option)}</label>
          `).join("")}
        </fieldset>
        <button type="submit">${escapeHtml(settings.submitLabel ?? "Check answer")}</button>
        <p role="status"></p>
        <p class="burn-explanation" hidden>${escapeHtml(question.explanation)}</p>
      </form>`,
      css: `
        .burn-check { margin-block: 1rem 2rem; padding: clamp(1rem, 3vw, 1.5rem); color: var(--quiz-ink, inherit); background: var(--quiz-surface, transparent); border: 1px solid var(--quiz-line, currentColor); }
        .burn-check fieldset { margin: 0 0 1rem; padding: 0; border: 0; min-inline-size: 0; }
        .burn-check legend { font-weight: 700; margin-block-end: .75rem; }
        .burn-check label { display: flex; gap: .5rem; align-items: center; min-height: 2.75rem; cursor: pointer; }
        .burn-check input { accent-color: var(--quiz-accent, currentColor); }
        .burn-check button { min-height: 2.75rem; padding: .5rem 1rem; font: inherit; color: inherit; background: transparent; border: 1px solid currentColor; cursor: pointer; }
        .burn-check button:focus-visible, .burn-check input:focus-visible { outline: 2px solid var(--quiz-accent, currentColor); outline-offset: 4px; }
        .burn-check [role="status"]:empty { display: none; }
      `,
      js: `document.querySelectorAll(".burn-check").forEach(form => {
        const feedback = form.querySelector('[role="status"]');
        const explanation = form.querySelector(".burn-explanation");
        form.addEventListener("submit", event => {
          event.preventDefault();
          const correct = form.querySelector("input:checked")?.dataset.correct === "true";
          feedback.textContent = correct ? "Correct." : "Try another speed.";
          explanation.hidden = !correct;
        });
      });`,
    };
  },
};
