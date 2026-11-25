export default {
  render() {
    return {
      html: `<section class="burn-lookup" aria-label="Escape speed lookup">
        <p>Open a reading to see its predicted trajectory.</p>
        <details name="burn-reading" open>
          <summary><b>0.85×</b> Below the threshold</summary>
          <p><strong>Bound orbit.</strong> Gravity brings the spacecraft back around the planet.</p>
        </details>
        <details name="burn-reading">
          <summary><b>1.00×</b> At the threshold</summary>
          <p><strong>Escape.</strong> The spacecraft keeps moving away and its speed approaches zero.</p>
        </details>
        <details name="burn-reading">
          <summary><b>1.15×</b> Above the threshold</summary>
          <p><strong>Escape with speed left over.</strong> Even far from the planet, the spacecraft keeps moving at a nonzero speed.</p>
        </details>
      </section>`,
      css: `
        .burn-lookup { margin-block: 1rem 2rem; border-block: 2px solid currentColor; }
        .burn-lookup > p { margin: 0; padding: .75rem 1rem; font-size: .95rem; }
        .burn-lookup details { border-top: 1px solid var(--quiz-line, currentColor); }
        .burn-lookup summary { cursor: pointer; padding: .75rem 1rem; }
        .burn-lookup summary b { display: inline-block; min-width: 5ch; margin-inline: .25rem .5rem; font: 700 1em ui-monospace, monospace; }
        .burn-lookup details p { margin: 0; padding: 0 1rem 1rem; }
      `,
    };
  },
};
