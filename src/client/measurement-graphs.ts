import type { SimulationTelemetry } from "../types.js";
import {
	graphValue,
	renderMeasurementGraph,
} from "./measurement-graph-plot.js";

export interface MeasurementGraphPoint {
	sampleId?: number;
	time: number;
	x: number;
	y: number;
	/** Samples from different branches are never joined. */
	branchId?: string;
	interaction?: { id: string; label: string };
}

export interface MeasurementGraphSpec {
	yKey?: string;
	key: string;
	label: string;
	precision?: number;
	xAxis: { key: string; label: string; unit?: string };
	yAxis: { label: string; unit?: string };
}

export interface MeasurementGraphWindowState {
	axes?: { x: string; y: string };
	key: string;
	minimized?: boolean;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
}

export function measurementGraphSpecs(
	schema: SimulationTelemetry,
): MeasurementGraphSpec[] {
	return Object.entries(schema).flatMap(([key, item]) => {
		if (!item.graph) return [];
		const graph = typeof item.graph === "object" ? item.graph : {};
		const xKey = graph.x?.key ?? "time",
			xItem = Object.hasOwn(schema, xKey) ? schema[xKey] : undefined;
		return [
			{
				key,
				label: graph.label ?? item.label ?? key,
				precision: item.precision,
				xAxis: {
					key: xKey,
					label:
						graph.x?.label ?? xItem?.label ?? (xKey === "time" ? "Time" : xKey),
					unit:
						graph.x?.unit ?? xItem?.unit ?? (xKey === "time" ? "s" : undefined),
				},
				yAxis: {
					label: graph.y?.label ?? item.label ?? key,
					unit: graph.y?.unit ?? item.unit,
				},
			},
		];
	});
}

const chartCss = `.bk-graph-plot svg{display:block;width:100%;height:100%;min-height:0}.bk-graph-plot text{fill:var(--muted,#686868);font:12px var(--font-sans,system-ui)}.bk-chart-grid{stroke:var(--line,#ddd);stroke-width:1;stroke-dasharray:2 4;opacity:0.6}.bk-chart-trace{stroke:var(--accent,#3674c5);stroke-width:2.2;stroke-linejoin:round;vector-effect:non-scaling-stroke}.bk-chart-current{fill:var(--paper,#fff);stroke:var(--accent,#3674c5);stroke-width:2}.bk-graph-empty{display:grid;place-items:center;height:100%;min-height:100px;margin:0;color:var(--muted,#777);font-size:13px}`;

const interactionCss = `.bk-chart-user-trace{stroke:var(--bk-chart-interaction,var(--amber,#b45309));stroke-dasharray:6 4}.bk-chart-user-band{fill:var(--bk-chart-interaction,var(--amber,#b45309));fill-opacity:.12}.bk-chart-user-marker{fill:var(--paper,#fff);stroke:var(--bk-chart-interaction,var(--amber,#b45309));stroke-width:2;vector-effect:non-scaling-stroke}.bk-chart-interaction-legend line{stroke:var(--bk-chart-interaction,var(--amber,#b45309));stroke-width:2;stroke-dasharray:6 4}.bk-chart-interaction-legend text{fill:var(--ink,#20242a);font-size:11px}`;

const windowCss = `.bk-graph-layer{position:absolute!important;inset:0!important;z-index:25!important;pointer-events:none!important;background:transparent!important;overflow:hidden!important;width:100%!important;height:100%!important;color:var(--ink);font:13px var(--font-sans,system-ui)}.bk-graph-layer[hidden]{display:none!important}.bk-graph-window{position:absolute!important;pointer-events:auto!important;display:flex;flex-direction:column;box-sizing:border-box;min-width:min(280px,calc(100% - 16px));min-height:180px;max-width:calc(100% - 16px);max-height:calc(100% - 16px);resize:both;overflow:hidden;border:1px solid var(--line-strong);border-radius:12px;background:color-mix(in srgb,var(--paper) 95%,var(--bg));backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 14px 38px -4px rgba(0,0,0,0.18),0 2px 6px rgba(0,0,0,0.05);transition:box-shadow .15s ease,border-color .15s ease}.bk-graph-window:hover,.bk-graph-window:focus-within{border-color:color-mix(in srgb,var(--accent) 45%,var(--line-strong));box-shadow:0 18px 46px -4px rgba(0,0,0,0.24)}.bk-graph-window[data-minimized=true]{height:44px}.bk-graph-window-header{display:flex;align-items:center;gap:8px;flex:0 0 42px;padding:0 10px 0 14px;box-sizing:border-box;background:color-mix(in srgb,var(--paper) 65%,var(--bg));border-bottom:1px solid var(--line);cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}.bk-graph-window-header:active{cursor:grabbing}.bk-graph-window-header strong{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;font-weight:600;color:var(--ink)}.bk-graph-value{font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;padding:2px 8px;border-radius:6px;background:color-mix(in srgb,var(--accent) 12%,var(--paper));color:var(--accent);border:1px solid color-mix(in srgb,var(--accent) 22%,transparent)}.bk-graph-window-header button{flex:0 0 28px;width:28px;height:28px;display:grid;place-items:center;padding:0;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--muted);font:16px/1 var(--font-sans,system-ui);cursor:pointer;transition:all .15s ease}.bk-graph-window-header button:hover{background:var(--bg);color:var(--ink);border-color:var(--line)}.bk-graph-window-header button svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.bk-graph-window button:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}.bk-graph-plot{flex:1;min-height:0;padding:4px 12px 12px;position:relative;touch-action:pan-y}.bk-graph-window[data-minimized=true] :is(.bk-graph-plot,.bk-graph-error){display:none!important}.bk-graph-error{margin:0;padding:8px 16px;font-size:12px}.bk-graph-error[hidden]{display:none}.bk-chart-cursor{stroke:var(--accent);stroke-dasharray:4 3;pointer-events:none}.bk-chart-comparison{stroke:var(--muted);stroke-width:1.5;stroke-dasharray:5 4;vector-effect:non-scaling-stroke}.bk-chart-readout{max-width:calc(100% - 32px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;position:absolute;right:16px;top:4px;background:var(--paper);color:var(--ink);font:12px var(--font-sans,system-ui);font-variant-numeric:tabular-nums;pointer-events:none}.bk-graph-comparison-label{grid-column:1/-1;text-align:left;border:0;border-bottom:1px solid var(--line);background:var(--bg);color:var(--ink);padding:8px 16px;font:inherit;cursor:pointer}`;

interface WindowNodes {
	node: HTMLElement;
	header: HTMLElement;
	value: HTMLElement;
	plot: HTMLElement;
	error: HTMLElement;
	minimize: HTMLButtonElement;
	drag?: { id: number; x: number; y: number; left: number; top: number };
}

interface PopupCard {
	node: HTMLElement;
	plot: HTMLElement;
	value: HTMLElement;
}

interface PopupView {
	window: Window;
	selected: Set<string>;
	cards: Map<string, PopupCard>;
	inputs: Map<string, HTMLInputElement>;
	grid: HTMLElement;
	status: HTMLElement;
}

const finite = (value: unknown, fallback: number) =>
	typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function createMeasurementGraphWorkspace(options: {
	figure: HTMLElement;
	simId: string;
	specs: MeasurementGraphSpec[];
	initialWindows: MeasurementGraphWindowState[];
	onWindowsChange: (states: MeasurementGraphWindowState[]) => void;
}) {
	const { figure, specs, onWindowsChange } = options,
		doc = figure.ownerDocument,
		documentView = doc.defaultView;
	if (!documentView)
		throw new Error("Graph workspace requires a document window");
	const view = documentView;
	const byKey = new Map(specs.map((spec) => [spec.key, spec]));
	const states = new Map<string, MeasurementGraphWindowState>();
	const nodes = new Map<string, WindowNodes>();
	let cleaned = false;
	let cursor: number | null = null;
	let pinnedCursor: number | null = null;
	let comparison: {
		label: string;
		data: Record<string, MeasurementGraphPoint[]>;
	} | null = null;
	const localCursors = new Map<string, number | null>();
	const cursorListeners = new Set<(time: number | null) => void>();
	let data: Record<string, MeasurementGraphPoint[]> = Object.create(null),
		z = 0,
		disposed = false,
		popup: PopupView | null = null;
	const layer = doc.createElement("div");
	layer.className = "bk-graph-layer";
	const style = doc.createElement("style");
	style.textContent =
		windowCss +
		chartCss +
		interactionCss +
		`
.bk-graph-comparison-label{position:absolute;top:10px;left:10px;max-width:calc(100% - 20px);pointer-events:auto;border:1px solid var(--line);border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.06)}
html[data-ui=neo] .bk-graph-window{border-radius:0!important;box-shadow:4px 4px 0 var(--line)}
html[data-ui=playful] .bk-graph-window{border-radius:20px!important}
`;
	layer.append(style);
	figure.append(layer);
	const snapshot = () => Array.from(states.values(), (state) => ({ ...state }));
	const notify = () => onWindowsChange(snapshot());
	const active = () => figure.classList.contains("bk-object--maximized");
	const bounds = () => {
		return { width: view.innerWidth, height: view.innerHeight };
	};

	function fit(state: MeasurementGraphWindowState, node: WindowNodes) {
		const width = Math.min(
			Math.max(280, finite(state.width, 420)),
			Math.max(180, bounds().width - 16),
		);
		const height = Math.min(
			Math.max(220, finite(state.height, 290)),
			Math.max(100, bounds().height - 16),
		);
		state.width = width;
		state.height = height;
		if (active()) {
			state.x = Math.max(
				8,
				Math.min(finite(state.x, 24), Math.max(8, bounds().width - width - 8)),
			);
			state.y = Math.max(
				8,
				Math.min(
					finite(state.y, 80),
					Math.max(8, bounds().height - (state.minimized ? 44 : height) - 8),
				),
			);
		}

		node.node.style.width = `${width}px`;
		node.node.style.height = `${state.minimized ? 44 : height}px`;
		node.node.style.left = `${finite(state.x, 24)}px`;
		node.node.style.top = `${finite(state.y, 80)}px`;
		node.node.dataset.minimized = String(Boolean(state.minimized));
		node.minimize.setAttribute(
			"aria-label",
			state.minimized ? "Restore graph" : "Minimize graph",
		);
		node.minimize.title = state.minimized ? "Restore graph" : "Minimize graph";
		node.minimize.textContent = state.minimized ? "+" : "−";
	}

	function setTheme(target: Document) {
		const colors = view.getComputedStyle(figure);
		for (const token of [
			"--paper",
			"--bg",
			"--ink",
			"--muted",
			"--line",
			"--line-strong",
			"--accent",
			"--amber",
			"--bk-chart-interaction",
			"--font-sans",
		]) {
			const value = colors.getPropertyValue(token);
			if (value.trim()) target.documentElement.style.setProperty(token, value);
		}
		target.documentElement.dataset.ui =
			doc.documentElement.dataset.ui || "standard";
		target.documentElement.dataset.theme =
			doc.documentElement.dataset.theme || "light";
	}

	function updatePopupStatusAndValues() {
		if (!popup) return;
		try {
			if (popup.window.closed) {
				popup = null;
				return;
			}
			const state = popup;
			if (state.window.document !== state.grid.ownerDocument) {
				popup = null;
				return;
			}
			const isPaused =
				figure.getAttribute("data-bk-playback-state") === "paused";
			let latest = 0;
			for (const points of Object.values(data)) {
				if (points.length) {
					const t = points[points.length - 1].time;
					if (t > latest) latest = t;
				}
			}
			state.status.textContent = disposed
				? "Source disconnected"
				: `${isPaused ? "Paused" : "Live"} · ${Number(latest.toFixed(1))} s`;

			for (const spec of specs) {
				const selected = state.selected.has(spec.key);
				const input = state.inputs.get(spec.key);
				if (input) input.checked = selected;
				let card = state.cards.get(spec.key);
				if (!selected) {
					card?.node.remove();
					state.cards.delete(spec.key);
					continue;
				}
				if (!card) {
					const pd = state.window.document,
						node = pd.createElement("section"),
						heading = pd.createElement("div"),
						title = pd.createElement("h2"),
						value = pd.createElement("span"),
						chart = pd.createElement("div");
					node.dataset.measurementKey = spec.key;
					heading.className = "bk-graph-card-heading";
					title.textContent = spec.label;
					value.className = "bk-graph-value";
					chart.className = "bk-graph-plot";
					heading.append(title, value);
					node.append(heading, chart);
					state.grid.append(node);
					card = { node, plot: chart, value };
					state.cards.set(spec.key, card);
				}
				const points = data[spec.key] || [],
					last = points.at(-1);
				card.value.textContent = last
					? `${graphValue(last.y, spec.precision)}${spec.yAxis.unit ? ` ${spec.yAxis.unit}` : ""}`
					: "—";
			}

			state.grid.dataset.count = String(state.cards.size);
			let empty = state.grid.querySelector<HTMLElement>(
				".bk-graph-workspace-empty",
			);
			if (state.cards.size === 0) {
				if (!empty) {
					empty = state.window.document.createElement("p");
					empty.className = "bk-graph-empty bk-graph-workspace-empty";
					empty.textContent =
						"No graphs selected. Select one or more graphs above to display them.";
					state.grid.append(empty);
				}
			} else {
				empty?.remove();
			}
		} catch (_) {
			popup = null;
		}
	}

	function renderPopupPlots() {
		if (!popup || popup.window.closed) return;
		try {
			for (const spec of specs) {
				if (!popup.selected.has(spec.key)) continue;
				const card = popup.cards.get(spec.key);
				if (card) {
					renderMeasurementGraph(card.plot, spec, data[spec.key] || []);
				}
			}
		} catch (_) {
			popup = null;
		}
	}

	function updatePopup() {
		updatePopupStatusAndValues();
		renderPopupPlots();
	}

	function maximize(key: string, error: HTMLElement) {
		try {
			if (popup && !popup.window.closed) {
				popup.selected.add(key);
				updatePopup();
				popup.window.focus();
				error.hidden = true;
				return;
			}
			const child = view.open("about:blank", "_blank");
			if (!child) {
				error.textContent =
					"The graph tab was blocked. Allow pop-ups for this page, then try Maximize again.";
				error.hidden = false;
				return;
			}
			const pd = child.document;
			pd.title = "Measurement graphs";
			const css = pd.createElement("style");
			css.textContent =
				`body{margin:0;background:var(--bg,#f5f5f5);color:var(--ink,#222);font:14px var(--font-sans,system-ui)}.bk-graph-workspace{max-width:1600px;margin:auto;padding:32px;box-sizing:border-box}.bk-graph-workspace-heading{display:flex;align-items:center;justify-content:space-between;gap:24px}.bk-graph-workspace-heading h1{margin:0;font-size:24px;font-weight:500}.bk-graph-workspace-heading p{margin:8px 0 0;color:var(--muted,#777)}.bk-graph-workspace-status{white-space:nowrap;color:var(--muted,#777);font-variant-numeric:tabular-nums}.bk-graph-choices{display:flex;flex-wrap:wrap;gap:12px 24px;margin:28px 0}.bk-graph-choices label{display:flex;align-items:center;gap:8px;cursor:pointer}.bk-graph-choices input{accent-color:var(--accent,#3674c5)}#charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,540px),1fr));gap:24px;align-items:stretch}#charts[data-count="1"],#charts:has(> section:only-child){grid-template-columns:1fr}#charts[data-count="0"]{display:block}#charts section{min-width:0;display:flex;flex-direction:column;background:var(--paper,#fff);border:1px solid var(--line,#ddd);border-radius:10px;overflow:hidden}.bk-graph-card-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 24px 0}.bk-graph-card-heading h2{margin:0;font-size:14px;font-weight:500}.bk-graph-card-heading .bk-graph-value{font-variant-numeric:tabular-nums}.bk-graph-plot{flex:1;min-height:320px;height:320px;padding:8px 16px 20px;box-sizing:border-box}#charts[data-count="1"] .bk-graph-plot{min-height:420px;height:420px}@media(max-width:800px){.bk-graph-workspace{padding:20px}#charts{grid-template-columns:1fr}}` +
				chartCss +
				interactionCss;
			pd.head.append(css);
			setTheme(pd);
			const root = pd.createElement("main");
			root.className = "bk-graph-workspace";
			const heading = pd.createElement("header");
			heading.className = "bk-graph-workspace-heading";
			const caption = pd.createElement("div"),
				title = pd.createElement("h1"),
				source = pd.createElement("p"),
				status = pd.createElement("span");
			title.textContent = "Measurement graphs";
			source.textContent =
				figure.querySelector(".bk-object-title")?.textContent?.trim() ||
				"Simulation measurements";
			status.className = "bk-graph-workspace-status";
			caption.append(title, source);
			heading.append(caption, status);
			const choices = pd.createElement("div");
			choices.className = "bk-graph-choices";
			choices.setAttribute("aria-label", "Visible graphs");
			const grid = pd.createElement("div");
			grid.id = "charts";
			const state: PopupView = {
				window: child,
				selected: new Set([key, ...states.keys()]),
				cards: new Map(),
				inputs: new Map(),
				grid,
				status,
			};
			popup = state;
			for (const spec of specs) {
				const label = pd.createElement("label"),
					input = pd.createElement("input");
				input.type = "checkbox";
				input.checked = state.selected.has(spec.key);
				input.addEventListener("change", () => {
					if (input.checked) state.selected.add(spec.key);
					else state.selected.delete(spec.key);
					updatePopup();
				});
				label.append(input, pd.createTextNode(spec.label));
				choices.append(label);
				state.inputs.set(spec.key, input);
			}
			root.append(heading, choices, grid);
			pd.body.append(root);
			child.addEventListener(
				"pagehide",
				() => {
					if (popup === state) popup = null;
				},
				{ once: true },
			);
			updatePopup();
			error.hidden = true;
		} catch (_) {
			error.textContent =
				"Could not open the graph workspace. Try Maximize again.";
			error.hidden = false;
		}
	}

	let rafId: number | null = null;

	function cancelPendingRender() {
		if (rafId !== null) {
			const caf =
				(view as any).cancelAnimationFrame ||
				(globalThis as any).cancelAnimationFrame;
			if (typeof caf === "function") caf(rafId);
			rafId = null;
		}
	}

	function updateWindowHeader(key: string) {
		const spec = byKey.get(key),
			parts = nodes.get(key);
		if (!spec || !parts) return;
		const points = data[key] || [],
			last = points.at(-1);
		parts.value.textContent = last
			? `${graphValue(last.y, spec.precision)}${spec.yAxis.unit ? ` ${spec.yAxis.unit}` : ""}`
			: "—";
	}

	function renderWindowPlot(key: string) {
		const spec = byKey.get(key),
			state = states.get(key),
			parts = nodes.get(key);
		if (!spec || !state || !parts) return;
		if (!state.minimized) {
			renderMeasurementGraph(parts.plot, spec, data[key] || [], {
				cursor: spec.xAxis.key === "time" ? cursor : localCursors.get(key),
				comparison: comparison?.data[key],
				onInspect: (point) => {
					if (spec.xAxis.key !== "time") {
						localCursors.set(key, point?.time ?? null);
						renderWindowPlot(key);
						return;
					}
					cursor = point?.time ?? pinnedCursor;
					for (const listener of cursorListeners) listener(cursor);
					for (const other of states.keys()) renderWindowPlot(other);
				},
			});
		}
	}

	function updateWindow(key: string) {
		updateWindowHeader(key);
		renderWindowPlot(key);
	}

	function flush() {
		cancelPendingRender();
		if (disposed) return;
		for (const key of states.keys()) renderWindowPlot(key);
		renderPopupPlots();
	}

	function scheduleRender() {
		if (rafId !== null) return;
		const raf =
			(view as any).requestAnimationFrame ||
			(globalThis as any).requestAnimationFrame;
		if (typeof raf === "function") {
			rafId = raf(() => {
				rafId = null;
				if (!disposed) {
					for (const key of states.keys()) renderWindowPlot(key);
					renderPopupPlots();
				}
			});
		} else {
			flush();
		}
	}

	const ResizeObs =
		(view as any).ResizeObserver || (globalThis as any).ResizeObserver;

	const windowResizeObserver = ResizeObs
		? new ResizeObs((entries: any[]) => {
				for (const entry of entries) {
					const target = entry.target as HTMLElement;
					const key = target?.dataset?.measurementKey;
					if (!key) continue;
					const state = states.get(key);
					const parts = nodes.get(key);
					if (!state || !parts || state.minimized) continue;
					const rect = entry.contentRect ||
						target.getBoundingClientRect?.() || {
							width: parts.node.offsetWidth,
							height: parts.node.offsetHeight,
						};
					if (rect.width > 0 && rect.height > 0) {
						const w = Math.round(parts.node.offsetWidth || rect.width);
						const h = Math.round(parts.node.offsetHeight || rect.height);
						if (
							Math.abs(w - (state.width ?? 0)) > 2 ||
							Math.abs(h - (state.height ?? 0)) > 2
						) {
							state.width = w;
							state.height = h;
							fit(state, parts);
							updateWindow(key);
							notify();
						}
					}
				}
			})
		: null;

	const figureResizeObserver = ResizeObs
		? new ResizeObs(() => {
				synchronize();
			})
		: null;
	if (figureResizeObserver) {
		figureResizeObserver.observe(figure);
		const stage = figure.querySelector(".bk-sim-stage");
		if (stage) figureResizeObserver.observe(stage);
	}

	function create(state: MeasurementGraphWindowState) {
		const spec = byKey.get(state.key);
		if (!spec) return;
		const node = doc.createElement("section"),
			header = doc.createElement("div"),
			title = doc.createElement("strong"),
			value = doc.createElement("span"),
			plot = doc.createElement("div"),
			error = doc.createElement("p");
		node.className = "bk-graph-window";
		node.dataset.measurementKey = state.key;
		node.setAttribute("role", "region");
		node.setAttribute("aria-label", `${spec.label} graph`);
		node.style.zIndex = String(++z);
		header.className = "bk-graph-window-header";
		header.tabIndex = 0;
		header.setAttribute("aria-label", `${spec.label} graph position`);
		header.setAttribute(
			"aria-description",
			"Drag to move, or use arrow keys. Resize from the bottom corner.",
		);

		title.textContent = spec.label;
		value.className = "bk-graph-value";
		plot.className = "bk-graph-plot";
		error.className = "bk-graph-error";
		error.hidden = true;
		error.setAttribute("role", "alert");
		header.append(title, value);
		const button = (label: string, symbol: string, callback: () => void) => {
			const button = doc.createElement("button");
			button.type = "button";
			button.setAttribute("aria-label", label);
			button.title = label;
			button.textContent = symbol;
			button.addEventListener("click", callback);
			header.append(button);
			return button;
		};
		const minimize = button(
			state.minimized ? "Restore graph" : "Minimize graph",
			state.minimized ? "+" : "−",
			() => {
				state.minimized = !state.minimized;
				const parts = nodes.get(state.key);
				if (parts) {
					fit(state, parts);
					updateWindow(state.key);
				}
				notify();
			},
		);
		button("Fit graph", "⤢", () => {
			delete (plot as any).__chartScale;
			updateWindow(state.key);
		});
		const maximizeButton = button("Maximize graph", "", () =>
			maximize(state.key, error),
		);
		const icon = doc.createElementNS("http://www.w3.org/2000/svg", "svg"),
			path = doc.createElementNS(icon.namespaceURI, "path");
		icon.setAttribute("viewBox", "0 0 20 20");
		icon.setAttribute("aria-hidden", "true");
		path.setAttribute("d", "M11 3h6v6M17 3l-7 7M8 4H3v13h13v-5");
		icon.append(path);
		maximizeButton.title = "Open graphs in a new tab";
		maximizeButton.append(icon);
		button("Close graph", "×", () => close(state.key));
		node.append(header, plot, error);
		layer.append(node);
		const parts: WindowNodes = { node, header, value, plot, error, minimize };
		nodes.set(state.key, parts);
		fit(state, parts);
		windowResizeObserver?.observe(node);
		header.addEventListener("pointerdown", (event) => {
			if ((event.target as HTMLElement).closest("button") || event.button !== 0)
				return;
			event.preventDefault();
			header.focus();
			header.setPointerCapture?.(event.pointerId);
			parts.drag = {
				id: event.pointerId,
				x: event.clientX,
				y: event.clientY,
				left: state.x || 0,
				top: state.y || 0,
			};
			node.style.zIndex = String(++z);
		});
		header.addEventListener("pointermove", (event) => {
			const drag = parts.drag;
			if (!drag || drag.id !== event.pointerId) return;
			state.x = drag.left + event.clientX - drag.x;
			state.y = drag.top + event.clientY - drag.y;
			fit(state, parts);
		});
		const endDrag = () => {
			if (parts.drag) {
				parts.drag = undefined;
				notify();
			}
		};
		header.addEventListener("pointerup", endDrag);
		header.addEventListener("pointercancel", endDrag);
		header.addEventListener("lostpointercapture", endDrag);
		header.addEventListener("keydown", (event) => {
			if (
				event.target !== header ||
				!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
			)
				return;
			event.preventDefault();
			const step = event.shiftKey ? 32 : 8;
			state.x =
				(state.x || 0) +
				(event.key === "ArrowLeft"
					? -step
					: event.key === "ArrowRight"
						? step
						: 0);
			state.y =
				(state.y || 0) +
				(event.key === "ArrowUp"
					? -step
					: event.key === "ArrowDown"
						? step
						: 0);
			fit(state, parts);
			notify();
		});

		node.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				close(state.key);
			}
		});
		updateWindow(state.key);
	}

	function close(key: string) {
		const parts = nodes.get(key);
		if (!parts) return;
		windowResizeObserver?.unobserve(parts.node);
		parts.node.remove();
		nodes.delete(key);
		states.delete(key);
		layer.hidden = states.size === 0;
		notify();
		const returnButton = Array.from(
			figure.querySelectorAll<HTMLElement>("[data-measurement-graph]"),
		).find((button) => button.dataset.measurementGraph === key);
		if (returnButton?.getClientRects().length) returnButton.focus();
		else
			figure
				.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
				?.focus();
	}

	function synchronize() {
		layer.hidden = states.size === 0;
		if (states.size > 0) {
			for (const [key, state] of states) {
				const parts = nodes.get(key);
				if (parts) {
					fit(state, parts);
					updateWindow(key);
				}
			}
			notify();
		}
		if (popup && !popup.window.closed) {
			setTheme(popup.window.document);
			updatePopup();
		}
	}

	const observer = new view.MutationObserver(synchronize);
	observer.observe(figure, {
		attributes: true,
		attributeFilter: ["class", "data-bk-playback-state"],
	});
	observer.observe(doc.documentElement, {
		attributes: true,
		attributeFilter: ["data-theme", "data-palette", "data-ui"],
	});
	view.addEventListener("resize", synchronize);

	const disconnect = () => {
		disposed = true;
		updatePopup();
	};
	view.addEventListener("pagehide", disconnect);

	for (const candidate of options.initialWindows) {
		if (!byKey.has(candidate.key) || states.has(candidate.key)) continue;
		const state = { ...candidate };
		states.set(state.key, state);
		create(state);
	}
	synchronize();

	return {
		register(spec: MeasurementGraphSpec) {
			byKey.set(spec.key, spec);
			if (!specs.some((item) => item.key === spec.key)) specs.push(spec);
		},
		open(key: string) {
			if (!byKey.has(key)) return;
			let state = states.get(key);
			if (!state) {
				const spec = byKey.get(key)!;
				state = {
					key,
					x: 24 + states.size * 24,
					y: 80 + states.size * 24,
					...(spec.yKey ? { axes: { x: spec.xAxis.key, y: spec.yKey } } : {}),
				};
				states.set(key, state);
				create(state);
			} else {
				state.minimized = false;
				const parts = nodes.get(key);
				if (parts) {
					fit(state, parts);
					parts.node.style.zIndex = String(++z);
					updateWindow(key);
				}
			}
			layer.hidden = false;
			notify();
		},
		remove(key: string) {
			if (!key.startsWith("custom:")) return;
			close(key);
			byKey.delete(key);
			const index = specs.findIndex((spec) => spec.key === key);
			if (index >= 0) specs.splice(index, 1);
			delete data[key];
			if (popup) {
				try {
					popup.selected.delete(key);
					popup.cards.get(key)?.node.remove();
					popup.cards.delete(key);
					popup.inputs.get(key)?.closest("label")?.remove();
					popup.inputs.delete(key);
				} catch {
					popup = null;
				}
			}
			updatePopup();
		},
		close,
		update(next: Record<string, MeasurementGraphPoint[]>) {
			data = next;
			for (const key of states.keys()) updateWindowHeader(key);
			updatePopupStatusAndValues();
			scheduleRender();
		},
		flush,
		reset() {
			cancelPendingRender();
			data = Object.create(null);
			cursor = pinnedCursor = null;
			comparison = null;
			layer.querySelector(".bk-graph-comparison-label")?.remove();
			localCursors.clear();
			for (const parts of nodes.values())
				delete (parts.plot as any).__chartScale;
			for (const key of states.keys()) updateWindow(key);
			updatePopup();
		},
		/** Set the shared time cursor in seconds, or clear it with null. */
		setCursor(time: number | null) {
			cursor = pinnedCursor =
				time !== null && Number.isFinite(time) ? time : null;
			for (const key of states.keys()) renderWindowPlot(key);
		},
		/** Subscribe to user inspection of time plots; returns an unsubscribe function. */
		onCursorChange(listener: (time: number | null) => void) {
			cursorListeners.add(listener);
			return () => cursorListeners.delete(listener);
		},
		setComparison(
			next: {
				label: string;
				data: Record<string, MeasurementGraphPoint[]>;
			} | null,
		) {
			comparison = next;
			layer.querySelector(".bk-graph-comparison-label")?.remove();
			if (next) {
				const label = doc.createElement("button");
				label.type = "button";
				label.className = "bk-graph-comparison-label";
				label.textContent = `Comparing ${next.label} (dashed) ×`;
				label.setAttribute("aria-label", "Remove path comparison");
				label.onclick = () => this.setComparison(null);
				layer.prepend(label);
			}
			for (const parts of nodes.values())
				delete (parts.plot as any).__chartScale;
			for (const key of states.keys()) renderWindowPlot(key);
		},
		getWindows: snapshot,
		dispose() {
			if (cleaned) return;
			cleaned = true;
			cancelPendingRender();
			disconnect();
			observer.disconnect();
			windowResizeObserver?.disconnect();
			figureResizeObserver?.disconnect();
			view.removeEventListener("resize", synchronize);
			view.removeEventListener("pagehide", disconnect);
			cursorListeners.clear();
			layer.remove();
		},
	};
}
