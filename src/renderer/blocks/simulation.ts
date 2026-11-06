import type { Block, BuildOptions, SimulationBlock } from "../../types.js";
import {
	blockChrome,
	escapeScriptJson,
	renderSimulationControls,
} from "../markdown/index.js";
import { type NavItem, resolveContent } from "../utils.js";
import { iframeDoc } from "./iframe.js";

export function renderSimulation(
	block: SimulationBlock,
	idx: number,
	options: BuildOptions,
): { html: string; navItems?: NavItem[] } {
	const propsJson = escapeScriptJson(block.props ?? {});
	const simSrc = resolveContent(block.src, options, "js");
	const simConfig = {
		js: simSrc,
		loop: false,
		dependencies: block.dependencies,
	};
	const id = `sim-${idx}`;
	const label = block.label || "Interactive Simulation";
	return {
		html: blockChrome(
			block.controls === "observe" ? "Simulation" : "Interactive Lab",
			block.label,
			block.caption,
			`${renderSimulationControls(block as Extract<Block, { type: "simulation" }>, id)}
          <div class="bk-embed-frame bk-embed-interactive">
            <div class="bk-embed-overlay" tabindex="0" role="button" aria-label="Activate interactive simulation">
              <span class="bk-embed-overlay-text">Click to interact</span>
            </div>
            <iframe srcdoc="${iframeDoc(simSrc, propsJson, false, block.dependencies)}"
              sandbox="allow-scripts"
              style="width:100%;height:100%;border:none;display:block;">
            </iframe>
          </div>
          <script type="application/json" class="bk-sim-config">${escapeScriptJson(simConfig)}</script>`,
			block.accent ?? "blue",
			true,
			id,
		),
		navItems: [{ id, label, kind: "simulation" }],
	};
}
