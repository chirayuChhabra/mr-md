import type {
	SimulationTelemetry,
	SimulationTelemetryItem,
} from "../../types.js";
import { escAttr, escHtml } from "../blocks.js";

export function hasTelemetry(telemetry?: SimulationTelemetry): boolean {
	return Boolean(telemetry && Object.keys(telemetry).length > 0);
}

/**
 * Render the document-level Measurements toggle button in the global topbar.
 * When hasTelemetry is false, returns empty string so no button is rendered.
 */
export function renderDocTelemetryButton(_hasTelemetry: boolean): string {
	return "";
}

export interface DocumentTelemetrySimulation {
	id: string;
	title?: string;
	telemetry: SimulationTelemetry;
}

export function renderTelemetryRows(telemetry: SimulationTelemetry): string {
	const groupsMap = new Map<
		string,
		Array<SimulationTelemetryItem & { key: string; label: string }>
	>();

	for (const [key, item] of Object.entries(telemetry)) {
		const groupName = item.group || "";
		if (!groupsMap.has(groupName)) {
			groupsMap.set(groupName, []);
		}
		const label =
			item.label ||
			key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
		groupsMap.get(groupName)?.push({
			key,
			...item,
			label,
		});
	}

	let sectionsHtml = "";
	for (const [groupName, items] of groupsMap.entries()) {
		const headerHtml = groupName
			? `<div class="bk-telemetry-section-label">${escHtml(groupName)}</div>`
			: "";
		const rowsHtml = items
			.map(
				(item) => `
        <div class="bk-telemetry-row" data-telemetry-key="${escAttr(item.key)}" data-telemetry-display="${item.display === "metric" || item.display === "status" || item.display === "row" ? item.display : "auto"}">
          <span class="bk-telemetry-label">${escHtml(item.label)}</span>
          <span class="bk-telemetry-value">
            <span class="bk-telemetry-num">—</span>${item.unit ? ` <span class="bk-telemetry-unit">${escHtml(item.unit)}</span>` : ""}
          </span>
          ${item.description ? `<span class="bk-telemetry-description">${escHtml(item.description)}</span>` : ""}
        </div>`,
			)
			.join("");

		sectionsHtml += `<div class="bk-telemetry-section">${headerHtml}<div class="bk-telemetry-rows">${rowsHtml}</div></div>`;
	}

	return sectionsHtml;
}

/**
 * Render the simulation telemetry container for the inspector column.
 */
export function renderSimulationTelemetry(
	simId: string,
	telemetry: SimulationTelemetry,
): string {
	if (!telemetry || Object.keys(telemetry).length === 0) return "";
	return `<div class="bk-sim-telemetry" data-sim-id="${escAttr(simId)}">
    ${renderTelemetryRows(telemetry)}
  </div>`;
}

/** Render only inspector panels that contain content. */
export function renderInspectorTabs(
	id: string,
	controlsHtml: string,
	telemetryHtml: string,
): string {
	controlsHtml = controlsHtml.trim();
	telemetryHtml = telemetryHtml.trim();
	if (!controlsHtml && !telemetryHtml) return "";
	const panels = [
		{ key: "controls", label: "Settings", html: controlsHtml },
		{ key: "telemetry", label: "Measurements", html: telemetryHtml },
	].filter((panel) => panel.html);
	const safeId = escAttr(id);
	const scrollCue = `<button type="button" class="bk-sim-scroll-cue" data-bk-scroll-more hidden><span data-bk-scroll-label>More below</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>`;
	if (panels.length === 1) {
		const panel = panels[0];
		return `<div class="bk-sim-tabs" data-sim-tabs="${safeId}"><div id="${safeId}-panel-${panel.key}" class="bk-sim-tabpanel bk-sim-tabpanel--${panel.key} is-active" tabindex="0"><h2 class="bk-sim-panel-heading">${panel.label}</h2>${panel.html}</div>${scrollCue}</div>`;
	}
	return `<div class="bk-sim-tabs" data-sim-tabs="${safeId}">
  <div class="bk-sim-tablist" role="tablist" aria-label="Inspector tabs">${panels.map((panel, i) => `<button type="button" role="tab" class="bk-sim-tab${i === 0 ? " is-active" : ""}" id="${safeId}-tab-${panel.key}" aria-controls="${safeId}-panel-${panel.key}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${panel.label}</button>`).join("")}</div>
  ${panels.map((panel, i) => `<div role="tabpanel" class="bk-sim-tabpanel bk-sim-tabpanel--${panel.key}${i === 0 ? " is-active" : ""}" id="${safeId}-panel-${panel.key}" aria-labelledby="${safeId}-tab-${panel.key}" tabindex="0"${i === 0 ? "" : " hidden"}>${panel.html}</div>`).join("")}
  ${scrollCue}
 </div>`;
}

/**
 * @deprecated Floating document drawer has been replaced by the expanded lab workspace.
 */
export function renderDocTelemetryPanel(
	_simulations: DocumentTelemetrySimulation[],
): string {
	return "";
}

/**
 * @deprecated Per-simulation button has been removed in favor of expanded workspace.
 */
export function renderTelemetryButton(
	_id: string,
	_telemetry?: SimulationTelemetry,
): string {
	return "";
}
