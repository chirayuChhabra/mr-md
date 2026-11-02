import { logger } from "../../cli/logger.js";
import type { Block, BuildOptions } from "../../types.js";
import type { NavItem } from "../utils.js";
import { renderAnimation } from "./animation.js";
import { renderCallout } from "./callout.js";
import { renderColumns } from "./columns.js";
import { renderHeading } from "./heading.js";
import { renderImage } from "./image.js";
import { renderMarkdown } from "./markdown.js";
import { renderMedia } from "./media.js";
import { renderQuiz } from "./quiz.js";
import { renderSection } from "./section.js";
import { renderSimulation } from "./simulation.js";
import { escAttr, escHtml } from "./utils.js";
import { renderYouTube } from "./youtube.js";

export { blockChrome } from "../markdown/index.js";
export { escAttr, escHtml } from "./utils.js";

export function renderBlockInner(
	block: Block,
	idx: number,
	options: BuildOptions,
): { html: string; navItems?: NavItem[] } {
	switch (block.type) {
		case "heading":
			return renderHeading(block, idx, options);
		case "markdown":
			return renderMarkdown(block, idx, options);
		case "section":
			return renderSection(block, idx, options);
		case "important":
		case "warning":
		case "tip":
		case "note":
		case "caution":
			return renderCallout(block, idx, options);
		case "simulation":
			return renderSimulation(block, idx, options);
		case "animation":
			return renderAnimation(block, idx, options);
		case "media":
			return renderMedia(block, idx, options);
		case "image":
			return renderImage(
				block as Extract<Block, { type: "image" }>,
				idx,
				options,
			);
		case "youtube":
			return renderYouTube(block, idx, options);
		case "columns":
			return renderColumns(
				block as Extract<Block, { type: "columns" }>,
				idx,
				options,
			);
		case "quiz":
			return renderQuiz(block, idx, options);
		default:
			logger.warn(
				`Unknown block type encountered: ${"type" in block ? (block as { type: string }).type : "unknown"}`,
			);
			return { html: "" };
	}
}

export function renderBlock(
	block: Block,
	idx: number,
	options: BuildOptions,
): { html: string; navItems?: NavItem[] } {
	try {
		const result = renderBlockInner(block, idx, options);
		if (
			result.html &&
			"src" in block &&
			typeof block.src === "string" &&
			block.src.includes(".")
		) {
			result.html = result.html.replace(
				/^<([a-zA-Z0-9-]+)([^>]*)>/,
				`<$1 data-bk-src="${escAttr(block.src)}"$2>`,
			);
		}
		return result;
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (options.strict !== false) {
			throw e;
		}
		logger.warn(`  ⚠ Error rendering block ${idx + 1} (${block.type}): ${msg}`);
		const errorHtml = `<div class="bk-callout bk-callout--warning"><div class="bk-callout-icon"></div><div class="bk-callout-content"><div class="bk-callout-label">Block Error (${escHtml(block.type)})</div><div class="bk-callout-body"><p>${escHtml(msg)}</p></div></div></div>`;
		return { html: errorHtml };
	}
}
