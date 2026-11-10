import type { Block, BuildOptions, SimulationBlock } from "../../types.js";
import { escAttr } from "../blocks.js";
import {
	blockChrome,
	escapeScriptJson,
	renderInspectorTabs,
	renderSimulationControls,
	renderSimulationTelemetry,
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
		props: block.props ?? {},
		loop: false,
		dependencies: block.dependencies,
	};
	const id = `sim-${idx}`;
	const label = block.label || "Interactive Simulation";
	const hasTel = Boolean(
		block.telemetry && Object.keys(block.telemetry).length > 0,
	);
	const telemetrySchemaScript = hasTel
		? `<script type="application/json" class="bk-sim-telemetry-schema">${escapeScriptJson(block.telemetry)}</script>`
		: "";

	const controlsHtml = renderSimulationControls(
		block as Extract<Block, { type: "simulation" }>,
		id,
	);
	const telemetryHtml = hasTel
		? renderSimulationTelemetry(id, block.telemetry!)
		: "";

	const inspectorContent = renderInspectorTabs(
		id,
		controlsHtml,
		telemetryHtml,
		block.telemetry,
		Boolean(block.measurements?.timeline),
	);

	const inspectorHtml = inspectorContent
		? `<aside class="bk-sim-inspector" aria-label="Simulation inspector">
          ${inspectorContent}
        </aside>`
		: "";

	return {
		html: blockChrome(
			block.controls === "observe" ? "Simulation" : "Interactive Lab",
			block.label,
			block.caption,
			`<div class="bk-sim-workspace">
          <div class="bk-sim-stage">
            <div class="bk-embed-frame bk-embed-interactive bk-sim-preview">
              <button type="button" class="bk-embed-overlay" data-bk-expand-preview aria-label="Expand simulation">
                <span class="bk-embed-overlay-text">Click to expand</span>
              </button>
              <iframe title="${escAttr(label)}" srcdoc="${iframeDoc(simSrc, propsJson, false, block.dependencies)}"
                sandbox="allow-scripts"
                style="width:100%;height:100%;border:none;display:block;">
              </iframe>
            </div>
          </div>
          ${inspectorHtml}
        </div>
        <script type="application/json" class="bk-sim-config">${escapeScriptJson(simConfig)}</script>
        ${telemetrySchemaScript}
  <script type="application/json" class="bk-measurements-config">${escapeScriptJson(block.measurements ?? {})}</script>`,
			block.accent ?? "blue",
			true,
			id,
		),
		navItems: [{ id, label, kind: "simulation" }],
	};
}
