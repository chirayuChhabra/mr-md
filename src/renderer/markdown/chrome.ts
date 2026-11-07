import { escAttr, escHtml } from "../blocks.js";
import { mdInline } from "./sanitize.js";

export function blockChrome(
	kind: string,
	label: string | undefined,
	caption: string | undefined,
	body: string,
	accent = "neutral",
	allowMaximize = true,
	id?: string,
	headerActions?: string,
): string {
	const isLab = body.includes('class="bk-sim-workspace"');
	const actions = [
		headerActions || "",
		allowMaximize
			? `<button type="button" class="bk-object-maximize" ${isLab ? 'data-bk-lab-entry aria-label="Open lab" title="Open lab"' : 'aria-label="Expand Lab" title="Expand Lab"'}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
        ${isLab ? "<span>Open lab</span>" : ""}
      </button>`
			: "",
	]
		.filter(Boolean)
		.join("\n");

	return `<figure ${id ? `id="${escAttr(id)}" ` : ""}class="bk-object bk-object--${escAttr(accent)}">
    <div class="bk-object-header">
      <span class="bk-object-kicker">${escHtml(kind)}</span>
      ${label ? `<span class="bk-object-title">${escHtml(label)}</span>` : ""}
      <div class="bk-expanded-sim-picker" hidden></div>
      ${actions ? `<div class="bk-object-actions">${actions}</div>` : ""}
    </div>
    ${body}
    ${caption ? `<figcaption class="bk-caption">${mdInline(caption)}</figcaption>` : ""}
  </figure>`;
}

export function escapeScriptJson(value: unknown): string {
	return JSON.stringify(value)
		.replace(/</g, "\\u003c")
		.replace(/>/g, "\\u003e");
}
