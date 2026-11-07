// @ts-nocheck

import type { MeasurementPlotsInstance } from "../measurement-types.js";
import type {
	MeasurementsConfig,
	SimulationTelemetryItem,
	TelemetryTone,
} from "../types.js";
import { createMeasurementPlots } from "./measurement-plots.js";
import { bkWireWorkspace } from "./workspace.js";

export {
	bkCollapseLab,
	bkExpandLab,
	bkSelectInspectorTab,
	bkToggleExpandLab,
} from "./workspace.js";

export interface RuleEvaluationResult {
	tone: TelemetryTone | undefined;
	label: string | undefined;
	ruleIndex: number;
}

interface SimulationState {
	id: string;
	title: string;
	figure: Element;
	schema: Record<string, SimulationTelemetryItem> | null;
	measurements: MeasurementsConfig | null;
	pending: Record<string, unknown>;
	values: Record<string, unknown>;
	prevValues: Record<string, unknown>;
	prevRangeMatches: Record<string, RuleEvaluationResult | null>;
	unseenChangedKeys: Set<string>;
	isFirstFrame: boolean;
	plotsInstance: MeasurementPlotsInstance | null;
	plotsContainer: HTMLElement | null;
	rafId: number | null;
}

const simRegistry = new Map<string, SimulationState>();
let isWireInitialized = false;

function isDisallowedKey(key: string): boolean {
	return key === "__proto__" || key === "constructor" || key === "prototype";
}

/**
 * Format a telemetry value for display according to its schema definition.
 * Numbers with precision are formatted accordingly.
 * Non-finite, undefined, null, or empty string values explicitly return "—" rather than fake zero.
 */
export function formatTelemetryValue(
	val: unknown,
	schema?: SimulationTelemetryItem,
): string {
	if (
		val === undefined ||
		val === null ||
		val === "" ||
		(typeof val === "number" && !Number.isFinite(val))
	) {
		return "—";
	}

	if (typeof val === "number") {
		const precision = schema?.precision;
		if (typeof precision === "number" && Number.isFinite(precision)) {
			const clamped = Math.min(Math.max(0, Math.floor(precision)), 20);
			try {
				return val.toFixed(clamped);
			} catch (_) {
				return val.toLocaleString("en-US", { maximumFractionDigits: 4 });
			}
		}
		// Format cleanly without excessive trailing decimals
		return val.toLocaleString("en-US", { maximumFractionDigits: 4 });
	}

	if (typeof val === "boolean") {
		return val ? "Yes" : "No";
	}

	if (typeof val === "object") {
		return "—";
	}

	return String(val);
}

/**
 * Evaluate telemetry range rules against raw telemetry value.
 * First matching rule wins. Numeric bounds are min-inclusive, max-exclusive, finite only.
 * Optional label serves as an accessible second signal for color.
 */
export function evaluateTelemetryRule(
	rawValue: unknown,
	schema?: SimulationTelemetryItem,
): RuleEvaluationResult {
	if (!schema) {
		return { tone: undefined, label: undefined, ruleIndex: -1 };
	}

	if (schema.ranges && Array.isArray(schema.ranges)) {
		for (let i = 0; i < schema.ranges.length; i++) {
			const rule = schema.ranges[i];
			if (!rule) continue;

			// Check equality condition
			if (rule.equals !== undefined) {
				let matched = false;
				if (typeof rule.equals === "string") {
					matched =
						rawValue === rule.equals ||
						(typeof rawValue === "string" &&
							rawValue.toLowerCase() === rule.equals.toLowerCase());
				} else if (typeof rule.equals === "number") {
					matched =
						typeof rawValue === "number" &&
						Number.isFinite(rawValue) &&
						Number.isFinite(rule.equals) &&
						rawValue === rule.equals;
				} else if (typeof rule.equals === "boolean") {
					matched = typeof rawValue === "boolean" && rawValue === rule.equals;
				}
				if (matched) {
					return {
						tone: rule.tone,
						label: rule.label,
						ruleIndex: i,
					};
				}
			}

			// Check numeric bounds: min-inclusive, max-exclusive, finite only
			if (rule.min !== undefined || rule.max !== undefined) {
				if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
					const minOk =
						rule.min === undefined ||
						(Number.isFinite(rule.min) && rawValue >= rule.min);
					const maxOk =
						rule.max === undefined ||
						(Number.isFinite(rule.max) && rawValue < rule.max);
					if (minOk && maxOk) {
						return {
							tone: rule.tone,
							label: rule.label,
							ruleIndex: i,
						};
					}
				}
			}
		}
	}

	if (schema.tone) {
		return { tone: schema.tone, label: undefined, ruleIndex: -1 };
	}

	return { tone: undefined, label: undefined, ruleIndex: -1 };
}

function getSafeCssSelectorKey(key: string): string {
	return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(key) : key;
}

function isMeasurementsTabActive(figure: Element): boolean {
	const activeTab = figure.querySelector(
		'.bk-sim-tablist [role="tab"].is-active, .bk-sim-tablist [role="tab"][aria-selected="true"]',
	);
	if (!activeTab) return false;
	const controls = activeTab.getAttribute("aria-controls") || "";
	return (
		activeTab.id.endsWith("-tab-telemetry") || controls.includes("telemetry")
	);
}

export function updateTabBadge(
	figure: Element,
	badgeMode: "off" | "dot" | "count" | undefined,
	count: number,
): void {
	if (!badgeMode || badgeMode === "off") {
		const badgeEl = figure.querySelector(".bk-measurement-tab-badge");
		if (badgeEl) {
			badgeEl.setAttribute("hidden", "");
			badgeEl.textContent = "";
		}
		return;
	}

	let badgeEl = figure.querySelector<HTMLElement>(".bk-measurement-tab-badge");
	if (!badgeEl) {
		const tabEl = figure.querySelector(
			'[role="tab"][id*="-tab-telemetry"], [role="tab"][aria-controls*="telemetry"]',
		);
		if (tabEl) {
			badgeEl = document.createElement("span");
			badgeEl.className = "bk-measurement-tab-badge";
			tabEl.appendChild(badgeEl);
		}
	}
	if (!badgeEl) return;

	if (count <= 0) {
		badgeEl.setAttribute("hidden", "");
		badgeEl.textContent = "";
		return;
	}

	badgeEl.removeAttribute("hidden");
	if (badgeMode === "dot") {
		badgeEl.className =
			"bk-measurement-tab-badge bk-measurement-tab-badge--dot";
		badgeEl.textContent = "";
		badgeEl.setAttribute("aria-label", "New measurement updates available");
	} else if (badgeMode === "count") {
		badgeEl.className =
			"bk-measurement-tab-badge bk-measurement-tab-badge--count";
		badgeEl.textContent = String(count);
		badgeEl.setAttribute("aria-label", `${count} unread measurement updates`);
	}
}

export function bkClearMeasurementBadge(target?: string | Element): void {
	if (typeof target === "string") {
		const state = simRegistry.get(target);
		if (state) {
			state.unseenChangedKeys.clear();
			updateTabBadge(state.figure, state.measurements?.badge, 0);
		}
		return;
	}

	if (target && target instanceof Element) {
		const figure = target.closest(".bk-object") || target;
		const id = figure.id || figure.getAttribute("data-telemetry-id");
		if (id && simRegistry.has(id)) {
			bkClearMeasurementBadge(id);
			return;
		}
	}

	for (const [_id, state] of simRegistry.entries()) {
		state.unseenChangedKeys.clear();
		updateTabBadge(state.figure, state.measurements?.badge, 0);
	}
}

/**
 * Reset all displayed values in a simulation's telemetry view or across all simulations to "—"
 */
export function bkResetTelemetry(target?: string | Element): void {
	if (typeof target === "string") {
		const state = simRegistry.get(target);
		if (state) {
			if (state.rafId !== null) {
				cancelAnimationFrame(state.rafId);
				state.rafId = null;
			}
			state.pending = {};
			state.values = {};
			state.prevValues = {};
			state.prevRangeMatches = {};
			state.unseenChangedKeys.clear();
			state.isFirstFrame = true;

			state.figure.querySelectorAll(".bk-telemetry-num").forEach((numEl) => {
				if (numEl.textContent !== "—") numEl.textContent = "—";
			});
			state.figure.querySelectorAll(".bk-telemetry-row").forEach((row) => {
				const schemaItem =
					state.schema?.[row.getAttribute("data-telemetry-key") || ""];
				if (schemaItem?.tone) {
					row.setAttribute("data-telemetry-tone", schemaItem.tone);
				} else {
					row.removeAttribute("data-telemetry-tone");
				}
				const toneLabelEl = row.querySelector(".bk-telemetry-tone-label");
				if (toneLabelEl) {
					toneLabelEl.setAttribute("hidden", "");
					toneLabelEl.textContent = "";
				}
			});

			updateTabBadge(state.figure, state.measurements?.badge, 0);

			if (state.plotsInstance) {
				try {
					state.plotsInstance.reset();
				} catch (_) {}
			}
		}
		const views = document.querySelectorAll(
			`[data-sim-id="${getSafeCssSelectorKey(target)}"] .bk-telemetry-num`,
		);
		views.forEach((numEl) => {
			if (numEl.textContent !== "—") numEl.textContent = "—";
		});
		return;
	}

	if (target && target instanceof Element) {
		const figure = target.closest(".bk-object") || target;
		const id = figure.id || figure.getAttribute("data-telemetry-id");
		if (id) {
			bkResetTelemetry(id);
			return;
		}
	}

	// Reset all registered simulations
	for (const [_id, state] of simRegistry.entries()) {
		if (state.rafId !== null) {
			cancelAnimationFrame(state.rafId);
			state.rafId = null;
		}
		state.pending = {};
		state.values = {};
		state.prevValues = {};
		state.prevRangeMatches = {};
		state.unseenChangedKeys.clear();
		state.isFirstFrame = true;
		state.figure.querySelectorAll(".bk-telemetry-num").forEach((numEl) => {
			if (numEl.textContent !== "—") numEl.textContent = "—";
		});
		state.figure.querySelectorAll(".bk-telemetry-row").forEach((row) => {
			const schemaItem =
				state.schema?.[row.getAttribute("data-telemetry-key") || ""];
			if (schemaItem?.tone) {
				row.setAttribute("data-telemetry-tone", schemaItem.tone);
			} else {
				row.removeAttribute("data-telemetry-tone");
			}
			const toneLabelEl = row.querySelector(".bk-telemetry-tone-label");
			if (toneLabelEl) {
				toneLabelEl.setAttribute("hidden", "");
				toneLabelEl.textContent = "";
			}
		});
		updateTabBadge(state.figure, state.measurements?.badge, 0);
		if (state.plotsInstance) {
			try {
				state.plotsInstance.reset();
			} catch (_) {}
		}
	}
	document.querySelectorAll(".bk-telemetry-num").forEach((numEl) => {
		if (numEl.textContent !== "—") numEl.textContent = "—";
	});
}

function applyTelemetryUpdate(simId: string): void {
	const state = simRegistry.get(simId);
	if (!state) return;

	const isFirst = state.isFirstFrame;
	const tabActive = isMeasurementsTabActive(state.figure);

	for (const [key, rawValue] of Object.entries(state.pending)) {
		if (isDisallowedKey(key)) continue;
		const safeKey = getSafeCssSelectorKey(key);
		const rows = state.figure.querySelectorAll(
			`.bk-telemetry-row[data-telemetry-key="${safeKey}"]`,
		);

		const itemSchema = state.schema?.[key];
		const formatted = formatTelemetryValue(rawValue, itemSchema);
		const ruleMatch = evaluateTelemetryRule(rawValue, itemSchema);

		rows.forEach((row) => {
			row.setAttribute(
				"data-value-type",
				typeof rawValue === "number" ? "number" : "status",
			);

			if (ruleMatch.tone) {
				row.setAttribute("data-telemetry-tone", ruleMatch.tone);
			} else {
				row.removeAttribute("data-telemetry-tone");
			}

			const numEl = row.querySelector(".bk-telemetry-num");
			if (numEl && numEl.textContent !== formatted) {
				numEl.textContent = formatted;
			}

			let toneLabelEl = row.querySelector(".bk-telemetry-tone-label");
			if (ruleMatch.label) {
				if (!toneLabelEl) {
					toneLabelEl = document.createElement("span");
					toneLabelEl.className = "bk-telemetry-tone-label";
					const valContainer = row.querySelector(".bk-telemetry-value");
					if (valContainer) {
						valContainer.appendChild(toneLabelEl);
					} else {
						row.appendChild(toneLabelEl);
					}
				}
				if (toneLabelEl.textContent !== ruleMatch.label) {
					toneLabelEl.textContent = ruleMatch.label;
				}
				toneLabelEl.removeAttribute("hidden");
			} else if (toneLabelEl) {
				toneLabelEl.setAttribute("hidden", "");
				toneLabelEl.textContent = "";
			}
		});

		// Also update any detached/test containers with matching data-sim-id
		document
			.querySelectorAll(
				`[data-sim-id="${getSafeCssSelectorKey(simId)}"] .bk-telemetry-row[data-telemetry-key="${safeKey}"] .bk-telemetry-num`,
			)
			.forEach((numEl) => {
				if (numEl.textContent !== formatted) {
					numEl.textContent = formatted;
				}
			});

		// Check notification / badge
		if (!isFirst) {
			const notifyMode = itemSchema?.notify ?? "off";
			if (notifyMode === "change") {
				if (state.prevValues[key] !== rawValue) {
					state.unseenChangedKeys.add(key);
				}
			} else if (notifyMode === "range-change") {
				const prev = state.prevRangeMatches[key];
				const prevIndex = prev ? prev.ruleIndex : -2;
				const prevTone = prev ? prev.tone : undefined;
				if (prevIndex !== ruleMatch.ruleIndex || prevTone !== ruleMatch.tone) {
					state.unseenChangedKeys.add(key);
				}
			}
		}

		state.prevValues[key] = rawValue;
		state.prevRangeMatches[key] = ruleMatch;
	}

	state.isFirstFrame = false;

	// Pass merged telemetry values to plot runtime after updates
	if (state.plotsInstance) {
		try {
			state.plotsInstance.update(state.values);
		} catch (_) {}
	}

	// If currently viewing Measurements tab, clear unseen keys
	if (tabActive) {
		state.unseenChangedKeys.clear();
	}

	updateTabBadge(
		state.figure,
		state.measurements?.badge,
		state.unseenChangedKeys.size,
	);
}

function queueTelemetryUpdate(
	simId: string,
	data: Record<string, unknown>,
): void {
	if (!data || typeof data !== "object" || Array.isArray(data)) return;
	const state = simRegistry.get(simId);
	if (!state) return;

	const keys = Object.keys(data);
	const maxKeys = 200; // bound input work per update
	const limit = Math.min(keys.length, maxKeys);

	for (let i = 0; i < limit; i++) {
		const key = keys[i];
		if (isDisallowedKey(key)) continue;
		const declared =
			Object.hasOwn(state.schema ?? {}, key) ||
			state.measurements?.plots?.some(
				(plot) =>
					plot.x === key ||
					plot.y === key ||
					plot.data === key ||
					plot.series?.some((series) => series.y === key),
			);
		if (!declared) continue;
		const val = data[key];
		state.values[key] = val;
		state.pending[key] = val;
	}

	if (state.rafId === null) {
		state.rafId = requestAnimationFrame(() => {
			state.rafId = null;
			applyTelemetryUpdate(simId);
			state.pending = {};
		});
	}
}

function findSimIdForWindow(sourceWindow: Window): string | null {
	for (const [id, state] of simRegistry.entries()) {
		const iframe = state.figure.querySelector<HTMLIFrameElement>(
			".bk-embed-frame iframe",
		);
		if (iframe) {
			try {
				if (iframe.contentWindow === sourceWindow) {
					return id;
				}
			} catch (_) {}
		}
	}
	return null;
}

export function bkWireTelemetry(): void {
	bkWireWorkspace();
	if (isWireInitialized) return;
	isWireInitialized = true;

	// 1. Listen for sandbox telemetry messages from simulation iframes
	window.addEventListener("message", (event: MessageEvent) => {
		if (!event.data || typeof event.data !== "object") return;
		if (event.data.type !== "bk:telemetry") return;
		if (!event.data.data || typeof event.data.data !== "object") return;

		const sourceWindow = event.source;
		if (!sourceWindow) return;

		const simId = findSimIdForWindow(sourceWindow as Window);
		if (!simId) return;

		queueTelemetryUpdate(simId, event.data.data);
	});

	document.addEventListener("bk:simulation-reset", (event) => {
		const id = (event as CustomEvent<{ id: string }>).detail?.id;
		if (id) bkResetTelemetry(id);
	});

	// Listen for tab clicks and tab-selected events to clear measurement badge
	document.addEventListener("click", (event: MouseEvent) => {
		const target = event.target as Element | null;
		if (!target) return;
		const tab = target.closest?.('[role="tab"]');
		if (!tab) return;
		const controls = tab.getAttribute("aria-controls") || "";
		if (tab.id.endsWith("-tab-telemetry") || controls.includes("telemetry")) {
			const figure = tab.closest(".bk-object");
			if (figure) {
				const id = figure.id || figure.getAttribute("data-telemetry-id");
				if (id) bkClearMeasurementBadge(id);
			}
		}
	});

	document.addEventListener("bk:tab-selected", (event: Event) => {
		const custom = event as CustomEvent<{ tabKey: string }>;
		if (custom.detail?.tabKey === "telemetry") {
			const target = custom.target as Element;
			if (target) {
				const figure = target.closest?.(".bk-object") || target;
				const id = figure.id || figure.getAttribute("data-telemetry-id");
				if (id) bkClearMeasurementBadge(id);
			}
		}
	});
}

export function bkInitTelemetry(): void {
	const schemaElements = Array.from(
		document.querySelectorAll(".bk-sim-telemetry-schema"),
	);
	const telemetryFigures: Array<{
		figure: Element;
		id: string;
		title: string;
		schema: Record<string, SimulationTelemetryItem>;
		measurements: MeasurementsConfig | null;
	}> = [];

	schemaElements.forEach((schemaEl, idx) => {
		const figure = schemaEl.closest(".bk-object");
		if (!figure) return;

		let schema: Record<string, SimulationTelemetryItem> | null = null;
		let measurements: MeasurementsConfig | null = null;

		if (schemaEl.textContent) {
			try {
				const parsed = JSON.parse(schemaEl.textContent);
				if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
					if ("telemetry" in parsed || "measurements" in parsed) {
						schema =
							(parsed.telemetry as Record<string, SimulationTelemetryItem>) ||
							{};
						measurements = (parsed.measurements as MeasurementsConfig) || null;
					} else {
						schema = parsed as Record<string, SimulationTelemetryItem>;
					}
				}
			} catch (_) {}
		}

		if (!measurements) {
			const configScript = figure.querySelector(
				".bk-sim-config, .bk-world-config",
			);
			if (configScript?.textContent) {
				try {
					const parsedConfig = JSON.parse(configScript.textContent);
					if (parsedConfig?.measurements) {
						measurements = parsedConfig.measurements;
					}
				} catch (_) {}
			}
		}

		const hasScalars = Boolean(schema && Object.keys(schema).length > 0);
		const hasPlots = Boolean(
			measurements?.plots && measurements.plots.length > 0,
		);
		const hasBadge = Boolean(
			measurements?.badge && measurements.badge !== "off",
		);

		if (!hasScalars && !hasPlots && !hasBadge) return;

		const id =
			figure.id || figure.getAttribute("data-telemetry-id") || `sim-${idx}`;
		const title =
			figure.getAttribute("data-telemetry-title") ||
			figure.querySelector(".bk-object-title")?.textContent?.trim() ||
			(figure.classList.contains("bk-steps-object")
				? "Step-by-Step Simulation"
				: "Interactive Simulation");

		telemetryFigures.push({
			figure,
			id,
			title,
			schema: schema || {},
			measurements,
		});
	});

	const docBtn = document.getElementById("bk-doc-telemetry-btn");

	// For none don't show toolbar button
	if (telemetryFigures.length === 0) {
		if (docBtn) docBtn.setAttribute("hidden", "");
		simRegistry.forEach((state) => {
			if (state.rafId !== null) cancelAnimationFrame(state.rafId);
			if (state.plotsInstance) {
				try {
					state.plotsInstance.dispose();
				} catch (_) {}
			}
		});
		simRegistry.clear();
		return;
	}

	// Clean up previous plot instances before re-registering
	simRegistry.forEach((state) => {
		if (state.rafId !== null) cancelAnimationFrame(state.rafId);
		if (state.plotsInstance) {
			try {
				state.plotsInstance.dispose();
			} catch (_) {}
		}
	});
	simRegistry.clear();

	telemetryFigures.forEach((tf) => {
		let plotsInstance: MeasurementPlotsInstance | null = null;
		let plotsContainer: HTMLElement | null = null;

		if (tf.measurements?.plots && tf.measurements.plots.length > 0) {
			plotsContainer = tf.figure.querySelector<HTMLElement>(
				".bk-measurement-plots",
			);
			if (plotsContainer && createMeasurementPlots) {
				try {
					plotsInstance = createMeasurementPlots(
						plotsContainer,
						tf.measurements.plots,
					);
				} catch (_) {}
			}
		}

		simRegistry.set(tf.id, {
			id: tf.id,
			title: tf.title,
			figure: tf.figure,
			schema: tf.schema,
			measurements: tf.measurements,
			pending: {},
			values: {},
			prevValues: {},
			prevRangeMatches: {},
			unseenChangedKeys: new Set<string>(),
			isFirstFrame: true,
			plotsInstance,
			plotsContainer,
			rafId: null,
		});

		const iframe = tf.figure.querySelector<HTMLIFrameElement>(
			".bk-embed-frame iframe",
		);
		if (iframe) {
			iframe.addEventListener("load", () => {
				bkResetTelemetry(tf.id);
			});
		}
	});

	bkResetTelemetry();
}
