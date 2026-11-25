import { readFileSync } from "node:fs";
import path from "node:path";

function escape(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

export default {
  render({ block, settings, options }) {
    if (block.type !== "quiz") throw new Error("This example supports quiz blocks only");
    const quiz = JSON.parse(readFileSync(path.resolve(options.contentBase, block.src), "utf8"));
    return {
      html: `<section class="chapter-test"><h3>${escape(settings.label ?? "Check your understanding")}</h3>${quiz.questions.map(question => `
        <fieldset><legend>${escape(question.q)}</legend>
          ${question.options.map((option, index) => `<button type="button" data-correct="${index === question.answer}">${escape(option)}</button>`).join("")}
          <p role="status" aria-live="polite"></p>
        </fieldset>`).join("")}</section>`,
      css: `.chapter-test { margin-block: 2rem; padding: 1.5rem; border: 1px solid var(--accent); border-radius: .5rem; }
        .chapter-test fieldset { border: 0; padding: 0; margin-block: 1rem; }
        .chapter-test legend { margin-bottom: 1rem; }
        .chapter-test button { display: block; width: 100%; text-align: left; font: inherit; color: inherit; background: transparent; padding: .75rem; margin-block: .5rem; border: 1px solid currentColor; border-radius: .25rem; cursor: pointer; }
        .chapter-test button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }`,
      js: `document.querySelectorAll('.chapter-test button').forEach(button => {
        button.addEventListener('click', () => {
          button.closest('fieldset').querySelector('[role="status"]').textContent =
            button.dataset.correct === 'true' ? 'Correct.' : 'Try another answer.';
        });
      });`
    };
  }
};
