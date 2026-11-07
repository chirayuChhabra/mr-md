// @ts-nocheck
import type { SimulationTelemetryItem } from "../types.js";
import { bkWireWorkspace } from "./workspace.js";

export {
	bkCollapseLab,
	bkExpandLab,
	bkSelectInspectorTab,
	bkToggleExpandLab,
} from "./workspace.js";

interface SimulationState {
	id: string;
	title: string;
	figure: Element;
	schema: Record<string, SimulationTelemetryItem> | null;
	pending: Record<string, unknown>;
	values: Record<string, unknown>;
	rafId: number | null;
}

const simRegistry = new Map<string, SimulationState>();
let isWireInitialized = false;

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

function getSafeCssSelectorKey(key: string): string {
	return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(key) : key;
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
			state.figure.querySelectorAll(".bk-telemetry-num").forEach((numEl) => {
				if (numEl.textContent !== "—") numEl.textContent = "—";
			});
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
	}
	document.querySelectorAll(".bk-telemetry-num").forEach((numEl) => {
		if (numEl.textContent !== "—") numEl.textContent = "—";
	});
}

function applyTelemetryUpdate(simId: string): void {
	const state = simRegistry.get(simId);
	if (!state) return;

	for (const [key, rawValue] of Object.entries(state.pending)) {
		const safeKey = getSafeCssSelectorKey(key);
		const rows = state.figure.querySelectorAll(
			`.bk-telemetry-row[data-telemetry-key="${safeKey}"]`,
		);

		const itemSchema = state.schema?.[key];
		const formatted = formatTelemetryValue(rawValue, itemSchema);

		rows.forEach((row) => {
			row.setAttribute(
				"data-value-type",
				typeof rawValue === "number" ? "number" : "status",
			);
			const numEl = row.querySelector(".bk-telemetry-num");
			if (numEl && numEl.textContent !== formatted) {
				numEl.textContent = formatted;
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
	}
}

function queueTelemetryUpdate(
	simId: string,
	data: Record<string, unknown>,
): void {
	if (!data || typeof data !== "object" || Array.isArray(data)) return;
	const state = simRegistry.get(simId);
	if (!state) return;

	Object.assign(state.values, data);
	Object.assign(state.pending, data);

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
	}> = [];

	schemaElements.forEach((schemaEl, idx) => {
		const figure = schemaEl.closest(".bk-object");
		if (!figure) return;

		let schema: Record<string, SimulationTelemetryItem> | null = null;
		if (schemaEl.textContent) {
			try {
				schema = JSON.parse(schemaEl.textContent);
			} catch (_) {}
		}
		if (!schema || Object.keys(schema).length === 0) return;

		const id =
			figure.id || figure.getAttribute("data-telemetry-id") || `sim-${idx}`;
		const title =
			figure.getAttribute("data-telemetry-title") ||
			figure.querySelector(".bk-object-title")?.textContent?.trim() ||
			(figure.classList.contains("bk-steps-object")
				? "Step-by-Step Simulation"
				: "Interactive Simulation");

		telemetryFigures.push({ figure, id, title, schema });
	});

	const docBtn = document.getElementById("bk-doc-telemetry-btn");

	// For none don't show toolbar button
	if (telemetryFigures.length === 0) {
		if (docBtn) docBtn.setAttribute("hidden", "");
		simRegistry.clear();
		return;
	}

	// Register simulations in state
	simRegistry.clear();
	telemetryFigures.forEach((tf) => {
		simRegistry.set(tf.id, {
			id: tf.id,
			title: tf.title,
			figure: tf.figure,
			schema: tf.schema,
			pending: {},
			values: {},
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
