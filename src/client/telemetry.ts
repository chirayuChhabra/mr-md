// @ts-nocheck
import type {
	MeasurementTone,
	SimulationMeasurementsConfig,
	SimulationSnapshot,
	SimulationTelemetry,
	SimulationTelemetryItem,
} from "../types.js";
import {
	customGraphSpec,
	pairGraphSamples,
} from "./measurement-custom-graphs.js";
import {
	downloadMeasurementFile,
	downloadSnapshotImage,
	measurementFilename,
	type TimelineExport,
	validSnapshotImage,
} from "./measurement-files.js";
import {
	createMeasurementGraphWorkspace,
	type MeasurementGraphPoint,
	type MeasurementGraphWindowState,
	measurementGraphSpecs,
} from "./measurement-graphs.js";
import { matchesMeasurementCondition } from "./measurement-rules.js";
import {
	createMeasurementTimeline,
	type MeasurementTimelineEntry,
} from "./measurement-timeline.js";
import { bkApplyPropsToControls } from "./simulation.js";
import {
	bkSelectInspectorTab,
	bkSetLabPlayback,
	bkWireWorkspace,
} from "./workspace.js";

export {
	bkCollapseLab,
	bkExpandLab,
	bkSelectInspectorTab,
	bkToggleExpandLab,
} from "./workspace.js";

let snapshotRequestSequence = 0;
function snapshotRequestId(): string {
	return (
		globalThis.crypto?.randomUUID?.() ??
		`${Date.now()}-${++snapshotRequestSequence}`
	);
}

interface SimulationState {
	id: string;
	title: string;
	figure: Element;
	schema: SimulationTelemetry;
	pending: Record<string, unknown>;
	values: Record<string, unknown>;
	rafId: number | null;
}
interface Preferences {
	version: 2;
	visible: string[];
	graphs: MeasurementGraphWindowState[];
	tab?: "controls" | "telemetry" | "timeline" | "graphs";
}
interface PendingControl {
	from: unknown;
	to: unknown;
	time: number;
	label: string;
	unit: string;
	timer: ReturnType<typeof setTimeout>;
}
export interface SnapshotSettlement {
	imageDataUrl?: string;
	imageError?: string;
	success: boolean;
	isExact?: boolean;
	cancelled?: boolean;
	error?: string;
	state?: unknown;
	telemetry?: Record<string, unknown>;
	time?: number;
	props?: Record<string, unknown>;
}

export interface RestoreSettlement {
	success: boolean;
	isExact?: boolean;
	cancelled?: boolean;
	error?: string;
	time?: number;
	props?: Record<string, unknown>;
}

export interface PendingSnapshotRequestEntry {
	id: string;
	generation: number;
	branchId?: string;
	kind: "capture" | "preserve" | "event";
	resolve: (data: SnapshotSettlement) => void;
	timer?: ReturnType<typeof setTimeout>;
}

export interface PendingRestoreRequestEntry {
	id: string;
	generation: number;
	restoreSeq: number;
	resolve: (data: RestoreSettlement) => void;
	timer?: ReturnType<typeof setTimeout>;
}

interface MeasurementRuntime {
	figure: HTMLElement;
	schema: SimulationTelemetry;
	config: SimulationMeasurementsConfig;
	iframe: HTMLIFrameElement | null;
	storageKey: string;
	preferences: Preferences;
	graphs: ReturnType<typeof createMeasurementGraphWorkspace>;
	timeline?: ReturnType<typeof createMeasurementTimeline>;
	specs: ReturnType<typeof measurementGraphSpecs>;
	historySpecs: ReturnType<typeof measurementGraphSpecs>;
	timers: Set<ReturnType<typeof setTimeout>>;
	observer?: MutationObserver;
	click?: (event: Event) => void;
	input?: (event: Event) => void;
	load?: () => void;
	started: number;
	hasStarted: boolean;
	time: number;
	values: Record<string, unknown>;
	previous: Record<string, unknown>;
	rules: Record<string, { match: boolean; fired: boolean; last: number }>;
	samples: Record<string, MeasurementGraphPoint[]>;
	sampleBranchId?: string;
	branchSamples?: Map<string, Record<string, MeasurementGraphPoint[]>>;
	latest: Record<string, MeasurementGraphPoint>;
	lastFlush: number;
	flushTimer: ReturnType<typeof setTimeout> | null;
	viewRafId: number | null;
	lastToast: number;
	unreadValues: Set<string>;
	unreadEvents: number;
	controlValues: Map<string, unknown>;
	pendingControls: Map<string, PendingControl>;
	supportsExactSnapshot?: boolean | null;
	pendingSnapshotRequests: Map<string, PendingSnapshotRequestEntry>;
	pendingRestoreRequests: Map<string, PendingRestoreRequestEntry>;
	isRestoringSnapshot?: boolean;
	inFlightPresentSnapshot?: boolean;
	lastPresentCapture?: number;
	latestPresentSnapshot?: SimulationSnapshot;
	branchListener?: (event: Event) => void;
	snapshotViewListener?: (event: Event) => void;
	inFlightManualCapture?: boolean;
	continueListener?: (event: Event) => void;
	captureRequestListener?: (event: Event) => void;
	generation?: number;
	restoreSequence?: number;
	activeRestoreSeq?: number;
}
const simRegistry = new Map<string, SimulationState>();
const runtime = new Map<string, MeasurementRuntime>();
const preferenceMemory = new Map<string, Preferences>();
let wiredWindow: Window | null = null;
function savePreferences(r: MeasurementRuntime) {
	const saved = {
		...r.preferences,
		visible: [...r.preferences.visible],
		graphs: r.preferences.graphs.map((graph) => ({ ...graph })),
	};
	preferenceMemory.set(r.storageKey, saved);
	try {
		window.sessionStorage.setItem(r.storageKey, JSON.stringify(saved));
	} catch (_) {}
}
function syncVisibility(r: MeasurementRuntime) {
	for (const button of r.figure.querySelectorAll<HTMLElement>(
		"[data-measurement-toggle]",
	)) {
		const key = button.dataset.measurementToggle || "",
			enabled = r.preferences.visible.includes(key);
		button.setAttribute("aria-pressed", String(enabled));
		button.title = `${enabled ? "Hide" : "Show"} ${r.schema[key]?.label || key} ${enabled ? "from" : "in"} scene`;
	}
}
function sendVisibility(r?: MeasurementRuntime) {
	if (!r) return;
	const measurements = r.preferences.visible
		.filter((key) => Object.hasOwn(r.schema, key) && r.schema[key].scene)
		.map((key) => ({ key, scene: r.schema[key].scene || "" }));
	r.iframe?.contentWindow?.postMessage(
		{ type: "bk:measurement-visibility", measurements },
		"*",
	);
}
function updateVisibility(r: MeasurementRuntime, key: string, ensure = false) {
	if (!Object.hasOwn(r.schema, key) || !r.schema[key].scene) return;
	const index = r.preferences.visible.indexOf(key);
	if (index < 0) r.preferences.visible.push(key);
	else if (!ensure) r.preferences.visible.splice(index, 1);
	syncVisibility(r);
	savePreferences(r);
	sendVisibility(r);
	scheduleViewUpdate(r, true);
}
function focusMeasurement(r: MeasurementRuntime, key: string) {
	bkSelectInspectorTab(r.figure, "telemetry");
	updateVisibility(r, key, true);
	const button = Array.from(
		r.figure.querySelectorAll<HTMLElement>("[data-measurement-toggle]"),
	).find((button) => button.dataset.measurementToggle === key);
	button?.focus({ preventScroll: true });
	button?.scrollIntoView?.({ block: "nearest" });
}
function appendCustomGraphChoice(
	r: MeasurementRuntime,
	spec: ReturnType<typeof measurementGraphSpecs>[number],
) {
	const list = r.figure.querySelector(".bk-custom-graph-list");
	if (
		!list ||
		[...list.querySelectorAll<HTMLElement>("[data-measurement-graph]")].some(
			(button) => button.dataset.measurementGraph === spec.key,
		)
	)
		return;
	const button = r.figure.ownerDocument.createElement("button");
	button.type = "button";
	button.className = "bk-graph-choice";
	button.dataset.measurementGraph = spec.key;
	button.setAttribute("aria-pressed", "false");
	button.textContent = spec.label;
	const row = r.figure.ownerDocument.createElement("div");
	row.className = "bk-custom-graph-item";
	const remove = r.figure.ownerDocument.createElement("button");
	remove.type = "button";
	remove.className = "bk-custom-graph-remove";
	remove.dataset.removeCustomGraph = spec.key;
	remove.setAttribute("aria-label", `Remove plot ${spec.label}`);
	remove.title = "Remove plot";
	remove.textContent = "×";
	row.append(button, remove);
	list.append(row);
}

function createCustomGraph(r: MeasurementRuntime) {
	const x =
		r.figure.querySelector<HTMLSelectElement>("[data-graph-x]")?.value ||
		"time";
	const y =
		r.figure.querySelector<HTMLSelectElement>("[data-graph-y]")?.value || "";
	const status = r.figure.querySelector<HTMLElement>(
		".bk-graph-builder-status",
	);
	const result = customGraphSpec(r.schema, x, y);
	const numeric = [x, y].every(
		(key) =>
			key === "time" ||
			r.values[key] === undefined ||
			(typeof r.values[key] === "number" && Number.isFinite(r.values[key])),
	);
	if (!result.ok || !numeric) {
		if (status) {
			status.hidden = false;
			status.textContent = result.ok
				? "Choose numeric measurements for both axes."
				: result.message;
		}
		return;
	}
	if (status) status.hidden = true;
	const spec = result.spec;
	if (!r.specs.some((item) => item.key === spec.key)) {
		r.graphs.register(spec);
		appendCustomGraphChoice(r, spec);
	}
	r.graphs.open(spec.key);
	r.graphs.update(graphData(r));
}

function syncGraphActions(r: MeasurementRuntime) {
	const open = new Set(r.preferences.graphs.map((graph) => graph.key));
	for (const button of r.figure.querySelectorAll<HTMLElement>(
		"[data-measurement-graph]",
	))
		button.setAttribute(
			"aria-pressed",
			String(open.has(button.dataset.measurementGraph || "")),
		);
}
function syncBadge(r: MeasurementRuntime, kind: "telemetry" | "timeline") {
	const badge = r.figure.querySelector<HTMLElement>(
		`[data-measurement-unread="${kind}"]`,
	);
	if (!badge) return;
	const count = kind === "telemetry" ? r.unreadValues.size : r.unreadEvents;
	badge.hidden = count === 0;
	badge.textContent = count > 99 ? "99+" : String(count);
	badge.setAttribute(
		"aria-label",
		kind === "telemetry"
			? `${count} measurement${count === 1 ? "" : "s"} updated`
			: `${count} new event${count === 1 ? "" : "s"}`,
	);
}
function markUnread(
	r: MeasurementRuntime,
	kind: "telemetry" | "timeline",
	key?: string,
) {
	if (
		r.figure
			.querySelector(`[role="tab"][aria-controls$="-panel-${kind}"]`)
			?.getAttribute("aria-selected") === "true"
	)
		return;
	if (kind === "telemetry" && key) r.unreadValues.add(key);
	if (kind === "timeline") r.unreadEvents += 1;
	syncBadge(r, kind);
}
function settleSnapshotRequest(
	r: MeasurementRuntime,
	id: string,
	settlement: SnapshotSettlement,
): void {
	const entry = r.pendingSnapshotRequests.get(id);
	if (!entry) return;
	if (entry.timer) {
		clearTimeout(entry.timer);
		r.timers.delete(entry.timer);
	}
	r.pendingSnapshotRequests.delete(id);
	if (entry.kind === "capture" && r.inFlightManualCapture) {
		r.inFlightManualCapture = false;
		syncCaptureButtonState(r);
	}
	try {
		entry.resolve(settlement);
	} catch (_) {}
}

function settleRestoreRequest(
	r: MeasurementRuntime,
	id: string,
	settlement: RestoreSettlement,
): void {
	const entry = r.pendingRestoreRequests.get(id);
	if (!entry) return;
	if (entry.timer) {
		clearTimeout(entry.timer);
		r.timers.delete(entry.timer);
	}
	r.pendingRestoreRequests.delete(id);
	try {
		entry.resolve(settlement);
	} catch (_) {}
}

function cancelAllPendingRequests(
	r: MeasurementRuntime,
	reason = "cancelled",
): void {
	for (const id of Array.from(r.pendingSnapshotRequests.keys())) {
		settleSnapshotRequest(r, id, {
			success: false,
			isExact: false,
			cancelled: true,
			error: reason,
		});
	}
	for (const id of Array.from(r.pendingRestoreRequests.keys())) {
		settleRestoreRequest(r, id, {
			success: false,
			isExact: false,
			cancelled: true,
			error: reason,
		});
	}
	r.inFlightManualCapture = false;
	r.isRestoringSnapshot = false;
	syncCaptureButtonState(r);
}

function equalPropValue(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (!left || !right || typeof left !== "object" || typeof right !== "object")
		return false;
	if (Array.isArray(left) !== Array.isArray(right)) return false;
	const keys = Object.keys(left);
	return (
		keys.length === Object.keys(right).length &&
		keys.every(
			(key) =>
				Object.hasOwn(right, key) &&
				equalPropValue(
					(left as Record<string, unknown>)[key],
					(right as Record<string, unknown>)[key],
				),
		)
	);
}

function arePropsEqual(
	current: Map<string, unknown> | Record<string, unknown> | undefined,
	targetProps: Record<string, unknown> | undefined,
): boolean {
	if (!targetProps || typeof targetProps !== "object") return true;
	const entries = Object.entries(targetProps);
	if (!entries.length) return true;
	if (!current) return false;
	return entries.every(([key, value]) =>
		equalPropValue(
			current instanceof Map ? current.get(key) : current[key],
			value,
		),
	);
}

function addPendingSnapshotRequest(
	r: MeasurementRuntime,
	id: string,
	cb: (data: SnapshotSettlement) => void,
	options?: {
		kind?: "capture" | "preserve" | "event";
		branchId?: string;
		timer?: ReturnType<typeof setTimeout>;
	},
) {
	const gen = r.generation || 0;
	if (r.pendingSnapshotRequests.size >= 25) {
		const oldestId = r.pendingSnapshotRequests.keys().next().value;
		if (oldestId) {
			settleSnapshotRequest(r, oldestId, {
				success: false,
				isExact: false,
				cancelled: true,
				error: "Evicted due to bound limit",
			});
		}
	}
	const entry: PendingSnapshotRequestEntry = {
		id,
		generation: gen,
		branchId: options?.branchId ?? r.timeline?.getActiveBranchId?.() ?? "main",
		kind: options?.kind ?? "event",
		resolve: cb,
		timer: options?.timer,
	};
	r.pendingSnapshotRequests.set(id, entry);
}

function syncCaptureButtonState(r: MeasurementRuntime): void {
	const isInspecting =
		r.figure.dataset.bkSnapshotViewing === "true" ||
		r.figure.getAttribute("data-snapshot-viewing") === "true" ||
		Boolean(r.timeline?.isAtPast?.());
	const isUnsupported = r.supportsExactSnapshot !== true;
	const isPending = Boolean(r.inFlightManualCapture);
	const disabled = isInspecting || isUnsupported || isPending;

	const buttons = r.figure.querySelectorAll<HTMLButtonElement>(
		"[data-bk-capture-snapshot]",
	);
	for (const btn of buttons) {
		btn.hidden = isUnsupported;
		btn.disabled = disabled;
		if (isPending) {
			btn.setAttribute("aria-busy", "true");
			btn.title = "Capturing snapshot...";
		} else {
			btn.removeAttribute("aria-busy");
			if (isInspecting) {
				btn.title = "Cannot capture while inspecting snapshot";
			} else if (isUnsupported) {
				btn.title =
					"Exact snapshot capture requires simulation opt-in (window.bkRegisterSnapshot)";
			} else {
				btn.title = "Capture snapshot";
			}
		}
	}
}

function ensureCaptureButton(r: MeasurementRuntime): void {
	if (!r.timeline || r.config.timeline?.capture === false) return;
	const nav = r.figure.querySelector<HTMLElement>(".bk-timeline-toolbar");
	if (nav && !nav.querySelector("[data-bk-capture-snapshot]")) {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "bk-steps-btn bk-sim-capture-btn";
		btn.setAttribute("data-bk-capture-snapshot", "");
		btn.setAttribute("aria-label", "Capture snapshot");
		btn.title = "Capture snapshot";
		btn.disabled = true;
		btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg><span class="bk-sr-only">Capture snapshot</span>`;
		nav.prepend(btn);
	}
	syncCaptureButtonState(r);
}

function offerSnapshotSave(
	r: MeasurementRuntime,
	snapshot: SimulationSnapshot,
	imageError?: string,
) {
	r.figure.querySelector<HTMLFormElement>(".bk-capture-name")?.requestSubmit();
	const doc = r.figure.ownerDocument;
	const form = doc.createElement("form");
	form.className = "bk-capture-name";
	form.setAttribute("aria-label", "Save snapshot image");
	const cue = doc.createElement("p");
	cue.className = "bk-capture-saved";
	cue.setAttribute("role", "status");
	cue.textContent = "Saved to timeline";
	const label = doc.createElement("label");
	label.textContent = "Name";
	const input = doc.createElement("input");
	input.name = "snapshot-name";
	input.maxLength = 100;
	input.value = `Snapshot ${Number(snapshot.time.toFixed(2))} s`;
	input.setAttribute("aria-label", "Snapshot name");
	label.append(input);
	const actions = doc.createElement("div");
	actions.className = "bk-capture-name-actions";
	const save = doc.createElement("button");
	save.type = "submit";
	save.textContent = snapshot.imageDataUrl ? "Save image" : "Save name";
	const dismiss = doc.createElement("button");
	dismiss.type = "button";
	dismiss.textContent = "×";
	dismiss.setAttribute("aria-label", "Dismiss snapshot naming");
	actions.append(save, dismiss);
	form.append(cue, label, actions);
	if (!snapshot.imageDataUrl) {
		const error = doc.createElement("p");
		error.className = "bk-capture-image-error";
		error.textContent =
			imageError || "This scene could not be captured as an image.";
		form.append(error);
	}
	const finish = () => {
		const name =
			input.value.trim() || input.defaultValue || `Snapshot ${snapshot.time} s`;
		r.timeline?.renameSnapshot(snapshot.id, name);
		if (snapshot.imageDataUrl) {
			try {
				downloadSnapshotImage(doc, snapshot.imageDataUrl, name);
			} catch {
				cue.textContent =
					"Image download failed. Try Download image in Timeline.";
				return;
			}
		}
		form.remove();
		r.figure
			.querySelector<HTMLElement>("[data-bk-capture-snapshot]")
			?.focus({ preventScroll: true });
	};
	form.addEventListener("submit", (event) => {
		event.preventDefault();
		finish();
	});
	dismiss.addEventListener("click", finish);
	form.addEventListener("keydown", (event) => {
		if (event.key !== "Escape") return;
		event.preventDefault();
		event.stopPropagation();
		finish();
		r.figure.querySelector<HTMLElement>("[data-bk-capture-snapshot]")?.focus();
	});
	(r.figure.querySelector(".bk-sim-playback") || r.figure).append(form);
	for (const button of r.figure.querySelectorAll<HTMLElement>(
		"[data-bk-capture-snapshot]",
	))
		button.dataset.saved = "true";
	const timer = setTimeout(() => {
		for (const button of r.figure.querySelectorAll<HTMLElement>(
			"[data-bk-capture-snapshot]",
		))
			delete button.dataset.saved;
		r.timers.delete(timer);
	}, 2200);
	r.timers.add(timer);
	input.focus({ preventScroll: true });
	input.select();
}

function exportTimeline(r: MeasurementRuntime) {
	if (!r.timeline) return;
	const label =
		r.figure.querySelector(".bk-object-title")?.textContent || "Timeline";
	const quote = (value: unknown) => {
		const text = String(value ?? "");
		const safe = /^[=+@\t\r]/.test(text) ? "'" + text : text;
		return `"${safe.replace(/"/g, '""')}"`;
	};
	try {
		const entries = r.timeline
			.getBranches()
			.flatMap((branch) => branch.entries);
		const rows = [
			["Time (s)", "Name", "Type", "Measurements"],
			...entries.map((entry) => [
				entry.time,
				entry.title,
				entry.kind || "event",
				Object.entries(entry.snapshot?.telemetry || {})
					.map(
						([key, value]) =>
							`${r.schema[key]?.label || key}: ${value}${r.schema[key]?.unit ? ` ${r.schema[key].unit}` : ""}`,
					)
					.join("; "),
			]),
		];
		const blob = new Blob(
			["\ufeff", rows.map((row) => row.map(quote).join(",")).join("\r\n")],
			{ type: "text/csv;charset=utf-8" },
		);
		downloadMeasurementFile(
			r.figure.ownerDocument,
			blob,
			measurementFilename(`${label} timeline`, "csv"),
		);
		r.timeline.showFeedback("Timeline downloaded", "success");
	} catch {
		r.timeline.showFeedback("Could not download the timeline.", "warning");
	}
}

function captureManualSnapshot(r: MeasurementRuntime): void {
	if (
		!r.timeline ||
		r.config.timeline?.capture === false ||
		r.supportsExactSnapshot !== true
	)
		return;
	if (
		r.figure.dataset.bkSnapshotViewing === "true" ||
		r.figure.getAttribute("data-snapshot-viewing") === "true" ||
		r.timeline.isAtPast?.()
	) {
		return;
	}
	if (r.inFlightManualCapture) return;

	r.inFlightManualCapture = true;
	syncCaptureButtonState(r);

	const captureTime = r.time;
	const originatingBranchId = r.timeline.getActiveBranchId?.() || "main";
	const snapshotId = `snap-${r.figure.id || "sim"}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
	const snapshot: SimulationSnapshot = {
		id: snapshotId,
		simId: r.figure.id,
		time: captureTime,
		timestamp: Date.now(),
		label: "Saved snapshot",
		props: r.controlValues ? Object.fromEntries(r.controlValues) : {},
		telemetry: { ...r.values },
		isExact: false,
	};
	const entry: MeasurementTimelineEntry = {
		title: "Saved snapshot",
		time: captureTime,
		kind: "snapshot",
		tone: "neutral",
		snapshot,
	};

	if (r.iframe?.contentWindow) {
		const reqId = snapshotId;
		const timer = setTimeout(() => {
			settleSnapshotRequest(r, reqId, {
				success: false,
				isExact: false,
				cancelled: true,
				error: "Capture timeout",
			});
		}, 3000);
		r.timers.add(timer);

		addPendingSnapshotRequest(
			r,
			reqId,
			(response) => {
				r.inFlightManualCapture = false;
				syncCaptureButtonState(r);
				if (response.cancelled) {
					return;
				}
				if (response.success && response.isExact) {
					snapshot.isExact = true;
					snapshot.state = response.state;
					if (validSnapshotImage(response.imageDataUrl))
						snapshot.imageDataUrl = response.imageDataUrl;
					if (response.telemetry && typeof response.telemetry === "object") {
						snapshot.telemetry = { ...response.telemetry };
					}
					if (
						typeof response.time === "number" &&
						Number.isFinite(response.time)
					) {
						snapshot.time = response.time;
						entry.time = response.time;
					}
					if (response.props && typeof response.props === "object") {
						snapshot.props = { ...response.props };
					}
					// Branch-bound guard (Gap 3):
					const currentActiveBranchId = r.timeline?.getActiveBranchId?.();
					if (currentActiveBranchId === originatingBranchId) {
						r.timeline?.record(entry);
						markUnread(r, "timeline");
						offerSnapshotSave(r, snapshot, response.imageError);
					} else {
						// Record against originating branch if present; do not corrupt active branch!
						const allBranches = r.timeline?.getBranches?.() || [];
						const origBranch = allBranches.find(
							(b: any) => b.id === originatingBranchId,
						);
						if (origBranch && Array.isArray(origBranch.entries)) {
							const entryToSave = {
								...entry,
								id:
									entry.id ||
									`entry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
								branchId: originatingBranchId,
							};
							origBranch.entries.push(entryToSave);
							r.timeline?.refreshLayout();
							offerSnapshotSave(r, snapshot, response.imageError);
							r.timeline?.showFeedback?.(
								"Snapshot recorded to originating branch",
								"neutral",
							);
						} else {
							r.timeline?.showFeedback?.(
								"Snapshot discarded: originating branch not active",
								"warning",
							);
						}
					}
				} else {
					r.timeline?.showFeedback?.("Failed to capture snapshot", "danger");
				}
			},
			{ kind: "capture", branchId: originatingBranchId, timer },
		);

		try {
			r.iframe.contentWindow.postMessage(
				{
					type: "bk:snapshot-capture",
					id: reqId,
					time: captureTime,
					label: entry.title,
					includeImage: true,
				},
				"*",
			);
		} catch (_) {
			settleSnapshotRequest(r, reqId, {
				success: false,
				isExact: false,
				cancelled: true,
				error: "PostMessage failed",
			});
		}
	}
}

function rememberBranchSamples(r: MeasurementRuntime) {
	r.branchSamples ??= new Map();
	r.sampleBranchId ??= r.timeline?.getActiveBranchId() || "main";
	if (r.graphSnapshotTime === undefined) {
		r.branchSamples.set(r.sampleBranchId, graphData(r));
	}
}

function restoreBranchSamples(r: MeasurementRuntime, branchId: string) {
	rememberBranchSamples(r);
	const saved = r.branchSamples?.get(branchId);
	r.samples = Object.fromEntries(
		Object.entries(saved || {}).map(([key, points]) => [
			key,
			points.map((point) => ({ ...point })),
		]),
	);
	r.sampleBranchId = branchId;
}

function handleBranchingInteraction(r: MeasurementRuntime, reason?: string) {
	if (r.isRestoringSnapshot || !r.timeline?.isAtPast()) return;
	const forkTime = r.time;
	rememberBranchSamples(r);
	const newBranchId = r.timeline.branchOnContinuation(reason);
	if (newBranchId) {
		r.sampleBranchId = newBranchId;
		r.latestPresentSnapshot = undefined;
		r.lastPresentCapture = 0;
		for (const key of Object.keys(r.samples || {})) {
			r.samples[key] = r.samples[key].filter((point) => point.time <= forkTime);
		}
		for (const key of Object.keys(r.latest || {})) {
			if (r.latest[key].time > forkTime) delete r.latest[key];
		}
		delete r.graphSnapshotTime;
		r.graphs?.reset();
		const doc =
			r.figure?.ownerDocument ||
			(typeof document !== "undefined" ? document : null);
		const win =
			doc?.defaultView || (typeof window !== "undefined" ? window : null);
		const CustomEventCtor =
			win?.CustomEvent ||
			(typeof CustomEvent !== "undefined" ? CustomEvent : null);
		if (CustomEventCtor) {
			r.figure.dispatchEvent(
				new CustomEventCtor("bk:snapshot-view-change", {
					bubbles: true,
					detail: { viewing: false },
				}),
			);
		}
		syncCaptureButtonState(r);
	}
}

function recordEvent(r: MeasurementRuntime, entry: MeasurementTimelineEntry) {
	const snapshotId = `snap-${r.figure.id || "sim"}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
	const snapshot: SimulationSnapshot = {
		id: snapshotId,
		simId: r.figure.id,
		time: entry.time,
		timestamp: Date.now(),
		label: entry.title,
		props: Object.fromEntries(r.controlValues),
		telemetry: { ...r.values },
		isExact: false,
	};
	entry.snapshot = snapshot;

	if (r.supportsExactSnapshot && r.iframe?.contentWindow) {
		const reqId = snapshotId;
		addPendingSnapshotRequest(r, reqId, (response) => {
			if (response.success && response.isExact) {
				snapshot.isExact = true;
				snapshot.state = response.state;
				if (response.telemetry && typeof response.telemetry === "object")
					snapshot.telemetry = { ...response.telemetry };
				if (
					typeof response.time === "number" &&
					Number.isFinite(response.time)
				) {
					snapshot.time = response.time;
				}
				if (response.props && typeof response.props === "object") {
					snapshot.props = { ...response.props };
				}
			}
		});
		try {
			r.iframe.contentWindow.postMessage(
				{
					type: "bk:snapshot-capture",
					id: reqId,
					time: entry.time,
					label: entry.title,
				},
				"*",
			);
		} catch (_) {}
	}

	r.timeline?.record(entry);
	markUnread(r, "timeline");
}

async function restoreSimulationSnapshot(
	r: MeasurementRuntime,
	snapshot: SimulationSnapshot,
	entry?: MeasurementTimelineEntry,
): Promise<boolean> {
	if (!snapshot) return false;

	if (r.supportsExactSnapshot !== true || !snapshot.isExact) {
		r.timeline?.showFeedback(
			"Cannot restore exact simulation state: simulation has not opted in to snapshot lifecycle (window.bkRegisterSnapshot).",
			"warning",
			6000,
		);
		return false;
	}

	const target = r.iframe?.contentWindow;
	if (!target) return false;

	r.restoreSequence = (r.restoreSequence || 0) + 1;
	const restoreSeq = r.restoreSequence;
	r.activeRestoreSeq = restoreSeq;
	const restoreGen = r.generation || 0;

	// Supersede earlier restore and preserve requests immediately
	for (const [id, req] of Array.from(r.pendingRestoreRequests.entries())) {
		if (req.restoreSeq < restoreSeq) {
			settleRestoreRequest(r, id, {
				success: false,
				isExact: false,
				cancelled: true,
				error: "Superseded by newer restore",
			});
		}
	}
	for (const [id, req] of Array.from(r.pendingSnapshotRequests.entries())) {
		if (req.kind === "preserve") {
			settleSnapshotRequest(r, id, {
				success: false,
				isExact: false,
				cancelled: true,
				error: "Superseded by newer restore",
			});
		}
	}

	// Mark paused by snapshot restore policy
	r.figure.dataset.bkPausedSnapshot = "true";
	bkSetLabPlayback(r.figure, false);
	r.isRestoringSnapshot = true;

	// Preserve the exact future before the first rewind, including a paused frame.
	const isAlreadyInspecting =
		Boolean(r.timeline?.isAtPast?.()) ||
		r.figure.dataset.bkSnapshotViewing === "true" ||
		r.figure.getAttribute("data-snapshot-viewing") === "true";
	if (!isAlreadyInspecting) {
		const present = await new Promise<SimulationSnapshot | null>((resolve) => {
			const id = `preserve-${snapshotRequestId()}`;
			const timer = setTimeout(() => {
				settleSnapshotRequest(r, id, {
					success: false,
					isExact: false,
					cancelled: true,
					error: "Preserve timeout",
				});
			}, 3000);
			r.timers.add(timer);

			addPendingSnapshotRequest(
				r,
				id,
				(response) => {
					if (response.cancelled || !response.success || !response.isExact) {
						resolve(null);
						return;
					}
					resolve({
						id,
						simId: r.figure.id,
						label: "Present",
						timestamp: Date.now(),
						time: Number.isFinite(response.time) ? response.time! : r.time,
						props: response.props
							? JSON.parse(JSON.stringify(response.props))
							: Object.fromEntries(r.controlValues),
						telemetry: response.telemetry
							? JSON.parse(JSON.stringify(response.telemetry))
							: { ...r.values },
						state: response.state
							? JSON.parse(JSON.stringify(response.state))
							: undefined,
						isExact: true,
					});
				},
				{ kind: "preserve", timer },
			);

			try {
				target.postMessage(
					{ type: "bk:snapshot-capture", id, time: r.time, label: "Present" },
					"*",
				);
			} catch {
				settleSnapshotRequest(r, id, {
					success: false,
					isExact: false,
					cancelled: true,
					error: "PostMessage failed",
				});
			}
		});
		if (
			(r.generation || 0) !== restoreGen ||
			r.activeRestoreSeq !== restoreSeq
		) {
			return false;
		}
		if (!present) {
			if (r.activeRestoreSeq === restoreSeq) r.isRestoringSnapshot = false;
			return false;
		}
		r.latestPresentSnapshot = present;
		r.timeline?.update(present.time, present.telemetry, false, present);
	}

	const restored = await new Promise<boolean>((resolve) => {
		const restoreId = `restore-${snapshotRequestId()}`;
		const timer = setTimeout(() => {
			settleRestoreRequest(r, restoreId, {
				success: false,
				isExact: false,
				cancelled: true,
				error: "Restore timeout",
			});
		}, 3000);
		r.timers.add(timer);

		const entry: PendingRestoreRequestEntry = {
			id: restoreId,
			generation: restoreGen,
			restoreSeq,
			timer,
			resolve: (response) => {
				if (response.cancelled) {
					resolve(false);
					return;
				}
				resolve(response.success === true && response.isExact === true);
			},
		};
		r.pendingRestoreRequests.set(restoreId, entry);

		try {
			target.postMessage(
				{
					type: "bk:snapshot-restore",
					id: restoreId,
					snapshot,
					resumePlayback: false,
				},
				"*",
			);
		} catch (_) {
			settleRestoreRequest(r, restoreId, {
				success: false,
				isExact: false,
				cancelled: true,
				error: "PostMessage failed",
			});
		}
	});

	if ((r.generation || 0) !== restoreGen || r.activeRestoreSeq !== restoreSeq) {
		return false;
	}
	if (!restored) {
		if (r.activeRestoreSeq === restoreSeq) r.isRestoringSnapshot = false;
		return false;
	}

	r.figure.dataset.bkPausedSnapshot = "true";
	bkSetLabPlayback(r.figure, false);

	const state = simRegistry.get(r.figure.id || "");
	if (state) {
		if (state.rafId !== null) {
			cancelAnimationFrame(state.rafId);
			state.rafId = null;
		}
		state.pending = Object.create(null);
		state.values = snapshot.telemetry
			? JSON.parse(JSON.stringify(snapshot.telemetry))
			: {};
	}

	for (const pending of r.pendingControls.values()) {
		clearTimeout(pending.timer);
		r.timers.delete(pending.timer);
	}
	r.pendingControls.clear();

	restoreBranchSamples(
		r,
		entry?.branchId || r.timeline?.getActiveBranchId() || "main",
	);
	// Update host state to match restored snapshot
	r.graphSnapshotTime = snapshot.time;
	r.time = snapshot.time;
	r.values = snapshot.telemetry
		? JSON.parse(JSON.stringify(snapshot.telemetry))
		: {};
	r.latest = {};
	for (const spec of [...(r.specs || []), ...(r.historySpecs || [])]) {
		const y = r.values[spec.yKey || spec.key];
		const x =
			spec.xAxis.key === "time" ? snapshot.time : r.values[spec.xAxis.key];
		if (
			typeof x === "number" &&
			Number.isFinite(x) &&
			typeof y === "number" &&
			Number.isFinite(y)
		) {
			r.latest[spec.key] = {
				time: snapshot.time,
				x,
				y,
				branchId: r.sampleBranchId,
			};
		}
	}
	if (snapshot.props && typeof snapshot.props === "object") {
		const clonedProps = JSON.parse(JSON.stringify(snapshot.props));
		r.controlValues.clear();
		r.figure.__bkCurrentProps = { ...clonedProps };
		bkApplyPropsToControls(r.figure, clonedProps);
		for (const [key, val] of Object.entries(clonedProps)) {
			r.controlValues.set(key, val);
			for (const input of r.figure.querySelectorAll<
				HTMLInputElement | HTMLSelectElement
			>(`[data-bk-prop="${getSafeCssSelectorKey(key)}"]`)) {
				if (input.type === "checkbox") {
					(input as HTMLInputElement).checked = Boolean(val);
				} else if (input.type === "radio") {
					(input as HTMLInputElement).checked = input.value === String(val);
				} else {
					input.value = String(val ?? "");
				}
				const sync = r.figure.querySelector<HTMLInputElement>(
					`[data-bk-sync="${getSafeCssSelectorKey(key)}"]`,
				);
				if (sync) sync.value = String(val ?? "");
			}
		}

		// Update preset buttons and select so .is-active is never stale after snapshot restore
		r.figure
			.querySelectorAll<HTMLElement>("[data-bk-preset]")
			.forEach((btn) => {
				let presetProps: Record<string, unknown> = {};
				if (btn.dataset.bkPresetProps) {
					try {
						presetProps = JSON.parse(btn.dataset.bkPresetProps);
					} catch {}
				}
				const matches = arePropsEqual(clonedProps, presetProps);
				btn.classList.toggle("is-active", matches);
			});
		r.figure
			.querySelectorAll<HTMLSelectElement>("select[data-bk-preset-select]")
			.forEach((sel) => {
				let matchedVal = "";
				for (const opt of Array.from(sel.options)) {
					if (!opt.value) continue;
					let presetProps: Record<string, unknown> = {};
					if (opt.dataset.bkPresetProps) {
						try {
							presetProps = JSON.parse(opt.dataset.bkPresetProps);
						} catch {}
					}
					if (arePropsEqual(clonedProps, presetProps)) {
						matchedVal = opt.value;
						break;
					}
				}
				sel.value = matchedVal;
			});
	}

	// Update displayed telemetry values
	for (const [key, val] of Object.entries(snapshot.telemetry || {})) {
		const safeKey = getSafeCssSelectorKey(key);
		const rows = r.figure.querySelectorAll(
			`.bk-telemetry-row[data-telemetry-key="${safeKey}"]`,
		);
		const formatted = formatTelemetryValue(val, r.schema?.[key]);
		rows.forEach((row) => {
			const numEl = row.querySelector(".bk-telemetry-num");
			if (numEl && numEl.textContent !== formatted) {
				numEl.textContent = formatted;
			}
		});
	}

	flushViews(r);

	const doc =
		r.figure?.ownerDocument ||
		(typeof document !== "undefined" ? document : null);
	const win =
		doc?.defaultView || (typeof window !== "undefined" ? window : null);
	const CustomEventCtor =
		win?.CustomEvent ||
		(typeof CustomEvent !== "undefined" ? CustomEvent : null);
	if (CustomEventCtor) {
		r.figure.dispatchEvent(
			new CustomEventCtor("bk:snapshot-view-change", {
				bubbles: true,
				detail: { viewing: true, time: snapshot.time },
			}),
		);
	}

	if (r.activeRestoreSeq === restoreSeq) {
		r.isRestoringSnapshot = false;
	}
	return true;
}
function positionNotifications(r: MeasurementRuntime) {
	const overlay = r.figure.querySelector<HTMLElement>(
		".bk-measurement-notifications",
	);
	const stage = r.figure.querySelector<HTMLElement>(".bk-sim-stage");
	if (!overlay || !stage) return;
	const bounds = stage.getBoundingClientRect();
	overlay.style.top = `${bounds.top + 16}px`;
	overlay.style.right = `${Math.max(16, window.innerWidth - bounds.right + 16)}px`;
	overlay.style.width = `${Math.max(0, Math.min(360, bounds.width - 32))}px`;
}
function showNotification(
	r: MeasurementRuntime,
	key: string,
	message: string,
	tone: MeasurementTone,
) {
	const policy = r.config.notifications,
		now = Date.now();
	if (
		policy?.enabled === false ||
		now - r.lastToast < (policy?.minInterval ?? 12) * 1000
	)
		return;
	const overlay = r.figure.querySelector(".bk-measurement-notifications");
	if (!overlay) return;
	positionNotifications(r);
	r.lastToast = now;
	const notice = document.createElement("div");
	notice.className = "bk-measurement-notice";
	notice.dataset.tone = tone;
	const body = document.createElement("button");
	body.type = "button";
	body.className = "bk-measurement-notice-body";
	const heading = document.createElement("span");
	heading.className = "bk-measurement-notice-header";
	const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	icon.setAttribute("viewBox", "0 0 20 20");
	icon.setAttribute("aria-hidden", "true");
	const path = document.createElementNS(icon.namespaceURI, "path");
	path.setAttribute(
		"d",
		tone === "success" ? "m5 10 3 3 7-7" : "M10 5v6m0 3v1",
	);
	icon.append(path);
	const title = document.createElement("span");
	title.textContent = r.schema[key]?.label || key;
	const time = document.createElement("span");
	time.className = "bk-measurement-notice-time";
	time.textContent = `${Number(r.time.toFixed(1))} s`;
	heading.append(icon, title, time);
	const content = document.createElement("span");
	content.className = "bk-measurement-notice-message";
	content.textContent = message;
	body.append(heading, content);
	body.addEventListener("click", () => {
		focusMeasurement(r, key);
		notice.remove();
	});
	const dismiss = document.createElement("button");
	dismiss.type = "button";
	dismiss.className = "bk-measurement-notice-dismiss";
	dismiss.setAttribute("aria-label", "Dismiss notification");
	dismiss.textContent = "×";
	dismiss.addEventListener("click", () => notice.remove());
	notice.append(body, dismiss);
	overlay.append(notice);
	while (overlay.children.length > (policy?.maxVisible ?? 1))
		overlay.firstElementChild?.remove();
	const timer = setTimeout(
		() => {
			notice.remove();
			r.timers.delete(timer);
		},
		(policy?.duration ?? 5) * 1000,
	);
	r.timers.add(timer);
}
function graphData(r: MeasurementRuntime) {
	const data: Record<string, MeasurementGraphPoint[]> = Object.create(null);
	for (const spec of [...r.specs, ...(r.historySpecs || [])]) {
		const raw = (key: string) => {
			const sourceKey = `history:${encodeURIComponent(key)}`;
			const points = [...(r.samples[sourceKey] || [])];
			const latest = r.latest[sourceKey];
			if (latest && points.at(-1)?.time !== latest.time) points.push(latest);
			return points;
		};
		const source =
			spec.yKey && spec.key.startsWith("custom:")
				? pairGraphSamples(spec.xAxis.key, raw(spec.xAxis.key), raw(spec.yKey))
				: r.samples[spec.key] || [];
		const points = source.filter(
				(point) =>
					typeof r.graphSnapshotTime !== "number" ||
					point.time <= r.graphSnapshotTime,
			),
			latest = r.latest[spec.key],
			last = points.at(-1);
		if (
			latest &&
			(typeof r.graphSnapshotTime !== "number" ||
				latest.time <= r.graphSnapshotTime) &&
			(!last ||
				latest.time !== last.time ||
				latest.x !== last.x ||
				latest.y !== last.y)
		)
			points.push(latest);
		data[spec.key] =
			typeof r.graphSnapshotTime === "number"
				? points.filter((point) => point.time <= r.graphSnapshotTime)
				: points;
	}
	return data;
}
function flushViews(r: MeasurementRuntime) {
	if (r.flushTimer !== null) {
		clearTimeout(r.flushTimer);
		r.timers?.delete(r.flushTimer);
		r.flushTimer = null;
	}
	r.lastFlush = Date.now();
	r.graphs?.update(graphData(r));
	if (
		r.isRestoringSnapshot ||
		r.timeline?.isAtPast() ||
		r.figure.dataset.bkSnapshotViewing === "true"
	)
		return;

	const now = Date.now();
	const isPaused = r.figure.getAttribute("data-bk-playback-state") === "paused";
	const shouldCapturePresent =
		r.supportsExactSnapshot &&
		!r.isRestoringSnapshot &&
		!r.timeline?.isAtPast?.() &&
		!r.inFlightPresentSnapshot &&
		(isPaused || now - (r.lastPresentCapture || 0) >= 1000);

	let presentSnapshot: SimulationSnapshot | undefined = r.latestPresentSnapshot;
	if (shouldCapturePresent && r.iframe?.contentWindow) {
		const reqId = `present-${snapshotRequestId()}`;
		r.inFlightPresentSnapshot = true;
		r.lastPresentCapture = now;
		const freshSnapshot: SimulationSnapshot = {
			id: reqId,
			simId: r.figure.id,
			time: r.time,
			timestamp: now,
			label: "Present",
			props: r.controlValues ? Object.fromEntries(r.controlValues) : {},
			telemetry: { ...r.values },
			isExact: false,
		};
		const captureBranchId = r.timeline?.getActiveBranchId();
		addPendingSnapshotRequest(r, reqId, (response) => {
			r.inFlightPresentSnapshot = false;
			if (response.success === true && response.isExact === true) {
				freshSnapshot.state = response.state;
				if (response.telemetry && typeof response.telemetry === "object")
					freshSnapshot.telemetry = { ...response.telemetry };
				freshSnapshot.isExact = true;
				if (
					typeof response.time === "number" &&
					Number.isFinite(response.time)
				) {
					freshSnapshot.time = response.time;
				}
				if (
					captureBranchId === r.timeline?.getActiveBranchId() &&
					!r.isRestoringSnapshot &&
					!r.timeline?.isAtPast() &&
					r.figure.dataset.bkSnapshotViewing !== "true"
				) {
					r.latestPresentSnapshot = freshSnapshot;
					r.timeline?.update(
						freshSnapshot.time,
						freshSnapshot.telemetry,
						!isPaused,
						freshSnapshot,
					);
				}
			}
		});
		try {
			r.iframe.contentWindow.postMessage(
				{
					type: "bk:snapshot-capture",
					id: reqId,
					time: r.time,
					label: "Present",
				},
				"*",
			);
		} catch (_) {
			r.inFlightPresentSnapshot = false;
		}
		presentSnapshot = freshSnapshot;
	} else if (!r.timeline?.isAtPast?.()) {
		if (!presentSnapshot) {
			presentSnapshot = {
				id: "present-fallback",
				simId: r.figure.id,
				time: r.time,
				timestamp: now,
				label: "Present",
				props: r.controlValues ? Object.fromEntries(r.controlValues) : {},
				telemetry: { ...r.values },
				isExact: false,
			};
		}
	}

	if (r.isRestoringSnapshot) return;
	r.timeline?.update(
		r.time,
		r.values,
		r.figure.classList.contains("bk-object--maximized") &&
			r.figure.getAttribute("data-bk-playback-state") !== "paused",
		presentSnapshot,
	);
}

function scheduleViewUpdate(r: MeasurementRuntime, force = false) {
	if (force || r.figure.getAttribute("data-bk-playback-state") === "paused") {
		if (r.viewRafId !== null) {
			cancelAnimationFrame(r.viewRafId);
			r.viewRafId = null;
		}
		flushViews(r);
		return;
	}
	if (r.viewRafId !== null) return;
	if (typeof requestAnimationFrame === "function") {
		r.viewRafId = requestAnimationFrame(() => {
			r.viewRafId = null;
			flushViews(r);
		});
	} else {
		flushViews(r);
	}
}
function readControl(input: HTMLInputElement | HTMLSelectElement): unknown {
	if (input.type === "checkbox") return (input as HTMLInputElement).checked;
	const option =
		input.tagName === "SELECT"
			? (input as HTMLSelectElement).selectedOptions[0]
			: input;
	if (option?.hasAttribute("data-bk-val")) {
		try {
			return JSON.parse(option.getAttribute("data-bk-val") || "null");
		} catch (_) {
			return input.value;
		}
	}
	if (["range", "number"].includes(input.type))
		return Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : null;
	return input.value;
}
function seedControls(r: MeasurementRuntime) {
	r.controlValues.clear();
	for (const input of r.figure.querySelectorAll<
		HTMLInputElement | HTMLSelectElement
	>("[data-bk-prop]")) {
		if (input.type === "radio" && !input.checked) continue;
		r.controlValues.set(input.dataset.bkProp || "", readControl(input));
	}
}
function recordControl(r: MeasurementRuntime, event: Event) {
	if (r.config.timeline?.controls === false) return;

	const input = (event.target as Element).closest<
		HTMLInputElement | HTMLSelectElement
	>("[data-bk-prop], [data-bk-sync]");
	if (
		!input ||
		!r.figure.contains(input) ||
		(input.type === "radio" && !input.checked)
	)
		return;
	const key = input.dataset.bkProp || input.dataset.bkSync || "",
		value = readControl(input),
		old = r.controlValues.get(key);
	r.controlValues.set(key, value);
	if (old === value || !r.hasStarted) return;
	const previous = r.pendingControls.get(key);
	if (previous) {
		clearTimeout(previous.timer);
		r.timers.delete(previous.timer);
	}
	const field = input.closest("label, .bk-sim-segmented"),
		label =
			field?.querySelector("span")?.textContent?.trim() ||
			key.replace(/([A-Z])/g, " $1"),
		unit = field?.querySelector(".bk-sim-unit")?.textContent?.trim() || "";
	const pending = {
		from: previous ? previous.from : old,
		to: value,
		time: r.time,
		label,
		unit,
	} as PendingControl;
	pending.timer = setTimeout(() => {
		r.pendingControls.delete(key);
		r.timers.delete(pending.timer);
		if (pending.from === pending.to) return;
		recordEvent(r, {
			title: `${pending.label} changed`,
			detail: `${formatTelemetryValue(pending.from)} → ${formatTelemetryValue(pending.to)}${pending.unit ? ` ${pending.unit}` : ""}`,
			time: pending.time,
			kind: "control",
			tone: "neutral",
		});
	}, 300);
	r.pendingControls.set(key, pending);
	r.timers.add(pending.timer);
}
function resetRuntime(id: string) {
	const r = runtime.get(id);
	if (!r) return;
	r.generation = (r.generation || 0) + 1;
	r.restoreSequence = (r.restoreSequence || 0) + 1;
	r.activeRestoreSeq = 0;
	r.isRestoringSnapshot = false;
	r.inFlightPresentSnapshot = false;
	r.inFlightManualCapture = false;
	r.figure.querySelector(".bk-capture-name")?.remove();
	r.lastPresentCapture = 0;
	r.latestPresentSnapshot = undefined;
	delete r.graphSnapshotTime;
	for (const timer of r.timers) clearTimeout(timer);
	r.timers.clear();
	if (r.viewRafId !== null) {
		cancelAnimationFrame(r.viewRafId);
		r.viewRafId = null;
	}
	delete r.figure.dataset.bkPausedSnapshot;
	cancelAllPendingRequests(r, "Runtime reset");
	for (const pending of r.pendingControls.values()) {
		clearTimeout(pending.timer);
	}
	r.pendingControls.clear();
	r.flushTimer = null;
	r.started = Date.now();
	r.hasStarted = false;
	r.time = 0;
	r.values = Object.create(null);
	r.previous = Object.create(null);
	r.rules = Object.create(null);
	r.samples = Object.create(null);
	r.branchSamples = new Map();
	r.sampleBranchId = "main";
	r.latest = Object.create(null);
	r.lastFlush = 0;
	r.unreadValues.clear();
	r.unreadEvents = 0;
	for (const row of r.figure.querySelectorAll(".bk-telemetry-row")) {
		row.removeAttribute("data-measurement-tone");
		const label = row.querySelector<HTMLElement>(".bk-telemetry-state");
		if (label) {
			label.textContent = "";
			label.hidden = true;
		}
	}
	r.figure.querySelector(".bk-measurement-notifications")?.replaceChildren();
	const doc =
		r.figure?.ownerDocument ||
		(typeof document !== "undefined" ? document : null);
	const win =
		doc?.defaultView || (typeof window !== "undefined" ? window : null);
	const CustomEventCtor =
		win?.CustomEvent ||
		(typeof CustomEvent !== "undefined" ? CustomEvent : null);
	if (CustomEventCtor) {
		r.figure.dispatchEvent(
			new CustomEventCtor("bk:snapshot-view-change", {
				bubbles: true,
				detail: { viewing: false },
			}),
		);
	}
	r.timeline?.reset();
	r.graphs?.reset();
	try {
		r.iframe?.contentWindow?.postMessage({ type: "bk:telemetry-reset" }, "*");
	} catch (_) {}
	seedControls(r);
	syncBadge(r, "telemetry");
	syncBadge(r, "timeline");
	sendVisibility(r);
	syncCaptureButtonState(r);
}
function clearRuntime(id: string) {
	const r = runtime.get(id);
	if (!r) return;
	delete r.figure.dataset.bkPausedSnapshot;
	cancelAllPendingRequests(r, "Runtime cleared/disposed");
	if (r.viewRafId !== null) {
		cancelAnimationFrame(r.viewRafId);
		r.viewRafId = null;
	}
	r.observer?.disconnect();
	if (r.resize) window.removeEventListener("resize", r.resize);
	r.graphs?.dispose();
	r.timeline?.dispose();
	if (r.click) r.figure.removeEventListener("click", r.click);
	if (r.input) {
		r.figure.removeEventListener("input", r.input);
		r.figure.removeEventListener("change", r.input);
	}
	if (r.branchListener)
		r.figure.removeEventListener("bk:interaction-branch", r.branchListener);
	if (r.snapshotViewListener)
		r.figure.removeEventListener(
			"bk:snapshot-view-change",
			r.snapshotViewListener,
		);
	if (r.continueListener)
		r.figure.removeEventListener("bk:snapshot-continue", r.continueListener);
	if (r.captureRequestListener)
		r.figure.removeEventListener(
			"bk:capture-snapshot-request",
			r.captureRequestListener,
		);
	if (r.load) r.iframe?.removeEventListener("load", r.load);
	for (const timer of r.timers) clearTimeout(timer);
	runtime.delete(id);
}
function processMeasurements(
	state: SimulationState,
	data: Record<string, unknown>,
) {
	const r = runtime.get(state.id);
	if (!r) return;
	Object.assign(r.values, data);
	r.time =
		typeof r.values.time === "number" && Number.isFinite(r.values.time)
			? r.values.time
			: (Date.now() - r.started) / 1000;
	if (
		!r.hasStarted &&
		Object.keys(data).some((key) => Object.hasOwn(r.schema, key))
	) {
		r.hasStarted = true;
		const startSnapshot: SimulationSnapshot = {
			id: `snap-${r.figure.id || "sim"}-start-${Date.now()}`,
			simId: r.figure.id,
			time: r.time,
			timestamp: Date.now(),
			label: "Start",
			props: Object.fromEntries(r.controlValues),
			telemetry: { ...r.values },
			isExact: false,
		};
		if (r.iframe?.contentWindow) {
			addPendingSnapshotRequest(r, startSnapshot.id, (response) => {
				if (response.success && response.isExact) {
					startSnapshot.state = response.state;
					if (response.telemetry && typeof response.telemetry === "object")
						startSnapshot.telemetry = { ...response.telemetry };
					startSnapshot.isExact = true;
					if (
						typeof response.time === "number" &&
						Number.isFinite(response.time)
					) {
						startSnapshot.time = response.time;
					}
					if (response.props && typeof response.props === "object") {
						startSnapshot.props = { ...response.props };
					}
				}
			});
			try {
				r.iframe.contentWindow.postMessage(
					{
						type: "bk:snapshot-capture",
						id: startSnapshot.id,
						time: r.time,
						label: "Start",
						initial: true,
					},
					"*",
				);
			} catch (_) {}
		}
		r.timeline?.start(r.time, { ...r.values }, startSnapshot);
	}
	for (const [key, value] of Object.entries(data)) {
		const item = Object.hasOwn(r.schema, key) ? r.schema[key] : null;
		if (!item) continue;
		const previous = r.previous[key],
			had = Object.hasOwn(r.previous, key);
		const changed =
			had &&
			(typeof value === "number" && typeof previous === "number"
				? Math.abs(value - previous) > (item.changeThreshold ?? 0)
				: value !== previous);
		if (!had || changed) r.previous[key] = value;
		const active = item.states?.find((entry) =>
			matchesMeasurementCondition(value, entry.when),
		);
		for (const row of Array.from(
			r.figure.querySelectorAll<HTMLElement>("[data-telemetry-key]"),
		).filter((row) => row.dataset.telemetryKey === key)) {
			if (active) row.dataset.measurementTone = active.tone;
			else row.removeAttribute("data-measurement-tone");
			const label = row.querySelector<HTMLElement>(".bk-telemetry-state");
			if (label) {
				label.textContent = active?.label || "";
				label.hidden = !active?.label;
			}
		}
		if (changed) markUnread(r, "telemetry", key);
		for (const rule of item.notifications || []) {
			const ruleKey = `${key}\0${rule.id}`,
				match = matchesMeasurementCondition(value, rule.when),
				prior = r.rules[ruleKey],
				now = Date.now();
			if (!prior) {
				r.rules[ruleKey] = { match, fired: false, last: -Infinity };
				continue;
			}
			if (
				match &&
				!prior.match &&
				(!prior.fired || rule.once === false) &&
				now - prior.last >= (rule.cooldown ?? 0) * 1000
			) {
				prior.fired = true;
				prior.last = now;
				recordEvent(r, {
					key,
					title: rule.message,
					detail: `${item.label || key}: ${formatTelemetryValue(value, item)}${item.unit ? ` ${item.unit}` : ""}`,
					time: r.time,
					tone: rule.tone || "neutral",
					kind: "event",
				});
				if (rule.toast !== false)
					showNotification(r, key, rule.message, rule.tone || "neutral");
			}
			prior.match = match;
		}
	}
	for (const spec of [...r.specs, ...(r.historySpecs || [])]) {
		const y = r.values[spec.yKey || spec.key],
			x = spec.xAxis.key === "time" ? r.time : r.values[spec.xAxis.key];
		if (
			typeof x !== "number" ||
			!Number.isFinite(x) ||
			typeof y !== "number" ||
			!Number.isFinite(y)
		)
			continue;
		const point = {
			time: r.time,
			x,
			y,
			branchId: r.timeline?.getActiveBranchId() || "main",
		};
		r.latest[spec.key] = point;
		r.samples[spec.key] ||= [];
		const samples = r.samples[spec.key];
		const last = samples.at(-1);
		if (!last || r.time - last.time >= 0.05) {
			samples.push(point);
			if (samples.length > 600)
				r.samples[spec.key] = samples.filter(
					(_, index) => index % 2 === 0 || index === samples.length - 1,
				);
		} else if (last.time === r.time) samples[samples.length - 1] = point;
	}
	scheduleViewUpdate(r);
}

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
			resetRuntime(target);
			if (state.rafId !== null) {
				cancelAnimationFrame(state.rafId);
				state.rafId = null;
			}
			state.pending = Object.create(null);
			state.values = Object.create(null);
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
		state.pending = Object.create(null);
		state.values = Object.create(null);
		resetRuntime(_id);
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

	const safeData = Object.fromEntries(
		Object.entries(data).filter(
			([key, value]) =>
				(Object.hasOwn(state.schema || {}, key) || key === "time") &&
				(value === null ||
					typeof value === "string" ||
					typeof value === "boolean" ||
					(typeof value === "number" && Number.isFinite(value))),
		),
	);
	processMeasurements(state, safeData);
	Object.assign(state.values, safeData);
	Object.assign(state.pending, safeData);

	if (state.rafId === null) {
		state.rafId = requestAnimationFrame(() => {
			state.rafId = null;
			applyTelemetryUpdate(simId);
			state.pending = Object.create(null);
		});
	}
}

function findSimIdForWindow(sourceWindow: Window): string | null {
	for (const [id, state] of simRegistry.entries()) {
		const iframe = state.figure.querySelector<HTMLIFrameElement>(
			".bk-embed-frame iframe, .bk-sim-preview iframe, iframe",
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
	if (wiredWindow === window) return;
	wiredWindow = window;

	// 1. Listen for sandbox telemetry messages from simulation iframes
	window.addEventListener("message", (event: MessageEvent) => {
		if (!event.data || typeof event.data !== "object") return;
		if (
			event.data.type !== "bk:telemetry" &&
			event.data.type !== "bk:telemetry-reset" &&
			event.data.type !== "bk:runtime-ready" &&
			event.data.type !== "bk:simulation-ready" &&
			event.data.type !== "bk:snapshot-capabilities" &&
			event.data.type !== "bk:snapshot-data" &&
			event.data.type !== "bk:snapshot-restored" &&
			event.data.type !== "bk:scene-interaction"
		)
			return;

		const sourceWindow = event.source;
		if (!sourceWindow) return;

		const simId = findSimIdForWindow(sourceWindow as Window);
		if (!simId) return;

		const r = runtime.get(simId);

		if (event.data.type === "bk:scene-interaction") {
			if (r && !r.isRestoringSnapshot && r.timeline?.isAtPast()) {
				handleBranchingInteraction(r, "Moved in scene");
			}
			return;
		}

		if (
			event.data.type === "bk:runtime-ready" ||
			event.data.type === "bk:simulation-ready"
		) {
			sendVisibility(r);
			try {
				r?.iframe?.contentWindow?.postMessage(
					{ type: "bk:snapshot-query-capabilities" },
					"*",
				);
			} catch (_) {}
			return;
		}
		if (event.data.type === "bk:snapshot-capabilities") {
			if (r) {
				r.supportsExactSnapshot = Boolean(
					event.data.supported ?? event.data.canRestoreExactState,
				);
				r.timeline?.setCapability(r.supportsExactSnapshot, event.data.reason);
				ensureCaptureButton(r);
			}
			return;
		}
		if (event.data.type === "bk:snapshot-data") {
			if (r && typeof event.data.id === "string") {
				const entry = r.pendingSnapshotRequests.get(event.data.id);
				if (entry) {
					if (entry.generation !== (r.generation || 0)) {
						settleSnapshotRequest(r, event.data.id, {
							success: false,
							isExact: false,
							cancelled: true,
							error: "Stale generation",
						});
						return;
					}
					settleSnapshotRequest(r, event.data.id, {
						success: Boolean(event.data.success),
						isExact: Boolean(event.data.isExact),
						state: event.data.state,
						telemetry: event.data.telemetry,
						time: event.data.time,
						props: event.data.props,
						imageDataUrl: validSnapshotImage(event.data.imageDataUrl)
							? event.data.imageDataUrl
							: undefined,
						imageError:
							typeof event.data.imageError === "string"
								? event.data.imageError.slice(0, 300)
								: undefined,
						error: event.data.error,
					});
				}
			}
			return;
		}
		if (event.data.type === "bk:snapshot-restored") {
			if (r && typeof event.data.id === "string") {
				const entry = r.pendingRestoreRequests.get(event.data.id);
				if (entry) {
					if (
						entry.generation !== (r.generation || 0) ||
						entry.restoreSeq !== r.activeRestoreSeq
					) {
						settleRestoreRequest(r, event.data.id, {
							success: false,
							isExact: false,
							cancelled: true,
							error: "Stale generation or superseded sequence",
						});
						return;
					}
					settleRestoreRequest(r, event.data.id, {
						success: Boolean(event.data.success && event.data.isExact),
						isExact: Boolean(event.data.isExact),
						time: event.data.time,
						props: event.data.props,
						error: event.data.error,
					});
				}
			}
			return;
		}
		if (event.data.type === "bk:telemetry-reset") {
			bkResetTelemetry(simId);
			return;
		}
		if (!event.data.data || typeof event.data.data !== "object") return;
		if (
			r &&
			!r.isRestoringSnapshot &&
			(r.figure.dataset.bkSnapshotViewing === "true" ||
				r.figure.getAttribute("data-snapshot-viewing") === "true" ||
				r.timeline?.isAtPast())
		) {
			return;
		}
		queueTelemetryUpdate(simId, event.data.data);
	});

	document.addEventListener("bk:simulation-reset", (event) => {
		const id = (event as CustomEvent<{ id: string }>).detail?.id;
		if (id) bkResetTelemetry(id);
	});
}

function readScript<T>(figure: Element, selector: string, fallback: T): T {
	try {
		const value = JSON.parse(
			figure.querySelector(selector)?.textContent || "null",
		);
		return value && typeof value === "object" && !Array.isArray(value)
			? value
			: fallback;
	} catch (_) {
		return fallback;
	}
}
function readPreferences(r: MeasurementRuntime): Preferences {
	let saved: Record<string, unknown> = preferenceMemory.get(r.storageKey) || {};
	try {
		const raw = window.sessionStorage.getItem(r.storageKey);
		if (raw) {
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
				saved = parsed;
		}
	} catch (_) {}
	const hasSaved =
		saved.version === 2 ||
		(Array.isArray(saved.visible) && saved.visible.length > 0) ||
		typeof saved.graph === "string";
	const visible =
		hasSaved && Array.isArray(saved.visible)
			? saved.visible
			: r.config.visible || [];
	const graphs = hasSaved
		? Array.isArray(saved.graphs)
			? saved.graphs
			: typeof saved.graph === "string"
				? [
						{
							key: saved.graph,
							minimized: saved.minimized === true,
							x: saved.x,
							y: saved.y,
						},
					]
				: []
		: r.config.graphs || [];
	const tab = saved.tab;
	return {
		version: 2,
		visible: [
			...new Set(
				visible.filter(
					(key): key is string =>
						typeof key === "string" &&
						Object.hasOwn(r.schema, key) &&
						Boolean(r.schema[key].scene),
				),
			),
		],
		graphs: graphs
			.filter(
				(graph, index) =>
					graph &&
					typeof graph.key === "string" &&
					((Object.hasOwn(r.schema, graph.key) &&
						Boolean(r.schema[graph.key].graph)) ||
						(graph.axes &&
							typeof graph.axes.x === "string" &&
							typeof graph.axes.y === "string" &&
							customGraphSpec(r.schema, graph.axes.x, graph.axes.y).ok &&
							graph.key ===
								`custom:${encodeURIComponent(graph.axes.x)}:${encodeURIComponent(graph.axes.y)}`)) &&
					graphs.findLastIndex((candidate) => candidate?.key === graph.key) ===
						index,
			)
			.map((graph) => ({ ...graph })),
		tab:
			tab === "controls" ||
			tab === "telemetry" ||
			tab === "timeline" ||
			tab === "graphs"
				? tab
				: r.config.initialTab,
	};
}
export function bkInitTelemetry(): void {
	for (const id of runtime.keys()) clearRuntime(id);
	for (const state of simRegistry.values())
		if (state.rafId !== null) cancelAnimationFrame(state.rafId);
	simRegistry.clear();
	const elements = Array.from(
		document.querySelectorAll(".bk-sim-telemetry-schema"),
	);
	elements.forEach((element, index) => {
		const figure = element.closest<HTMLElement>(".bk-object");
		if (!figure) return;
		const schema = readScript<SimulationTelemetry>(
			figure,
			".bk-sim-telemetry-schema",
			{},
		);
		if (!Object.keys(schema).length) return;
		const id =
			figure.id || figure.getAttribute("data-telemetry-id") || `sim-${index}`;
		const title =
			figure.getAttribute("data-telemetry-title") ||
			figure.querySelector(".bk-object-title")?.textContent?.trim() ||
			"Interactive simulation";
		simRegistry.set(id, {
			id,
			title,
			figure,
			schema,
			pending: Object.create(null),
			values: Object.create(null),
			rafId: null,
		});
		const r = {
			figure,
			schema,
			config: readScript<SimulationMeasurementsConfig>(
				figure,
				".bk-measurements-config",
				{},
			),
			iframe: figure.querySelector<HTMLIFrameElement>(
				".bk-embed-frame iframe, .bk-sim-preview iframe, iframe",
			),
			storageKey: `bk:measurements:${window.location.pathname}:${id}`,
			timers: new Set(),
			specs: measurementGraphSpecs(schema),
			historySpecs: Object.keys(schema)
				.map((key) => {
					const result = customGraphSpec(schema, "time", key);
					return result.ok
						? { ...result.spec, key: `history:${encodeURIComponent(key)}` }
						: null;
				})
				.filter(Boolean),
			lastToast: -Infinity,
			unreadValues: new Set(),
			unreadEvents: 0,
			controlValues: new Map(),
			pendingControls: new Map(),
			pendingSnapshotRequests: new Map(),
			pendingRestoreRequests: new Map(),
			flushTimer: null,
			viewRafId: null,
			lastFlush: 0,
		} as MeasurementRuntime;
		seedControls(r);
		r.preferences = readPreferences(r);
		for (const window of r.preferences.graphs) {
			if (!window.axes) continue;
			const result = customGraphSpec(schema, window.axes.x, window.axes.y);
			if (result.ok) {
				r.specs.push(result.spec);
				appendCustomGraphChoice(r, result.spec);
			}
		}
		savePreferences(r);
		const history = figure.querySelector<HTMLElement>(
			".bk-measurement-history",
		);
		if (history && r.config.timeline)
			r.timeline = createMeasurementTimeline(history, {
				schema,
				config:
					typeof r.config.timeline === "object" ? r.config.timeline : undefined,
				getVisibleKeys: () => r.preferences.visible,
				onSelect: (key) => focusMeasurement(r, key),
				onCompareBranch: (branchId) => {
					rememberBranchSamples(r);
					const branch = r.timeline
						?.getBranches()
						.find((branch) => branch.id === branchId);
					const data = r.branchSamples?.get(branchId);
					if (!branch || !data) return;
					r.graphs.setComparison({ label: branch.name, data });
					if (!r.graphs.getWindows().length && r.specs[0])
						r.graphs.open(r.specs[0].key);
				},
				onRestoreSnapshot: (snapshot, entry) =>
					restoreSimulationSnapshot(r, snapshot, entry),
				canRestoreSnapshot: () => r.supportsExactSnapshot === true,
			});
		const notices = figure.querySelector(".bk-measurement-notifications");
		if (notices) figure.append(notices);
		r.resize = () => positionNotifications(r);
		window.addEventListener("resize", r.resize);
		figure.querySelector(".bk-measurement-graph-panel")?.remove();
		r.graphs = createMeasurementGraphWorkspace({
			figure,
			simId: id,
			specs: r.specs,
			initialWindows: r.preferences.graphs,
			onWindowsChange: (states) => {
				r.preferences.graphs = states;
				savePreferences(r);
				syncGraphActions(r);
			},
		});
		syncVisibility(r);
		syncGraphActions(r);
		ensureCaptureButton(r);
		r.load = () => {
			cancelAllPendingRequests(r, "Iframe reloaded");
			bkResetTelemetry(id);
			try {
				r.iframe?.contentWindow?.postMessage(
					{ type: "bk:snapshot-query-capabilities" },
					"*",
				);
			} catch (_) {}
		};
		r.iframe?.addEventListener("load", r.load);
		r.graphs.onCursorChange((time) => r.timeline?.setInspectedTime(time));
		r.click = (event: Event) => {
			const action = (event.target as Element).closest<HTMLElement>(
				"[data-bk-action], [data-bk-preset]",
			);
			if (action && figure.contains(action)) {
				const isButton =
					(typeof HTMLButtonElement !== "undefined" &&
						action instanceof HTMLButtonElement) ||
					action.tagName === "BUTTON";
				const isDisabled =
					(isButton && (action as any).disabled) ||
					action.getAttribute("aria-disabled") === "true";
				if (action.hasAttribute("data-bk-preset")) {
					let presetProps: Record<string, unknown> = {};
					if (action.dataset.bkPresetProps) {
						try {
							presetProps = JSON.parse(action.dataset.bkPresetProps);
						} catch {}
					}
					// Only branch if props actually differ! Don't rely solely on is-active CSS which can be stale after restore
					if (!isDisabled && !arePropsEqual(r.controlValues, presetProps)) {
						handleBranchingInteraction(
							r,
							action.textContent?.trim() || "Preset changed",
						);
					}
				} else if (!isDisabled) {
					handleBranchingInteraction(r, action.textContent?.trim() || "Action");
				}
			}
			const removePlot = (event.target as Element).closest<HTMLElement>(
				"[data-remove-custom-graph]",
			);
			if (removePlot) {
				const key = removePlot.dataset.removeCustomGraph || "";
				if (!key.startsWith("custom:")) return;
				r.graphs.remove(key);
				delete r.samples[key];
				delete r.latest[key];
				for (const data of r.branchSamples?.values() || []) delete data[key];
				removePlot.closest(".bk-custom-graph-item")?.remove();
				r.figure
					.querySelector<HTMLElement>("[data-create-graph]")
					?.focus({ preventScroll: true });
				return;
			}
			if ((event.target as Element).closest("[data-export-timeline]")) {
				exportTimeline(r);
				return;
			}
			if ((event.target as Element).closest("[data-create-graph]")) {
				createCustomGraph(r);
				return;
			}
			const button = (event.target as Element).closest<HTMLElement>(
				"[data-measurement-toggle], [data-measurement-graph], .bk-timeline-return-btn, [data-bk-capture-snapshot], [data-bk-continue-snapshot], .bk-timeline-continue-btn",
			);
			if (!button || !figure.contains(button)) return;
			if (
				button.matches(
					"[data-bk-capture-snapshot], [data-bk-capture-snapshot] *",
				)
			) {
				if (!(button as HTMLButtonElement).disabled) {
					captureManualSnapshot(r);
				}
				return;
			}
			if (
				button.matches(
					"[data-bk-continue-snapshot], .bk-timeline-continue-btn, [data-bk-continue-snapshot] *, .bk-timeline-continue-btn *",
				)
			) {
				handleBranchingInteraction(r, "Continuation");
				return;
			}
			if (button.classList.contains("bk-timeline-return-btn")) return;
			const key = button.dataset.measurementToggle;
			if (key) updateVisibility(r, key);
			const graph = button.dataset.measurementGraph;
			if (graph && r.specs.some((spec) => spec.key === graph)) {
				if (r.preferences.graphs.some((window) => window.key === graph))
					r.graphs.close(graph);
				else r.graphs.open(graph);
			}
		};
		r.input = (event: Event) => {
			const input = (event.target as Element).closest<
				HTMLInputElement | HTMLSelectElement
			>("[data-bk-prop], [data-bk-sync]");
			if (input && figure.contains(input)) {
				const key = input.dataset.bkProp || input.dataset.bkSync || "";
				const val = readControl(input);
				const prevVal = r.controlValues.get(key);
				if (prevVal !== val && String(prevVal) !== String(val)) {
					const label =
						input
							.closest("label, .bk-sim-segmented")
							?.querySelector("span")
							?.textContent?.trim() || key;
					handleBranchingInteraction(r, `${label} changed`);
				}
			} else {
				const presetSelect = (
					event.target as Element
				).closest<HTMLSelectElement>("[data-bk-preset-select]");
				if (
					presetSelect &&
					figure.contains(presetSelect) &&
					presetSelect.value
				) {
					const opt =
						presetSelect.selectedOptions?.[0] ||
						presetSelect.options[presetSelect.selectedIndex];
					let presetProps: Record<string, unknown> = {};
					if (opt?.dataset.bkPresetProps) {
						try {
							presetProps = JSON.parse(opt.dataset.bkPresetProps);
						} catch {}
					}
					if (!arePropsEqual(r.controlValues, presetProps)) {
						presetSelect.dataset.bkCurrentPreset = presetSelect.value;
						handleBranchingInteraction(r, "Preset changed");
					}
				}
			}
		};
		figure.addEventListener("click", r.click);
		figure.addEventListener("input", r.input);
		figure.addEventListener("change", r.input);
		r.snapshotViewListener = (e: Event) => {
			const customEvent = e as CustomEvent<{
				viewing?: boolean;
				time?: number;
			}>;
			if (
				customEvent.detail &&
				typeof customEvent.detail.viewing === "boolean"
			) {
				if (customEvent.detail.viewing) {
					r.figure.dataset.bkSnapshotViewing = "true";
					r.figure.setAttribute("data-snapshot-viewing", "true");
				} else {
					delete r.figure.dataset.bkSnapshotViewing;
					r.figure.removeAttribute("data-snapshot-viewing");
				}
			}
			r.graphs?.setCursor(
				customEvent.detail?.viewing ? (customEvent.detail.time ?? null) : null,
			);
			syncCaptureButtonState(r);
		};
		figure.addEventListener("bk:snapshot-view-change", r.snapshotViewListener);
		r.continueListener = (e: Event) => {
			const customEvent = e as CustomEvent<{ reason?: string }>;
			handleBranchingInteraction(
				r,
				customEvent.detail?.reason || "Continuation",
			);
		};
		figure.addEventListener("bk:snapshot-continue", r.continueListener);
		r.captureRequestListener = () => {
			captureManualSnapshot(r);
		};
		figure.addEventListener(
			"bk:capture-snapshot-request",
			r.captureRequestListener,
		);
		r.observer = new MutationObserver((entries) => {
			if (
				!entries.some(
					(entry) =>
						entry.target === figure || entry.attributeName === "aria-selected",
				)
			)
				return;
			for (const kind of ["telemetry", "timeline"] as const) {
				if (
					figure
						.querySelector(`[role="tab"][aria-controls$="-panel-${kind}"]`)
						?.getAttribute("aria-selected") === "true"
				) {
					if (kind === "telemetry") r.unreadValues.clear();
					else r.unreadEvents = 0;
					syncBadge(r, kind);
				}
			}
			const selected = figure
				.querySelector('[role="tab"][aria-selected="true"]')
				?.getAttribute("aria-controls");
			const tab = selected?.endsWith("-timeline")
				? "timeline"
				: selected?.endsWith("-telemetry")
					? "telemetry"
					: "controls";
			if (r.preferences.tab !== tab) {
				r.preferences.tab = tab;
				savePreferences(r);
			}
			positionNotifications(r);
			flushViews(r);
		});
		r.observer.observe(figure, {
			subtree: true,
			attributes: true,
			attributeFilter: ["aria-selected", "class", "data-bk-playback-state"],
		});
		runtime.set(id, r);
		resetRuntime(id);
		if (r.preferences.tab) bkSelectInspectorTab(figure, r.preferences.tab);
	});
	const docButton = document.getElementById("bk-doc-telemetry-btn");
	if (docButton && simRegistry.size === 0) docButton.hidden = true;
}

export function getMeasurementRuntime(
	id: string,
): MeasurementRuntime | undefined {
	return runtime.get(id);
}

export {
	addPendingSnapshotRequest,
	arePropsEqual,
	cancelAllPendingRequests,
	captureManualSnapshot,
	ensureCaptureButton,
	graphData,
	handleBranchingInteraction,
	restoreBranchSamples,
	restoreSimulationSnapshot,
	scheduleViewUpdate,
	settleRestoreRequest,
	settleSnapshotRequest,
	syncCaptureButtonState,
};
