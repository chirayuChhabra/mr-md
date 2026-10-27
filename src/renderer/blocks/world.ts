import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { BuildOptions, WorldBlock } from "../../types.js";
import { escapeScriptJson } from "../markdown/index.js";
import { type NavItem, resolveContent } from "../utils.js";
import { iframeDoc } from "./iframe.js";
import { escAttr, escHtml } from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedPixelFrameDataUri: string | null = null;
function getPixelFrameSrc(standalone?: boolean): string {
	if (standalone === false) {
		return "assets/pixel-portal-frame.png";
	}
	if (cachedPixelFrameDataUri) {
		return cachedPixelFrameDataUri;
	}
	const candidatePaths = [
		path.join(__dirname, "../../client/pixel-portal-frame.png"),
		path.join(__dirname, "../../styles/pixel-portal-frame.png"),
		path.join(__dirname, "../../../src/client/pixel-portal-frame.png"),
		path.join(__dirname, "../../../src/styles/pixel-portal-frame.png"),
	];
	for (const p of candidatePaths) {
		if (fs.existsSync(p)) {
			const b64 = fs.readFileSync(p).toString("base64");
			cachedPixelFrameDataUri = `data:image/png;base64,${b64}`;
			return cachedPixelFrameDataUri;
		}
	}
	return "assets/pixel-portal-frame.png";
}

export function renderWorld(
	block: WorldBlock,
	idx: number,
	options: BuildOptions,
): { html: string; navItems?: NavItem[] } {
	const propsJson = escapeScriptJson(block.props ?? {});
	const worldSrc = resolveContent(block.src, options, "js");
	const id = `world-${idx}`;
	const label = block.label || "Interactive World";
	const caption = block.caption;
	const accent = block.accent ?? "blue";
	const portalType: "minimal" | "wormhole" | "pixel" =
		block.portal === "wormhole" || block.portal === "pixel"
			? block.portal
			: "minimal";

	const worldConfig = {
		js: worldSrc,
		dependencies: block.dependencies,
		portal: portalType,
	};

	let cardInnerHtml = "";

	const displayCaption =
		caption && caption !== label
			? caption
			: "Interactive explorable simulation world";

	if (portalType === "minimal") {
		// 1. MINIMALIST: Refined architectural card matching callout scale and geometry (720px × ~112px)
		cardInnerHtml = `
  <div class="bk-world-card bk-world-card--minimal bk-world-portal bk-minimal-aperture" role="button" tabindex="0" aria-label="Hold to enter ${escAttr(label)}" data-portal-type="minimal">
    <div class="bk-world-lens" aria-hidden="true">
      <div class="bk-lens-ambient" aria-hidden="true"></div>
      <svg class="bk-world-lens-svg" viewBox="0 0 48 48" fill="none">
        <circle class="bk-lens-coord" cx="24" cy="24" r="21" stroke="currentColor" stroke-dasharray="2 3" opacity="0.35" />
        <ellipse class="bk-lens-orbit-1" cx="24" cy="24" rx="17" ry="7.5" transform="rotate(-25 24 24)" stroke="currentColor" opacity="0.6" stroke-width="1.2" />
        <ellipse class="bk-lens-orbit-2" cx="24" cy="24" rx="11" ry="4.5" transform="rotate(35 24 24)" stroke="currentColor" opacity="0.4" stroke-width="1.2" />
        <circle class="bk-lens-body" cx="14" cy="19" r="2.2" fill="currentColor" />
        <circle class="bk-lens-core-outer" cx="24" cy="24" r="5" stroke="var(--accent)" stroke-width="1" opacity="0.4" />
        <circle class="bk-lens-core" cx="24" cy="24" r="3" fill="var(--accent)" />
      </svg>
    </div>

    <div class="bk-world-card-body">
      <div class="bk-world-card-kicker">
        <span class="bk-world-kicker-badge">
          <span class="bk-world-kicker-dot" aria-hidden="true"></span>
          <span class="bk-world-kicker-text">Explorable Simulation</span>
        </span>
      </div>
      <h3 class="bk-world-card-title">${escHtml(label)}</h3>
      <p class="bk-world-card-sub">${escHtml(displayCaption)}</p>
    </div>

    <div class="bk-world-hold-trigger" aria-hidden="true">
      <div class="bk-world-hold-dial">
        <svg class="bk-world-hold-ring" width="38" height="38" viewBox="0 0 38 38">
          <circle class="bk-world-hold-track" cx="19" cy="19" r="15" />
          <circle class="bk-world-hold-progress" cx="19" cy="19" r="15" />
        </svg>
        <svg class="bk-world-hold-arrow-svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path class="bk-world-hold-arrow" d="M6 3.5l4.5 4.5-4.5 4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <div class="bk-world-hold-meta">
        <span class="bk-world-hold-label bk-world-charge-state">Hold to enter</span>
        <span class="bk-world-hold-hint">Press &amp; hold</span>
      </div>
    </div>
  </div>`;
	} else if (portalType === "wormhole") {
		// 2. WORMHOLE: Freestanding Einstein-Rosen Gateway (Unboxed Spacetime Conduit)
		cardInnerHtml = `
  <div class="bk-wormhole-standalone">
    <div class="bk-world-portal bk-world-portal--wormhole bk-wormhole-aperture" role="button" tabindex="0" aria-label="Hold to enter ${escAttr(label)}" data-portal-type="wormhole">
      <canvas class="bk-world-canvas bk-wormhole-canvas" aria-hidden="true"></canvas>
      <div class="bk-wormhole-hud" aria-hidden="true">
        <div class="bk-wormhole-console">
          <span class="bk-wormhole-title">${escHtml(label)}</span>
          <span class="bk-wormhole-sep" aria-hidden="true">•</span>
          <div class="bk-wormhole-action">
            <svg class="bk-wormhole-progress-ring" width="14" height="14" viewBox="0 0 20 20">
              <circle class="bk-wormhole-rim-track" cx="10" cy="10" r="8" />
              <circle class="bk-wormhole-rim-progress" cx="10" cy="10" r="8" />
            </svg>
            <span class="bk-world-charge-state bk-wormhole-charge-state">Hold to enter</span>
          </div>
        </div>
      </div>
    </div>
  </div>`;
	} else {
		// 3. PIXEL: Arched baroque pixel art window gateway from reference sprite
		cardInnerHtml = `
  <div class="bk-pixel-gateway">
    <div class="bk-pixel-window-frame">
      <div class="bk-world-portal bk-world-portal--pixel bk-pixel-aperture" role="button" tabindex="0" aria-label="Hold to enter ${escAttr(label)}" data-portal-type="pixel">
        <canvas class="bk-world-canvas bk-pixel-canvas" aria-hidden="true"></canvas>
      </div>
      <img class="bk-pixel-frame-img" src="${escAttr(getPixelFrameSrc(options.standalone))}" alt="" aria-hidden="true" />
    </div>
    <div class="bk-pixel-footer">
      <h4 class="bk-world-label bk-pixel-label">${escHtml(label)}</h4>
      <div class="bk-world-hud bk-world-hud--pixel">
        <span class="bk-world-charge-state bk-pixel-charge-state">[░░░░░░░░] HOLD TO ENTER</span>
      </div>
    </div>
  </div>`;
	}

	const html = `
<figure id="${escAttr(id)}" class="bk-object bk-object--world bk-object--${escAttr(accent)}" data-world-block="true" data-portal="${escAttr(portalType)}" data-world-title="${escAttr(label)}">
  ${cardInnerHtml}

  <!-- Fullscreen World Immersion Overlay (Under Topbar) -->
  <div class="bk-world-fullscreen" aria-hidden="true">
    <div class="bk-world-flight-overlay" aria-hidden="true">
      <canvas class="bk-world-flight-canvas"></canvas>
    </div>

    <template class="bk-world-frame-template">
      <iframe srcdoc="${iframeDoc(worldSrc, propsJson, true, block.dependencies, true)}"
        sandbox="allow-scripts"
        style="width:100%;height:100%;border:none;display:block;"
        allow="fullscreen">
      </iframe>
    </template>
    <div class="bk-world-frame-slot"></div>
  </div>

  <script type="application/json" class="bk-world-config">${escapeScriptJson(worldConfig)}</script>
</figure>`.trim();

	return {
		html,
		navItems: [{ id, label, kind: "simulation" }],
	};
}
