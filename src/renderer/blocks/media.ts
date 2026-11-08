import type { BuildOptions, MediaBlock } from "../../types.js";
import { blockChrome, mdInline } from "../markdown/index.js";
import { resolveAssetSrc } from "../utils.js";
import { escAttr } from "./utils.js";

export function renderMedia(
	block: MediaBlock,
	_idx: number,
	options: BuildOptions,
): { html: string } {
	const src = resolveAssetSrc(block.src, options);

	if (block.kind === "audio") {
		const caption = [
			block.caption,
			block.credit ? `Credit: ${block.credit}` : "",
		]
			.filter(Boolean)
			.join(" ");
		return {
			html: `<div class="bk-audio-box">
				<audio src="${escAttr(src)}" ${block.controls !== false ? "controls" : ""}></audio>
				${caption ? `<div class="bk-audio-caption">${mdInline(caption)}</div>` : ""}
			</div>`,
		};
	}

	const media = `<video src="${escAttr(src)}" ${block.poster ? `poster="${escAttr(resolveAssetSrc(block.poster, options))}"` : ""} ${block.controls !== false ? "controls" : ""} playsinline webkit-playsinline preload="metadata"></video>`;

	return {
		html: blockChrome(
			block.kind,
			block.label,
			[block.caption, block.credit ? `Credit: ${block.credit}` : ""]
				.filter(Boolean)
				.join(" "),
			`<div class="bk-media bk-media--${block.kind}">${media}</div>`,
			"neutral",
		),
	};
}
