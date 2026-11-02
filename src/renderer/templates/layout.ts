import type { BuildOptions } from "../../types.js";
import { escHtml } from "../blocks.js";
import { clientScript, pageCSS } from "./assets.js";

export function renderLayout(
	title: string,
	description: string | undefined,
	navHtml: string,
	contentHtml: string,
	opts: BuildOptions,
	extraSidebar: string = "",
): string {
	const theme = opts.theme ?? "light";
	const schemeAttr = `data-theme="${theme}"`;
	const preset = opts.preset ?? {};
	const layout = preset.layout ?? "lesson";
	const density = preset.density ?? "comfortable";
	const tone = preset.tone ?? "scholarly";
	const palette = opts.palette ?? "ink";
	const ui = opts.ui ?? "standard";
	const safeFont = opts.font ? opts.font.replace(/[;{}<>\\]/g, "") : "";

	return `<!DOCTYPE html>
<html lang="en" data-palette="${palette}" data-ui="${ui}" ${schemeAttr}>
<head>
<script>
(function() {
	var t = localStorage.getItem("bk-theme") || "auto";
	var p = localStorage.getItem("bk-palette");
	var u = localStorage.getItem("bk-ui");
	var root = document.documentElement;
	
	var resolvedTheme = t;
	if (t === "auto") {
		resolvedTheme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
	}
	root.setAttribute("data-theme", resolvedTheme);
	
	if (p) root.setAttribute("data-palette", p === "green" ? "field" : p);
	if (u) root.setAttribute("data-ui", u);
})();
</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title)}</title>
${description ? `<meta name="description" content="${escHtml(description)}">` : ""}
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.css">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,650;9..144,760&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Archivo:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Syne:wght@600;700;800&family=Playfair+Display:ital,wght@0,400..700;1,400..700&family=Lora:ital,wght@0,400..700;1,400..700&display=swap" rel="stylesheet">

${opts.head ?? ""}
${opts.standalone === false ? `<link rel="stylesheet" href="assets/theme.css?v=${Date.now()}">` : `<style>\n${safeFont ? `:root { --font-sans: ${safeFont}, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }` : ""}\n${pageCSS()}\n</style>`}
</head>
<body class="bk-layout-${layout} bk-density-${density} bk-tone-${tone}">
<div class="bk-shell" data-palette="${palette}" data-ui="${ui}" ${schemeAttr}>
<script>
  (function() {
    var shell = document.querySelector(".bk-shell");
    var root = document.documentElement;
    if(shell && root) {
      if(root.hasAttribute("data-theme")) shell.setAttribute("data-theme", root.getAttribute("data-theme"));
      if(root.hasAttribute("data-palette")) shell.setAttribute("data-palette", root.getAttribute("data-palette"));
      if(root.hasAttribute("data-ui")) shell.setAttribute("data-ui", root.getAttribute("data-ui"));
    }
  })();
</script>
  <aside class="bk-sidebar">
    <div class="bk-sidebar-inner">
      <div class="bk-sidebar-header">
        ${extraSidebar}
        <div class="bk-sidebar-title">${escHtml(title)}</div>
      </div>
      <nav class="bk-nav">${navHtml}</nav>
      <div class="bk-sidebar-footer">
        <button class="bk-icon-btn bk-settings-button" id="bk-settings-button" type="button" aria-expanded="false" aria-controls="bk-theme-panel" title="Display settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          <span class="bk-sr-only">Display settings</span>
        </button>
        <div class="bk-theme-panel" id="bk-theme-panel" aria-label="Display settings" hidden>
          <div class="bk-theme-row">
            <span>Theme</span>
            <div class="bk-segmented-control" id="bk-theme-icons">
               <button type="button" class="bk-segment-btn ${theme === "light" ? "active" : ""}" data-theme="light" title="Light" aria-label="Light theme">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
               </button>
               <button type="button" class="bk-segment-btn ${theme === "auto" ? "active" : !theme ? "active" : ""}" data-theme="auto" title="System" aria-label="System theme">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
               </button>
               <button type="button" class="bk-segment-btn ${theme === "dark" ? "active" : ""}" data-theme="dark" title="Dark" aria-label="Dark theme">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
               </button>
            </div>
          </div>
          <div class="bk-theme-row">
            <span>Palette</span>
            <div class="bk-segmented-control" id="bk-palette-icons">
               <button type="button" class="bk-segment-btn ${palette === "ink" ? "active" : ""}" data-palette="ink" title="Ink" aria-label="Ink palette">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg>
               </button>
               <button type="button" class="bk-segment-btn ${palette === "field" ? "active" : ""}" data-palette="field" title="Field" aria-label="Field palette">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"></path><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"></path></svg>
               </button>
               <button type="button" class="bk-segment-btn ${palette === "ember" ? "active" : ""}" data-palette="ember" title="Ember" aria-label="Ember palette">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"></path></svg>
               </button>
            </div>
          </div>
          <div class="bk-theme-row">
            <span>UI</span>
            <div class="bk-segmented-control" id="bk-ui-icons">
               <button type="button" class="bk-segment-btn ${ui === "standard" ? "active" : ""}" data-ui="standard" title="Standard" aria-label="Standard UI">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" ry="4"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
               </button>
               <button type="button" class="bk-segment-btn ${ui === "neo" ? "active" : ""}" data-ui="neo" title="Neo Brutalist" aria-label="Neo UI">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><rect x="3" y="3" width="18" height="18"></rect><path d="M3 10h18"></path><path d="M10 10v11"></path></svg>
               </button>
               <button type="button" class="bk-segment-btn ${ui === "playful" ? "active" : ""}" data-ui="playful" title="Playful" aria-label="Playful UI">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="6" ry="6"></rect><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"></circle><circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"></circle></svg>
               </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </aside>
  <button class="bk-sidebar-collapse-floating" id="bk-sidebar-collapse" aria-label="Collapse sidebar">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
  </button>
  <main class="bk-main">
    <button class="bk-sidebar-expand" id="bk-sidebar-expand" type="button" aria-label="Expand sidebar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
    </button>
    ${contentHtml}
  </main>
</div>
${opts.standalone === false ? `<script type="module" src="assets/app.bundle.js?v=${Date.now()}"></script>` : `<script type="module">\n${clientScript()}\n</script>`}
</body>
</html>`;
}
