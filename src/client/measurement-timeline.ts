import type {
	MeasurementTone,
	SimulationSnapshot,
	SimulationTelemetry,
} from "../types.js";
import {
	downloadSnapshotImage,
	validSnapshotImage,
} from "./measurement-files.js";

export interface MeasurementTimelineEntry {
	id?: string;
	key?: string;
	title: string;
	detail?: string;
	time: number;
	tone?: MeasurementTone;
	kind?: "event" | "control" | "snapshot";
	snapshot?: SimulationSnapshot;
	branchId?: string;
}

// Retained for consumers of the existing export and telemetry contract.
export interface TimelineBranch {
	id: string;
	name: string;
	forkTime: number;
	forkSnapshotId?: string;
	forkEntryId?: string;
	parentBranchId?: string;
	entries: MeasurementTimelineEntry[];
	startPoint?: {
		time: number;
		values: Record<string, unknown>;
		snapshot?: SimulationSnapshot;
	};
	presentPoint?: {
		time: number;
		values: Record<string, unknown>;
		playing: boolean;
		snapshot?: SimulationSnapshot;
	};
}

export interface CreateMeasurementTimelineOptions {
	schema: SimulationTelemetry;
	config?: { start?: boolean; present?: boolean; controls?: boolean };
	getVisibleKeys?: () => string[];
	onSelect?: (key: string) => void;
	onCompareBranch?: (branchId: string) => void;
	onRestoreSnapshot?: (
		snapshot: SimulationSnapshot,
		entry?: MeasurementTimelineEntry,
	) => Promise<boolean> | boolean | void;
	canRestoreSnapshot?: () => boolean;
}

export function createMeasurementTimeline(
	container: HTMLElement,
	options: CreateMeasurementTimelineOptions,
) {
	const doc = container.ownerDocument;

	const empty = doc.createElement("p");
	empty.className = "bk-measurement-empty";
	empty.textContent = "Measurements will appear when the trial starts.";

	const capabilityNotice = doc.createElement("div");
	capabilityNotice.className = "bk-timeline-capability";
	capabilityNotice.hidden = true;

	const pastHint = doc.createElement("div");
	pastHint.className = "bk-timeline-past-hint";
	pastHint.setAttribute("role", "status");
	pastHint.setAttribute("aria-live", "polite");
	pastHint.hidden = true;

	const statusNotice = doc.createElement("div");
	statusNotice.className = "bk-timeline-status";
	statusNotice.setAttribute("role", "status");
	statusNotice.setAttribute("aria-live", "polite");
	statusNotice.setAttribute("aria-atomic", "true");

	const graphContainer = doc.createElement("div");
	graphContainer.className = "bk-timeline-git-graph bk-timeline-events";
	graphContainer.setAttribute("role", "region");
	graphContainer.setAttribute("aria-label", "Simulation timeline");

	let updateConnections = () => {};
	const ResizeObserverCtor = doc.defaultView?.ResizeObserver;
	const graphObserver = ResizeObserverCtor
		? new ResizeObserverCtor(() => updateConnections())
		: null;

	const graphHeader = doc.createElement("div");
	graphHeader.className = "bk-timeline-graph-header";

	const headerRight = doc.createElement("div");
	headerRight.className = "bk-timeline-header-right";

	const headerState = doc.createElement("span");
	headerState.className = "bk-timeline-header-state";
	headerState.textContent = "Live · 0 s";

	headerRight.append(headerState);

	const graphRows = doc.createElement("div");
	graphRows.className = "bk-timeline-graph-rows";
	graphRows.setAttribute("role", "group");
	graphRows.setAttribute("aria-label", "Timeline nodes");
	graphObserver?.observe(graphRows);
	graphObserver?.observe(graphContainer);

	// Connected Live HEAD element inside the graph connected to the active rail
	const liveHead = doc.createElement("div");
	liveHead.className = "bk-timeline-point bk-timeline-live-head";
	liveHead.dataset.kind = "present";
	liveHead.dataset.id = "present";
	liveHead.dataset.nodeRole = "head";
	liveHead.dataset.head = "true";
	liveHead.setAttribute("role", "button");
	liveHead.setAttribute("tabindex", "0");
	liveHead.setAttribute("aria-label", "Return to the current simulation state");
	liveHead.setAttribute("aria-current", "true");
	liveHead.hidden = true;

	graphHeader.append(headerRight, pastHint);
	graphContainer.append(graphHeader, graphRows);

	const detailsPanel = doc.createElement("div");
	detailsPanel.className = "bk-timeline-node-details";
	detailsPanel.setAttribute("role", "region");
	detailsPanel.setAttribute("aria-label", "Selected moment");
	detailsPanel.hidden = true;

	const startNode = doc.createElement("div");
	startNode.className = "bk-timeline-point";
	startNode.dataset.kind = "start";
	startNode.hidden = true;

	container.replaceChildren(
		empty,
		statusNotice,
		capabilityNotice,
		graphContainer,
		detailsPanel,
		startNode,
	);

	let started = false;
	let supportsExactSnapshot: boolean | null = null;
	let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

	const activeBranchId = "main";
	let isAtPastSnapshot = false;
	let activeRestoredSnapshot: SimulationSnapshot | null = null;
	let restoredEntryId: string | null = null;
	let pastSnapshotTime = 0;
	let currentRestoreRequestId = 0;
	let restorePending = false;
	let selectedNodeId: string | null = null;
	let nextOrder = 1;
	const nodeOrder = new Map<string, number>();

	const branches = new Map<string, TimelineBranch>([
		[
			"main",
			{
				id: "main",
				name: "Main timeline",
				forkTime: 0,
				entries: [],
			},
		],
	]);

	const stamp = (time: number) =>
		`${Number.isFinite(time) ? Number(time.toFixed(2)) : 0} s`;

	const renameSnapshot = (snapshotId: string, value: string): boolean => {
		const name = value.trim().slice(0, 100);
		if (!name) return false;
		let renamed = false;
		for (const branch of branches.values()) {
			for (const entry of branch.entries) {
				if (entry.snapshot?.id !== snapshotId) continue;
				entry.title = name;
				entry.snapshot.label = name;
				renamed = true;
			}
		}
		if (renamed) {
			renderGraph();
			const selected = [...branches.values()]
				.flatMap((branch) => branch.entries)
				.find((entry) => entry.id === selectedNodeId);
			if (selected) renderNodeDetails(selected);
		}
		return renamed;
	};

	const formatSnapshotValues = (values: Record<string, unknown>) => {
		const selected = options.getVisibleKeys?.() ?? [];
		const keys = [...new Set([...selected, ...Object.keys(options.schema)])]
			.filter(
				(key) =>
					key !== "time" &&
					typeof values[key] === "number" &&
					Number.isFinite(values[key] as number),
			)
			.slice(0, 3);
		return keys
			.map((key) => {
				const item = options.schema[key] || {};
				const value = values[key] as number;
				const text =
					item.precision === undefined
						? String(Number(value.toFixed(2)))
						: value.toFixed(Math.min(20, Math.max(0, item.precision)));
				return `${item.label || key}: ${text}${item.unit ? ` ${item.unit}` : ""}`;
			})
			.join(" · ");
	};

	const setPoint = (
		node: HTMLElement,
		label: string,
		time: number,
		values: Record<string, unknown>,
	) => {
		node.hidden = false;
		if (!node.querySelector(".bk-timeline-heading")) {
			node.replaceChildren();

			const dot = doc.createElement("span");
			dot.className = "bk-snapshot-dot";
			dot.setAttribute("aria-hidden", "true");

			const heading = doc.createElement("div");
			heading.className = "bk-timeline-heading";

			const title = doc.createElement("span");
			title.className = "bk-timeline-label";

			const stampEl = doc.createElement("span");
			stampEl.className = "bk-timeline-time";

			heading.append(title, stampEl);

			const detail = doc.createElement("div");
			detail.className = "bk-timeline-snapshot";

			const content = doc.createElement("div");
			content.className = "bk-snapshot-content";
			content.append(heading, detail);

			node.append(dot, content);
		}
		const title = node.querySelector(".bk-timeline-label");
		const timeLabel = node.querySelector(".bk-timeline-time");
		const detail = node.querySelector(".bk-timeline-snapshot");
		if (title) title.textContent = label;
		if (timeLabel) timeLabel.textContent = stamp(time);
		if (detail) detail.textContent = formatSnapshotValues(values);
	};

	const notifySnapshotViewChange = (viewing: boolean, time?: number) => {
		const detail: { viewing: boolean; time?: number } = { viewing };
		if (time !== undefined && Number.isFinite(time)) {
			detail.time = time;
		}
		const CustomEventCtor =
			doc.defaultView?.CustomEvent ||
			(globalThis.CustomEvent as typeof CustomEvent);
		const evt = new CustomEventCtor("bk:snapshot-view-change", {
			bubbles: true,
			composed: true,
			detail,
		});
		container.dispatchEvent(evt);
	};

	const showFeedback = (
		message: string,
		tone: "neutral" | "success" | "warning" | "danger" = "neutral",
		duration = 4000,
	) => {
		statusNotice.textContent = message;

		if (feedbackTimer) {
			clearTimeout(feedbackTimer);
			feedbackTimer = null;
		}

		if (tone === "warning" || tone === "danger") {
			capabilityNotice.hidden = false;
			capabilityNotice.dataset.tone = tone;
			capabilityNotice.textContent = message;
			if (duration > 0) {
				feedbackTimer = setTimeout(() => {
					if (supportsExactSnapshot === false) {
						capabilityNotice.hidden = false;
						capabilityNotice.dataset.tone = "warning";
						capabilityNotice.textContent =
							"Exact state restore requires simulation opt-in (window.bkRegisterSnapshot).";
					} else {
						capabilityNotice.hidden = true;
					}
					feedbackTimer = null;
				}, duration);
			}
		} else {
			if (supportsExactSnapshot !== false) {
				capabilityNotice.hidden = true;
			}
			headerState.setAttribute("title", message);
		}
	};

	const setSnapshotPending = (id: string, pending: boolean) => {
		for (const el of Array.from(
			container.querySelectorAll(".bk-snapshot-row, .bk-timeline-live-head"),
		) as HTMLElement[]) {
			if (el.dataset.id === id) {
				if (pending) {
					el.dataset.pending = "true";
					el.setAttribute("aria-busy", "true");
				} else {
					delete el.dataset.pending;
					el.removeAttribute("aria-busy");
				}
			}
		}
	};

	const updatePastHint = () => {
		if (!isAtPastSnapshot || !activeRestoredSnapshot) {
			pastHint.hidden = true;
			pastHint.replaceChildren();
			return;
		}

		pastHint.hidden = false;
		pastHint.replaceChildren();

		const hintText = doc.createElement("span");
		hintText.className = "bk-timeline-past-hint-text";
		hintText.textContent = "Continue from this moment.";

		const returnBtn = doc.createElement("button");
		returnBtn.type = "button";
		returnBtn.className = "bk-timeline-return-btn";
		returnBtn.textContent = "Back to live";
		returnBtn.title = "Return to the preserved live state";
		returnBtn.addEventListener("click", () => {
			returnToPresent();
		});

		pastHint.append(hintText, returnBtn);
	};

	const renderNodeDetails = (entry: MeasurementTimelineEntry) => {
		detailsPanel.hidden = false;
		detailsPanel.replaceChildren();

		const top = doc.createElement("div");
		top.className = "bk-timeline-details-top";

		const title = doc.createElement("span");
		title.className = "bk-timeline-details-title";
		title.textContent = entry.title;

		const time = doc.createElement("span");
		time.className = "bk-timeline-details-time";
		time.textContent = stamp(entry.time);

		top.append(title, time);

		const desc = doc.createElement("div");
		desc.className = "bk-timeline-details-desc";
		let detailText = "";
		if (entry.snapshot?.telemetry) {
			detailText = formatSnapshotValues(entry.snapshot.telemetry);
		}
		if (!detailText && entry.detail) {
			detailText = entry.detail;
		}
		desc.textContent = detailText;

		detailsPanel.append(top, desc);

		const actions = doc.createElement("div");
		actions.className = "bk-timeline-actions";

		const actionsRow = doc.createElement("div");
		actionsRow.className = "bk-timeline-actions-row";

		if (
			entry.snapshot &&
			isAtPastSnapshot &&
			activeRestoredSnapshot?.id === entry.snapshot.id
		) {
			const continueBtn = doc.createElement("button");
			continueBtn.type = "button";
			continueBtn.className = "bk-timeline-action-btn bk-timeline-continue-btn";
			continueBtn.textContent = "Resume";
			continueBtn.title = "Resume from the selected moment";

			continueBtn.addEventListener("click", () => {
				const CustomEventCtor =
					doc.defaultView?.CustomEvent ||
					(globalThis.CustomEvent as typeof CustomEvent);
				const evt = new CustomEventCtor("bk:snapshot-continue", {
					bubbles: true,
					composed: true,
					detail: {
						reason: "Resumed from snapshot",
					},
				});
				container.dispatchEvent(evt);

				// Fallback for standalone tests without full runtime wiring
				if (isAtPastSnapshot) {
					continueFromSnapshot();
				}
			});
			actionsRow.append(continueBtn);
		}

		actions.append(actionsRow);

		if (
			entry.snapshot &&
			[...branches.values()].some((branch) =>
				branch.entries.some((item) => item.id === entry.id),
			)
		) {
			const rename = doc.createElement("button");
			rename.type = "button";
			rename.className = "bk-timeline-action-btn";
			rename.textContent = "Rename";
			rename.setAttribute("aria-label", "Rename snapshot");
			rename.addEventListener("click", () => {
				const form = doc.createElement("form");
				form.className = "bk-timeline-rename";
				const input = doc.createElement("input");
				input.value = entry.title;
				input.maxLength = 100;
				input.setAttribute("aria-label", "Snapshot name");
				const save = doc.createElement("button");
				save.type = "submit";
				save.className = "bk-timeline-action-btn";
				save.textContent = "Save name";
				form.append(input, save);
				form.addEventListener("submit", (event) => {
					event.preventDefault();
					renameSnapshot(entry.snapshot!.id, input.value);
				});
				form.addEventListener("keydown", (event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						event.stopPropagation();
						renderNodeDetails(entry);
					}
				});
				top.replaceWith(form);
				input.focus();
				input.select();
			});
			actionsRow.append(rename);
			if (validSnapshotImage(entry.snapshot.imageDataUrl)) {
				const image = doc.createElement("button");
				image.type = "button";
				image.className = "bk-timeline-action-btn";
				image.textContent = "Image";
				image.setAttribute("aria-label", "Download snapshot image");
				image.addEventListener("click", () =>
					downloadSnapshotImage(
						doc,
						entry.snapshot!.imageDataUrl!,
						entry.title,
					),
				);
				actionsRow.append(image);
			}
		}
		if (actionsRow.children.length > 0) {
			detailsPanel.append(actions);
		}
	};

	const selectNode = (entry: MeasurementTimelineEntry) => {
		selectedNodeId = entry.id || null;

		for (const el of Array.from(
			container.querySelectorAll(".bk-snapshot-row, .bk-timeline-live-head"),
		) as HTMLElement[]) {
			const isMatch = el.dataset.id === entry.id;
			if (isMatch) {
				el.dataset.selected = "true";
				el.dataset.active = "true";
			} else {
				delete el.dataset.selected;
				delete el.dataset.active;
			}
		}

		renderNodeDetails(entry);
	};

	const returnToPresent = async () => {
		const branch = branches.get(activeBranchId);
		if (!branch?.presentPoint?.snapshot || !options.onRestoreSnapshot) {
			showFeedback("Present state is not available yet.", "warning");
			return;
		}
		const request = ++currentRestoreRequestId;
		restorePending = true;
		try {
			const restored = await options.onRestoreSnapshot(
				branch.presentPoint.snapshot,
			);
			if (request !== currentRestoreRequestId || restored === false) return;
			isAtPastSnapshot = false;
			activeRestoredSnapshot = null;
			restoredEntryId = null;
			selectedNodeId = null;
			updatePastHint();
			detailsPanel.hidden = true;
			renderGraph();
			notifySnapshotViewChange(false, branch.presentPoint.time);
			setPoint(
				liveHead,
				"Present",
				branch.presentPoint.time,
				branch.presentPoint.values,
			);
			delete liveHead.dataset.state;
		} catch {
			showFeedback("Could not return to present.", "warning");
		} finally {
			if (request === currentRestoreRequestId) restorePending = false;
		}
	};

	const continueFromSnapshot = (_reason?: string): string | null => {
		if (restorePending || !isAtPastSnapshot || !activeRestoredSnapshot)
			return null;
		const current = branches.get(activeBranchId);
		if (!current) return null;
		current.presentPoint = {
			time: activeRestoredSnapshot.time,
			values: { ...(activeRestoredSnapshot.telemetry || {}) },
			playing: false,
			snapshot: activeRestoredSnapshot,
		};
		isAtPastSnapshot = false;
		activeRestoredSnapshot = null;
		restoredEntryId = null;
		updatePastHint();
		detailsPanel.hidden = true;
		notifySnapshotViewChange(false, current.presentPoint.time);
		if (options.config?.present !== false)
			setPoint(
				liveHead,
				"Paused",
				current.presentPoint.time,
				current.presentPoint.values,
			);
		renderGraph();
		return activeBranchId;
	};

	const attemptRestore = (
		snapshot?: SimulationSnapshot,
		entry?: MeasurementTimelineEntry,
	): Promise<boolean> | boolean => {
		if (!options.onRestoreSnapshot) {
			showFeedback(
				"This simulation does not support restoring snapshots.",
				"warning",
			);
			return false;
		}
		if (!snapshot) {
			showFeedback("No snapshot available for this timeline entry.", "warning");
			return false;
		}

		if (supportsExactSnapshot === false && snapshot.isExact !== true) {
			showFeedback(
				"Cannot restore exact simulation state: simulation has not opted in to snapshot lifecycle (window.bkRegisterSnapshot).",
				"warning",
				6000,
			);
			return false;
		}

		const reqId = ++currentRestoreRequestId;
		restorePending = true;
		setSnapshotPending(entry?.id || snapshot.id, true);

		const finishRestore = () => {
			restorePending = false;
			setSnapshotPending(entry?.id || snapshot.id, false);
			isAtPastSnapshot = true;
			restoredEntryId = entry?.id || null;
			if (!restoredEntryId) {
				const currentBranch = branches.get(activeBranchId);
				const match = currentBranch?.entries.find(
					(e) => e.snapshot?.id === snapshot.id,
				);
				if (match) {
					restoredEntryId = match.id || null;
				} else if (
					snapshot.id === currentBranch?.startPoint?.snapshot?.id ||
					snapshot.time === currentBranch?.startPoint?.time
				) {
					restoredEntryId = "start";
				} else if (snapshot.id === currentBranch?.presentPoint?.snapshot?.id) {
					restoredEntryId = "present";
				}
			}
			activeRestoredSnapshot = snapshot;
			pastSnapshotTime = snapshot.time;
			updateGraphHeader(false);
			updatePastHint();
			notifySnapshotViewChange(true, snapshot.time);

			if (entry) {
				selectNode(entry);
			}

			const currentBranch = branches.get(activeBranchId);
			const tip = currentBranch?.presentPoint;
			setPoint(
				liveHead,
				tip ? "Present" : `Restored (${stamp(snapshot.time)})`,
				tip?.time ?? snapshot.time,
				tip?.values ?? snapshot.telemetry ?? {},
			);
			liveHead.dataset.state = "restored";
			showFeedback(
				`Restored snapshot at ${stamp(snapshot.time)}. Resume or edit controls to continue from this moment.`,
				"neutral",
			);
		};

		const handleFail = () => {
			restorePending = false;
			setSnapshotPending(entry?.id || snapshot.id, false);
			showFeedback("Simulation could not restore this snapshot.", "danger");
		};

		try {
			const result = options.onRestoreSnapshot?.(snapshot, entry);
			if (typeof result === "object" && result !== null && "then" in result) {
				return (result as Promise<boolean | void>)
					.then((ok) => {
						if (reqId !== currentRestoreRequestId) return false;
						if (ok === false) {
							handleFail();
							return false;
						}
						finishRestore();
						return true;
					})
					.catch(() => {
						if (reqId !== currentRestoreRequestId) return false;
						handleFail();
						return false;
					});
			} else {
				if (result === false) {
					handleFail();
					return false;
				}
				finishRestore();
				return true;
			}
		} catch (_) {
			handleFail();
			return false;
		}
	};

	const updateGraphHeader = (_isLiveTick = false) => {
		graphHeader.hidden = !isAtPastSnapshot;
		const branch = branches.get(activeBranchId);

		headerState.dataset.state = isAtPastSnapshot
			? "snapshot"
			: branch?.presentPoint?.playing
				? "live"
				: "paused";

		headerState.textContent = isAtPastSnapshot
			? `Snapshot · ${stamp(pastSnapshotTime)}`
			: `${branch?.presentPoint?.playing ? "Live" : "Paused"} · ${stamp(branch?.presentPoint?.time || 0)}`;
	};

	liveHead.addEventListener("click", () => {
		if (isAtPastSnapshot) {
			returnToPresent();
		}
	});

	liveHead.addEventListener("keydown", (e) => {
		if (e.key === "Enter" || e.key === " ") {
			if (isAtPastSnapshot) {
				returnToPresent();
				e.preventDefault();
			}
		} else if (e.key === "ArrowDown") {
			const firstRow = graphRows.querySelector<HTMLElement>(".bk-snapshot-row");
			firstRow?.focus();
			e.preventDefault();
		} else if (e.key === "End") {
			const rows = graphRows.querySelectorAll<HTMLElement>(".bk-snapshot-row");
			if (rows.length > 0) {
				rows[rows.length - 1]?.focus();
				e.preventDefault();
			}
		}
	});

	const renderGraph = () => {
		updateGraphHeader(false);
		const focusedId = (doc.activeElement as HTMLElement | null)?.dataset.id;
		const scrollTop = graphContainer.scrollTop;
		graphRows.replaceChildren();

		const activeBranch = branches.get(activeBranchId)!;
		const activeLane = 0;

		type GraphNode = {
			entry: MeasurementTimelineEntry;
			lane: number;
			parent?: string;
		};
		const nodes: GraphNode[] = [];
		const seen = new Set<string>();

		const remember = (
			entry: MeasurementTimelineEntry,
			lane: number,
			parent?: string,
		) => {
			const id = entry.id!;
			if (seen.has(id)) return;
			seen.add(id);
			if (!nodeOrder.has(id)) nodeOrder.set(id, nextOrder++);
			nodes.push({ entry, lane, parent });
		};

		let parent: string | undefined;
		if (activeBranch.startPoint && options.config?.start !== false) {
			nodeOrder.set("start", 0);
			remember(
				{
					id: "start",
					title: "Start",
					time: activeBranch.startPoint.time,
					snapshot: activeBranch.startPoint.snapshot,
					branchId: "main",
					kind: "snapshot",
				},
				0,
			);
			parent = "start";
		}
		for (const entry of activeBranch.entries) {
			remember(entry, 0, parent);
			parent = entry.id;
		}

		nodes.sort(
			(a, b) => nodeOrder.get(b.entry.id!)! - nodeOrder.get(a.entry.id!)!,
		);

		const laneX = (_lane: number) => 24;
		const gutter = 64;
		const layoutRow = (row: HTMLElement) => {
			row.style.padding = `4px 0 4px ${gutter}px`;
			const content = row.querySelector<HTMLElement>(".bk-snapshot-content");
			if (!content) return;
			content.style.width = "100%";
			content.style.marginLeft = "0";
			content.style.textAlign = "left";
			const meta = content.querySelector<HTMLElement>(".bk-snapshot-meta");
			if (meta) meta.style.justifyContent = "flex-start";
		};
		graphRows.style.setProperty("--snapshot-gutter", `${gutter}px`);
		graphRows.style.minWidth = `${gutter + 180}px`;

		const ns = "http://www.w3.org/2000/svg";
		const svg = doc.createElementNS(ns, "svg");
		svg.classList.add("bk-snapshot-edges");
		svg.setAttribute("aria-hidden", "true");
		graphRows.append(svg);

		if (options.config?.present !== false && started) {
			liveHead.hidden = false;
			liveHead.dataset.lane = String(activeLane);
			const liveDot = liveHead.querySelector<HTMLElement>(".bk-snapshot-dot");
			if (liveDot) {
				liveDot.style.left = `${laneX(activeLane)}px`;
			}
			layoutRow(liveHead);
			graphRows.append(liveHead);
		} else {
			liveHead.hidden = true;
		}

		const positions = new Map<string, { x: number; y: number }>();

		const activeBranchHeadId: string =
			(activeBranch && activeBranch.entries.length > 0
				? activeBranch.entries[activeBranch.entries.length - 1].id
				: "start") || "start";

		for (const { entry, lane } of nodes) {
			const row = doc.createElement("button");
			row.type = "button";
			row.className = "bk-snapshot-row";
			row.dataset.id = entry.id;
			row.dataset.lane = String(lane);
			row.dataset.branchId = "main";
			row.dataset.kind = entry.kind || (entry.snapshot ? "snapshot" : "event");
			row.dataset.time = String(entry.time);
			row.dataset.tone = entry.tone || "neutral";
			if (entry.key) row.dataset.key = entry.key;
			row.setAttribute("aria-label", `${entry.title}, ${stamp(entry.time)}`);

			const isStart = entry.id === "start";
			const isHead = entry.id === activeBranchHeadId;
			const role = isStart ? "start" : isHead ? "head" : "node";
			row.dataset.nodeRole = role;
			if (isHead) row.dataset.head = "true";

			if (entry.id === selectedNodeId) {
				row.dataset.selected = "true";
				row.dataset.active = "true";
			}

			const dot = doc.createElement("span");
			dot.className = "bk-snapshot-dot";
			dot.style.left = `${laneX(lane)}px`;
			dot.setAttribute("aria-hidden", "true");

			const content = doc.createElement("span");
			content.className = "bk-snapshot-content";

			const title = doc.createElement("span");
			title.className = "bk-snapshot-title";
			title.textContent = entry.title;

			const meta = doc.createElement("span");
			meta.className = "bk-snapshot-meta";
			meta.textContent = stamp(entry.time);

			if (role !== "node") {
				const badge = doc.createElement("span");
				badge.className = "bk-snapshot-role";
				badge.dataset.role = role;
				badge.textContent = role === "head" ? "Latest saved" : "Start";
				meta.append(badge);
			}

			content.append(title, meta);
			if (validSnapshotImage(entry.snapshot?.imageDataUrl)) {
				const thumbnail = doc.createElement("img");
				thumbnail.className = "bk-snapshot-thumbnail";
				thumbnail.src = entry.snapshot.imageDataUrl;
				thumbnail.alt = `Saved view at ${stamp(entry.time)}`;
				content.append(thumbnail);
			}
			row.append(dot, content);
			layoutRow(row);

			row.addEventListener("click", () => {
				if (entry.snapshot?.isExact) {
					attemptRestore(entry.snapshot, entry);
				} else {
					selectNode(entry);
					if (entry.key) options.onSelect?.(entry.key);
				}
			});

			row.addEventListener("keydown", (event) => {
				const allRows = [
					liveHead,
					...Array.from(
						graphRows.querySelectorAll<HTMLButtonElement>(".bk-snapshot-row"),
					),
				].filter((el) => !el.hidden);

				const currentIndex = allRows.indexOf(row as any);
				if (event.key === "Home") {
					allRows[0]?.focus();
					event.preventDefault();
				} else if (event.key === "End") {
					allRows[allRows.length - 1]?.focus();
					event.preventDefault();
				} else if (event.key === "ArrowDown") {
					const next = Math.min(allRows.length - 1, currentIndex + 1);
					allRows[next]?.focus();
					event.preventDefault();
				} else if (event.key === "ArrowUp") {
					const prev = Math.max(0, currentIndex - 1);
					allRows[prev]?.focus();
					event.preventDefault();
				}
			});

			graphRows.append(row);
		}

		updateConnections = () => {
			graphRows.style.setProperty("--snapshot-gutter", `${gutter}px`);
			graphRows.style.minWidth = `${gutter + 180}px`;
			for (const row of graphRows.querySelectorAll<HTMLElement>(
				".bk-snapshot-row, .bk-timeline-live-head",
			)) {
				layoutRow(row);
				const dot = row.querySelector<HTMLElement>(".bk-snapshot-dot");
				if (dot) dot.style.left = `${laneX(0)}px`;
			}
			svg.replaceChildren();

			if (!liveHead.hidden) {
				const liveDot = liveHead.querySelector<HTMLElement>(".bk-snapshot-dot");
				if (liveDot) {
					liveDot.style.left = `${laneX(activeLane)}px`;
				}
				positions.set("present", {
					x: laneX(activeLane),
					y: liveHead.offsetTop + (liveHead.offsetHeight || 44) / 2,
				});
			}

			for (const row of graphRows.querySelectorAll<HTMLElement>(
				".bk-snapshot-row",
			)) {
				positions.set(row.dataset.id!, {
					x: laneX(Number(row.dataset.lane)),
					y: row.offsetTop + (row.offsetHeight || 44) / 2,
				});
			}

			if (!liveHead.hidden) {
				const livePos = positions.get("present");
				const topNodePos = positions.get(activeBranchHeadId);
				if (livePos && topNodePos) {
					const path = doc.createElementNS(ns, "path");
					path.setAttribute(
						"d",
						`M ${livePos.x} ${livePos.y} V ${topNodePos.y}`,
					);
					path.setAttribute("class", "bk-timeline-rail-line");
					path.dataset.parent = activeBranchHeadId;
					path.dataset.child = "present";
					svg.append(path);
				}
			}

			for (const node of nodes) {
				const from = node.parent ? positions.get(node.parent) : undefined;
				const to = positions.get(node.entry.id!);
				if (!from || !to) continue;
				const path = doc.createElementNS(ns, "path");
				path.setAttribute("d", `M ${to.x} ${to.y} V ${from.y}`);
				path.setAttribute("class", "bk-timeline-rail-line");
				path.dataset.parent = node.parent;
				path.dataset.child = node.entry.id;
				svg.append(path);
			}

			svg.setAttribute("width", String(gutter));
			svg.setAttribute("height", String(graphRows.offsetHeight || 500));
		};

		updateConnections();
		graphContainer.scrollTop = scrollTop;

		if (focusedId) {
			[...graphRows.querySelectorAll<HTMLElement>("button, [tabindex]")]
				.find((node) => node.dataset.id === focusedId)
				?.focus({ preventScroll: true });
		}
	};

	startNode.addEventListener("click", () => {
		const currentBranch = branches.get(activeBranchId);
		if (currentBranch?.startPoint?.snapshot) {
			attemptRestore(currentBranch.startPoint.snapshot);
		}
	});

	const reset = (isInitial = false) => {
		currentRestoreRequestId++;
		restorePending = false;
		started = false;
		empty.hidden = false;
		startNode.hidden = true;
		liveHead.hidden = true;
		capabilityNotice.hidden = true;
		pastHint.hidden = true;
		detailsPanel.hidden = true;

		if (!isInitial) {
			notifySnapshotViewChange(false);
		}

		startNode.replaceChildren();
		liveHead.replaceChildren();

		graphRows.replaceChildren();
		detailsPanel.replaceChildren();
		pastHint.replaceChildren();

		branches.clear();
		branches.set("main", {
			id: "main",
			name: "Main timeline",
			forkTime: 0,
			entries: [],
		});
		nextOrder = 1;
		nodeOrder.clear();
		isAtPastSnapshot = false;
		activeRestoredSnapshot = null;
		restoredEntryId = null;
		selectedNodeId = null;

		updateGraphHeader(false);

		if (feedbackTimer) {
			clearTimeout(feedbackTimer);
			feedbackTimer = null;
		}
	};

	reset(true);

	return {
		start(
			time: number,
			values: Record<string, unknown>,
			snapshot?: SimulationSnapshot,
		) {
			if (started) return;
			started = true;
			empty.hidden = true;

			const currentBranch = branches.get(activeBranchId)!;
			currentBranch.startPoint = { time, values, snapshot };
			currentBranch.presentPoint = {
				time,
				values,
				playing: false,
				snapshot,
			};

			if (options.config?.start !== false) {
				setPoint(startNode, "Start", time, values);
				if (snapshot) startNode.style.cursor = "pointer";
			}

			if (options.config?.present !== false) {
				setPoint(liveHead, "Paused", time, values);
			}

			renderGraph();
		},

		record(entry: MeasurementTimelineEntry) {
			if (entry.kind === "control" && options.config?.controls === false) {
				return;
			}
			if (isAtPastSnapshot) return;

			const currentBranch = branches.get(activeBranchId)!;
			const entryToSave: MeasurementTimelineEntry = {
				...entry,
				id:
					entry.id ||
					`entry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
				branchId: activeBranchId,
			};
			nodeOrder.set(entryToSave.id!, nextOrder++);
			currentBranch.entries.push(entryToSave);

			renderGraph();
		},

		update(
			time: number,
			values: Record<string, unknown>,
			playing: boolean,
			snapshot?: SimulationSnapshot,
		) {
			if (!started) return;
			if (isAtPastSnapshot) return;

			const currentBranch = branches.get(activeBranchId)!;
			currentBranch.presentPoint = {
				time,
				values,
				playing,
				snapshot: snapshot ?? currentBranch.presentPoint?.snapshot,
			};

			// Stable telemetry update: DO NOT recreate DOM controls or re-render graph
			updateGraphHeader(true);

			if (options.config?.present !== false) {
				setPoint(liveHead, playing ? "Present" : "Paused", time, values);
				delete liveHead.dataset.state;
			}
		},

		setCapability(supported: boolean, reason?: string) {
			supportsExactSnapshot = supported;
			if (!supported) {
				capabilityNotice.hidden = false;
				capabilityNotice.dataset.tone = "warning";
				capabilityNotice.textContent =
					reason ||
					"Exact snapshot restore requires simulation opt-in (window.bkRegisterSnapshot).";
			} else {
				capabilityNotice.hidden = true;
			}
		},

		restoreSnapshot(snapshot: SimulationSnapshot) {
			return attemptRestore(snapshot);
		},

		setInspectedTime(time: number | null) {
			const rows = [
				...graphRows.querySelectorAll<HTMLElement>(".bk-snapshot-row"),
			];
			const closest =
				time === null
					? null
					: rows.reduce<HTMLElement | null>(
							(best, row) =>
								!best ||
								Math.abs(Number(row.dataset.time) - time) <
									Math.abs(Number(best.dataset.time) - time)
									? row
									: best,
							null,
						);
			for (const row of rows)
				row.toggleAttribute("data-inspected", row === closest);
		},
		getActiveBranchId() {
			return activeBranchId;
		},

		renameSnapshot,
		getBranches() {
			return Array.from(branches.values());
		},

		getBranchCount() {
			return branches.size;
		},

		switchBranch(branchId: string) {
			return branchId === "main";
		},

		deleteBranch(_branchId: string) {
			return false;
		},

		canDeleteBranch(branchId: string) {
			return {
				allowed: false,
				reason:
					branchId === "main"
						? "Main timeline cannot be deleted."
						: "Branch not found.",
			};
		},

		setFocusMode(_focused: boolean) {},

		isFocusMode() {
			return false;
		},

		refreshLayout() {
			updateConnections();
		},

		isAtPast() {
			return isAtPastSnapshot;
		},

		continueFromSnapshot,
		branchOnContinuation: continueFromSnapshot,

		showFeedback,

		reset,

		dispose() {
			graphObserver?.disconnect();
			if (feedbackTimer) clearTimeout(feedbackTimer);
			container.replaceChildren();
		},
	};
}
