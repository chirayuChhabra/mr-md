import type { BuildOptions, YouTubeBlock } from "../../types.js";
import { blockChrome } from "../markdown/index.js";
import { escAttr } from "./utils.js";

export function renderYouTube(
	block: YouTubeBlock,
	_idx: number,
	_options: BuildOptions,
): { html: string } {
	const params = new URLSearchParams();
	params.set("rel", "0");
	if (block.start) params.set("start", String(block.start));
	return {
		html: blockChrome(
			"YouTube",
			block.label,
			block.caption,
			`<div class="bk-embed-frame">
            <iframe src="https://www.youtube-nocookie.com/embed/${escAttr(block.id)}?${params.toString()}"
              title="${escAttr(block.label ?? "YouTube video")}"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowfullscreen
              referrerpolicy="strict-origin-when-cross-origin"
              loading="lazy"
              style="width:100%;height:100%;border:none;display:block;">
            </iframe>
          </div>
          <script>
            if (!window._bkYtBlurSetup) {
              window._bkYtBlurSetup = true;
              window.addEventListener('mousemove', function() {
                if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
                  document.activeElement.blur();
                }
              }, { passive: true });
            }
          </script>`,
			"neutral",
		),
	};
}
