import { escapeHtml } from "./html.js";

export default {
  render({ code }) {
    return {
      html: `<pre class="burn-code"><code>${escapeHtml(code.trim())}</code></pre>`,
      css: `
        .burn-code { margin-block: 1rem 2rem; padding: .75rem 1rem; border-inline-start: 3px solid var(--quiz-accent, currentColor); background: var(--quiz-surface, transparent); overflow: auto; }
        .burn-code code { font: .9rem/1.5 ui-monospace, monospace; }
      `,
    };
  },
};
