import { validSnapshotImage, downloadSnapshotImage } from "./measurement-files.js";
import type {
	MeasurementTone,
	SimulationSnapshot,
	SimulationTelemetry,
} from "../types.js";

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
	let closeBranchMenu = (_restoreFocus = false) => {};
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

	let branchCounter = 0;
	let activeBranchId = "main";
	let isAtPastSnapshot = false;
	let activeRestoredSnapshot: SimulationSnapshot | null = null;
	let restoredEntryId: string | null = null;
	let pastSnapshotTime = 0;
	let currentRestoreRequestId = 0;
	let selectedNodeId: string | null = null;
	let focusMode = false;
	const branchLanes = new Map<string, number>([["main", 0]]);
	let nextLane = 1;
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
            const selected = [...branches.values()].flatMap(branch => branch.entries).find(entry => entry.id === selectedNodeId);
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

	const setBranchPending = (branchId: string, pending: boolean) => {
		for (const el of Array.from(
			container.querySelectorAll(`[data-branch-id="${branchId}"]`),
		) as HTMLElement[]) {
			if (pending) {
				el.dataset.pending = "true";
				el.setAttribute("aria-busy", "true");
			} else {
				delete el.dataset.pending;
				el.removeAttribute("aria-busy");
			}
		}
	};

	const isRestoredHead = (
		branch: TimelineBranch,
		snapshot: SimulationSnapshot,
		entryId?: string | null,
	): boolean => {
		if (branch.presentPoint && snapshot.time < branch.presentPoint.time) return false;
		if (entryId === "start") {
			return branch.entries.length === 0;
		}
		if (entryId === "present") {
			return true;
		}

		if (entryId) {
			const index = branch.entries.findIndex((e) => e.id === entryId);
			if (index >= 0) {
				return index === branch.entries.length - 1;
			}
		}

		const reversedEntries = [...branch.entries].reverse();
		const match = reversedEntries.find((e) => e.snapshot?.id === snapshot.id);
		if (match) {
			return branch.entries.indexOf(match) === branch.entries.length - 1;
		}

		if (branch.presentPoint?.snapshot?.id === snapshot.id) {
			return true;
		}

		if (branch.startPoint?.snapshot?.id === snapshot.id) {
			return branch.entries.length === 0;
		}

		return false;
	};

	const updatePastHint = () => {
		if (!isAtPastSnapshot || !activeRestoredSnapshot) {
			pastHint.hidden = true;
			pastHint.replaceChildren();
			return;
		}

		pastHint.hidden = false;
		pastHint.replaceChildren();

		const currentBranch = branches.get(activeBranchId);
		const atHead = currentBranch
			? isRestoredHead(currentBranch, activeRestoredSnapshot, restoredEntryId)
			: false;

		const hintText = doc.createElement("span");
		hintText.className = "bk-timeline-past-hint-text";
		hintText.textContent = atHead
			? "Continue from this moment."
			: "Continue from this moment.";

		const returnBtn = doc.createElement("button");
		returnBtn.type = "button";
		returnBtn.className = "bk-timeline-return-btn";
		returnBtn.textContent = "Back to live";
		returnBtn.title = "Return to present without branching";
		returnBtn.addEventListener("click", () => {
			returnToPresent();
		});

		pastHint.append(hintText, returnBtn);
	};

	const canDeleteBranch = (
		branchId: string,
	): { allowed: boolean; reason?: string } => {
		if (branchId === "main") {
			return { allowed: false, reason: "Main timeline cannot be deleted." };
		}
		if (!branches.has(branchId)) {
			return { allowed: false, reason: "Branch not found." };
		}
		const childBranches = [...branches.values()].filter(
			(b) => b.parentBranchId === branchId,
		);
		if (childBranches.length > 0) {
			return {
				allowed: false,
				reason: `Cannot delete branch with active child branches (${childBranches.map((b) => b.name).join(", ")} depend on it).`,
			};
		}
		if (branchId === activeBranchId) {
			const targetBranch = branches.get(branchId)!;
			const fallbackId =
				targetBranch.parentBranchId && branches.has(targetBranch.parentBranchId)
					? targetBranch.parentBranchId
					: "main";
			const fallbackBranch = branches.get(fallbackId)!;
			const fallbackSnapshot =
				fallbackBranch.presentPoint?.snapshot ||
				fallbackBranch.entries
					.slice()
					.reverse()
					.find((e) => e.snapshot)?.snapshot ||
				fallbackBranch.startPoint?.snapshot;

			if (!options.onRestoreSnapshot) {
				return {
					allowed: false,
					reason:
						"Cannot delete active branch: simulation does not support snapshot restoration.",
				};
			}
			if (supportsExactSnapshot === false) {
				return {
					allowed: false,
					reason:
						"Cannot delete active branch: simulation has not registered snapshot handlers.",
				};
			}
			if (!fallbackSnapshot) {
				return {
					allowed: false,
					reason: `Cannot delete active branch: no restorable state available on fallback ${fallbackBranch.name}.`,
				};
			}
		}
		return { allowed: true };
	};

	const deleteBranch = (branchId: string): Promise<boolean> | boolean => {
		const check = canDeleteBranch(branchId);
		if (!check.allowed) {
			showFeedback(check.reason || "Cannot delete branch.", "warning");
			return false;
		}

		const targetBranch = branches.get(branchId)!;

		if (branchId === activeBranchId) {
			const fallbackId =
				targetBranch.parentBranchId && branches.has(targetBranch.parentBranchId)
					? targetBranch.parentBranchId
					: "main";
			const fallbackBranch = branches.get(fallbackId)!;
			const fallbackSnapshot =
				fallbackBranch.presentPoint?.snapshot ||
				fallbackBranch.entries
					.slice()
					.reverse()
					.find((e) => e.snapshot)?.snapshot ||
				fallbackBranch.startPoint?.snapshot;

			if (
				!fallbackSnapshot ||
				!options.onRestoreSnapshot ||
				supportsExactSnapshot === false
			) {
				showFeedback(
					`Cannot safely delete ${targetBranch.name}: no restorable fallback available.`,
					"danger",
				);
				return false;
			}

			const reqId = ++currentRestoreRequestId;
			setBranchPending(branchId, true);

			const finishActiveDelete = () => {
				setBranchPending(branchId, false);
				branches.delete(branchId);
				activeBranchId = fallbackId;
				isAtPastSnapshot = false;
				activeRestoredSnapshot = null;
				restoredEntryId = null;
				selectedNodeId = null;
				updatePastHint();
				detailsPanel.hidden = true;
				notifySnapshotViewChange(false, fallbackBranch.presentPoint?.time);
				renderGraph();
				if (fallbackBranch.presentPoint) {
					setPoint(
						liveHead,
						fallbackBranch.presentPoint.playing ? "Present" : "Paused",
						fallbackBranch.presentPoint.time,
						fallbackBranch.presentPoint.values,
					);
					delete liveHead.dataset.state;
				}
				showFeedback(
					`Deleted ${targetBranch.name}; restored ${fallbackBranch.name}.`,
					"neutral",
				);
			};

			const handleActiveDeleteFail = () => {
				setBranchPending(branchId, false);
				showFeedback(
					`Could not safely restore ${fallbackBranch.name}. Branch deletion cancelled.`,
					"danger",
				);
			};

			try {
				const result = options.onRestoreSnapshot(fallbackSnapshot);
				if (typeof result === "object" && result !== null && "then" in result) {
					return (result as Promise<boolean | void>)
						.then((ok) => {
							if (reqId !== currentRestoreRequestId) return false;
							if (ok === false) {
								handleActiveDeleteFail();
								return false;
							}
							finishActiveDelete();
							return true;
						})
						.catch(() => {
							if (reqId !== currentRestoreRequestId) return false;
							handleActiveDeleteFail();
							return false;
						});
				} else {
					if (result === false) {
						handleActiveDeleteFail();
						return false;
					}
					finishActiveDelete();
					return true;
				}
			} catch {
				handleActiveDeleteFail();
				return false;
			}
		}

		branches.delete(branchId);
		if (
			selectedNodeId &&
			!branches
				.get(activeBranchId)
				?.entries.some((e) => e.id === selectedNodeId)
		) {
			selectedNodeId = null;
			detailsPanel.hidden = true;
		}
		renderGraph();
		showFeedback(`Deleted ${targetBranch.name}.`, "neutral");
		return true;
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

		const currentBranch = branches.get(activeBranchId);
		const isHead = currentBranch
			? isRestoredHead(currentBranch, entry.snapshot || ({} as any), entry.id)
			: false;

		if (
			entry.snapshot &&
			isAtPastSnapshot &&
			activeRestoredSnapshot?.id === entry.snapshot.id
		) {
			const continueBtn = doc.createElement("button");
			continueBtn.type = "button";
			continueBtn.className = "bk-timeline-action-btn bk-timeline-continue-btn";
			continueBtn.textContent = "Resume";
			continueBtn.title = isHead
				? "Resume from the selected moment"
				: "Resume from the selected moment";

			continueBtn.addEventListener("click", () => {
				const CustomEventCtor =
					doc.defaultView?.CustomEvent ||
					(globalThis.CustomEvent as typeof CustomEvent);
				const evt = new CustomEventCtor("bk:snapshot-continue", {
					bubbles: true,
					composed: true,
					detail: {
						reason: isHead ? "Resumed simulation" : "Branched from snapshot",
					},
				});
				container.dispatchEvent(evt);

				// Fallback for standalone tests without full runtime wiring
				if (isAtPastSnapshot) {
					branchOnContinuation(
						isHead ? "Resumed simulation" : "Branched from snapshot",
					);
				}
			});
			actionsRow.append(continueBtn);
		}

		if (entry.branchId && entry.branchId !== activeBranchId) {
			const switchBtn = doc.createElement("button");
			switchBtn.type = "button";
			switchBtn.className = "bk-timeline-action-btn";
			switchBtn.textContent = "Switch";
            switchBtn.title = `Switch to ${branches.get(entry.branchId)?.name || "branch"}`;
			switchBtn.addEventListener("click", () => {
				selectBranch(entry.branchId!);
			});
			actionsRow.append(switchBtn);
		}

		if (entry.branchId && entry.branchId !== "main") {
			const delBtn = doc.createElement("button");
			delBtn.type = "button";
			delBtn.className = "bk-timeline-action-btn bk-timeline-delete-btn";
			delBtn.dataset.action = "delete";
			delBtn.textContent = "Delete branch";

			const check = canDeleteBranch(entry.branchId);
			if (!check.allowed) {
				delBtn.disabled = true;
				delBtn.title = check.reason || "Cannot delete branch";
				delBtn.setAttribute("aria-describedby", `del-reason-${entry.branchId}`);

				const note = doc.createElement("div");
				note.className = "bk-timeline-action-note";
				note.id = `del-reason-${entry.branchId}`;
				note.textContent = check.reason || "Cannot delete branch";

				actionsRow.append(delBtn);
				actions.append(actionsRow, note);
			} else {
				delBtn.title = "Delete this branch and remove its timeline";
				let confirming = false;
				const cancelBtn = doc.createElement("button");
				cancelBtn.type = "button";
				cancelBtn.className = "bk-timeline-action-btn";
				cancelBtn.textContent = "Cancel";
				const resetConfirmation = () => {
					confirming = false;
					delete delBtn.dataset.confirm;
					delBtn.textContent = "Delete branch";
					delBtn.removeAttribute("aria-label");
					cancelBtn.remove();
				};
				cancelBtn.addEventListener("click", () => {
					resetConfirmation();
					delBtn.focus();
				});
				delBtn.addEventListener("keydown", (event) => {
					if (event.key === "Escape" && confirming) {
						event.preventDefault();
						resetConfirmation();
					}
				});

				delBtn.addEventListener("click", async () => {
					if (!confirming) {
						confirming = true;
						delBtn.dataset.confirm = "true";
						delBtn.textContent = "Confirm delete";
						delBtn.setAttribute(
							"aria-label",
							`Confirm deletion of branch ${branches.get(entry.branchId!)?.name || ""}`,
						);
						actionsRow.append(cancelBtn);
						return;
					}

					delBtn.disabled = true;
					cancelBtn.disabled = true;
					const targetId = entry.branchId!;
					const ok = await deleteBranch(targetId);
					if (ok) {
						const retained =
							graphRows.querySelector<HTMLElement>(
								'.bk-snapshot-row[data-selected="true"]',
							) ||
							graphHeader.querySelector<HTMLElement>(
								"button",
							) ||
							graphRows.querySelector<HTMLElement>(".bk-snapshot-row") ||
							container;
						retained?.focus();
					} else {
						delBtn.disabled = false;
						cancelBtn.disabled = false;
						resetConfirmation();
					}
				});
				actionsRow.append(delBtn);
				actions.append(actionsRow);
			}
		} else {
			actions.append(actionsRow);
		}

        if (entry.snapshot && [...branches.values()].some(branch => branch.entries.some(item => item.id === entry.id))) {
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
                form.addEventListener("submit", event => {
                    event.preventDefault(); renameSnapshot(entry.snapshot!.id, input.value);
                });
                form.addEventListener("keydown", event => {
                    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); renderNodeDetails(entry); }
                });
                top.replaceWith(form);
                input.focus(); input.select();
            });
            actionsRow.append(rename);
            if (validSnapshotImage(entry.snapshot.imageDataUrl)) {
                const image = doc.createElement("button");
                image.type = "button";
                image.className = "bk-timeline-action-btn";
                image.textContent = "Image";
                image.setAttribute("aria-label", "Download snapshot image");
                image.addEventListener("click", () => downloadSnapshotImage(doc, entry.snapshot!.imageDataUrl!, entry.title));
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
		}
	};

	const branchOnContinuation = (_reason?: string): string | null => {
        if (!isAtPastSnapshot || !activeRestoredSnapshot) return null;
        const current = branches.get(activeBranchId);
        if (!current) return null;
        current.presentPoint = { time: activeRestoredSnapshot.time, values: { ...(activeRestoredSnapshot.telemetry || {}) }, playing: false, snapshot: activeRestoredSnapshot };
        isAtPastSnapshot = false;
        activeRestoredSnapshot = null;
        restoredEntryId = null;
        updatePastHint();
        detailsPanel.hidden = true;
        notifySnapshotViewChange(false, current.presentPoint.time);
        if (options.config?.present !== false) setPoint(liveHead, "Paused", current.presentPoint.time, current.presentPoint.values);
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
		setSnapshotPending(entry?.id || snapshot.id, true);

		const finishRestore = () => {
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
			if (entry?.branchId && entry.branchId !== activeBranchId && branches.has(entry.branchId)) {
				activeBranchId = entry.branchId;
				renderGraph();
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
				tip ? "Branch head" : `Restored (${stamp(snapshot.time)})`,
				tip?.time ?? snapshot.time,
				tip?.values ?? snapshot.telemetry ?? {},
			);
			liveHead.dataset.state = "restored";
			const atHead = currentBranch
				? isRestoredHead(currentBranch, snapshot, restoredEntryId)
				: false;
			if (atHead) {
				showFeedback(
					`Restored head snapshot at ${stamp(snapshot.time)}. Interactions extend existing branch.`,
					"success",
				);
			} else {
				showFeedback(
					`Restored snapshot at ${stamp(snapshot.time)}. Interactions will fork a new branch.`,
					"success",
				);
			}
		};

		const handleFail = () => {
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

	const selectBranch = (targetId: string): Promise<boolean> | boolean => {
		const targetBranch = branches.get(targetId);
		if (!targetBranch) return false;
		if (targetId === activeBranchId) return true;

		const targetSnapshot =
			targetBranch.presentPoint?.snapshot ||
			targetBranch.entries
				.slice()
				.reverse()
				.find((e) => e.snapshot)?.snapshot ||
			targetBranch.startPoint?.snapshot;

		if (!options.onRestoreSnapshot) {
			showFeedback(
				"Cannot switch branch: simulation does not support snapshot restoration.",
				"warning",
			);
			return false;
		}
		if (supportsExactSnapshot === false) {
			showFeedback(
				"Cannot switch branch: simulation has not registered snapshot handlers.",
				"warning",
			);
			return false;
		}
		if (!targetSnapshot) {
			showFeedback(
				`Cannot switch to ${targetBranch.name}: no restorable snapshot available.`,
				"warning",
			);
			return false;
		}

		const reqId = ++currentRestoreRequestId;
		setBranchPending(targetId, true);

		const finishSwitch = () => {
			setBranchPending(targetId, false);
			activeBranchId = targetId;
			isAtPastSnapshot = false;
			activeRestoredSnapshot = null;
			restoredEntryId = null;
			selectedNodeId = null;
			updatePastHint();
			detailsPanel.hidden = true;
			notifySnapshotViewChange(false, targetBranch.presentPoint?.time);

			renderGraph();

			if (targetBranch.presentPoint) {
				setPoint(
					liveHead,
					targetBranch.presentPoint.playing ? "Present" : "Paused",
					targetBranch.presentPoint.time,
					targetBranch.presentPoint.values,
				);
				delete liveHead.dataset.state;
			}

			showFeedback(`Switched to ${targetBranch.name}`, "neutral");
		};

		const handleFail = () => {
			setBranchPending(targetId, false);
			showFeedback(
				`Simulation could not switch to ${targetBranch.name}.`,
				"danger",
			);
		};

		try {
			const result = options.onRestoreSnapshot(targetSnapshot, { title: targetBranch.name, time: targetSnapshot.time, snapshot: targetSnapshot, branchId: targetId });
			if (typeof result === "object" && result !== null && "then" in result) {
				return (result as Promise<boolean | void>)
					.then((ok) => {
						if (reqId !== currentRestoreRequestId) return false;
						if (ok === false) {
							handleFail();
							return false;
						}
						finishSwitch();
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
				finishSwitch();
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
			: branch?.presentPoint?.playing ? "live" : "paused";

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
		closeBranchMenu();
		updateGraphHeader(false);
		const focusedId = (doc.activeElement as HTMLElement | null)?.dataset.id;
		const scrollTop = graphContainer.scrollTop;
		graphRows.replaceChildren();

		const allBranches = [...branches.values()];

		let visibleBranches = allBranches;
		const activeChain = new Set<string>();
		let curr: TimelineBranch | undefined = branches.get(activeBranchId);
		while (curr) {
			activeChain.add(curr.id);
			curr = curr.parentBranchId
				? branches.get(curr.parentBranchId)
				: undefined;
		}

		if (focusMode && activeBranchId) {
			visibleBranches = allBranches.filter((b) => activeChain.has(b.id));
		}

		for (const branch of visibleBranches) {
            if (!branchLanes.has(branch.id)) branchLanes.set(branch.id, nextLane++);
        }

		const activeBranch = branches.get(activeBranchId);
		const activeLane = branchLanes.get(activeBranchId) ?? 0;

		if (visibleBranches.length < allBranches.length) {
			const summary = doc.createElement("div");
			summary.className = "bk-timeline-branch-summary";
			const countHidden = allBranches.length - visibleBranches.length;
			const summaryText = doc.createElement("span");
			summaryText.textContent = `${countHidden} inactive ${countHidden === 1 ? "branch" : "branches"} hidden`;
			const showAllBtn = doc.createElement("button");
			showAllBtn.type = "button";
			showAllBtn.className = "bk-timeline-summary-btn";
			showAllBtn.dataset.action = "show-all";
			showAllBtn.textContent = "Show all";
			showAllBtn.addEventListener("click", () => {
				focusMode = false;
				renderGraph();
			});
			summary.append(summaryText, showAllBtn);
			graphRows.append(summary);
		}

		type GraphNode = {
			entry: MeasurementTimelineEntry;
			lane: number;
			parent?: string;
			branch: TimelineBranch;
		};
		const nodes: GraphNode[] = [];
		const seen = new Set<string>();
		const snapshotOwners = new Map<string, string>();

		const remember = (
			entry: MeasurementTimelineEntry,
			lane: number,
			branch: TimelineBranch,
			parent?: string,
		) => {
			const id = entry.id!;
			if (seen.has(id)) return;
			seen.add(id);
			if (!nodeOrder.has(id)) nodeOrder.set(id, nextOrder++);
			nodes.push({ entry, lane, parent, branch });
			if (entry.snapshot && !snapshotOwners.has(entry.snapshot.id)) {
				snapshotOwners.set(entry.snapshot.id, id);
			}
		};

		visibleBranches.forEach((branch) => {
			const lane = branchLanes.get(branch.id) ?? 0;
			let parent =
				branch.forkEntryId ||
				(branch.forkSnapshotId
					? snapshotOwners.get(branch.forkSnapshotId)
					: undefined);

			if (
				!branch.parentBranchId &&
				branch.startPoint &&
				options.config?.start !== false
			) {
				nodeOrder.set("start", 0);
				remember(
					{
						id: "start",
						title: "Start",
						time: branch.startPoint.time,
						snapshot: branch.startPoint.snapshot,
						branchId: branch.id,
						kind: "snapshot",
					},
					lane,
					branch,
				);
				parent = "start";
			}

			for (const entry of branch.entries) {
				if (seen.has(entry.id!)) continue;
				remember(entry, lane, branch, parent);
				parent = entry.id;
			}
			if (branch.id !== activeBranchId && branch.presentPoint?.snapshot && options.config?.present !== false) {
				remember({ id: `tip-${branch.id}`, title: branch.name, time: branch.presentPoint.time, snapshot: branch.presentPoint.snapshot, branchId: branch.id, kind: "snapshot" }, lane, branch, parent);
			}
		});

		nodes.sort(
			(a, b) => nodeOrder.get(b.entry.id!)! - nodeOrder.get(a.entry.id!)!,
		);

        const maxLanes = Math.max(...visibleBranches.map(branch => branchLanes.get(branch.id) || 0)) + 1;
        const laneWidth = 12;
        const mainX = 24;
        const laneX = (lane: number) => mainX + lane * laneWidth;
        // The track gutter has room for ordinary branch counts; more tracks scroll together.
        const gutter = Math.max(64, laneX(maxLanes - 1) + 20);
        const layoutRow = (row: HTMLElement, lane: number) => {
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
			layoutRow(liveHead, activeLane);
			graphRows.append(liveHead);
		} else {
			liveHead.hidden = true;
		}

		const positions = new Map<string, { x: number; y: number }>();

		const activeBranchHeadId: string =
			(activeBranch && activeBranch.entries.length > 0
				? activeBranch.entries[activeBranch.entries.length - 1].id
				: "start") || "start";

		for (const { entry, lane, branch } of nodes) {
			const row = doc.createElement("button");
			row.type = "button";
			row.className = "bk-snapshot-row";
			row.dataset.id = entry.id;
			row.dataset.lane = String(lane);
			row.dataset.branchId = branch.id;
			row.dataset.kind = entry.kind || (entry.snapshot ? "snapshot" : "event");
			row.dataset.time = String(entry.time);
			row.dataset.tone = entry.tone || "neutral";
			if (entry.key) row.dataset.key = entry.key;
			row.setAttribute("aria-label", `${entry.title}, ${stamp(entry.time)}`);

			const isFork = Boolean(entry.id?.startsWith("fork-"));
			const isStart = entry.id === "start";
			const isHead =
				entry.id === activeBranchHeadId && branch.id === activeBranchId;
			const role = isFork
				? "fork"
				: isStart
					? "start"
					: isHead
						? "head"
						: "node";
			row.dataset.nodeRole = role;
			if (isHead) row.dataset.head = "true";
			if (isFork) row.dataset.fork = "true";

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
			meta.textContent = branch.id !== "main" && role !== "fork" && entry.title !== branch.name
				? `${stamp(entry.time)} · ${branch.name}`
				: stamp(entry.time);
			meta.title = branch.name;

			if (role !== "node") {
				const badge = doc.createElement("span");
				badge.className = "bk-snapshot-role";
				badge.dataset.role = role;
				badge.textContent =
					role === "head" ? "Latest saved" : role === "fork" ? "Fork" : "Start";
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
			layoutRow(row, lane);

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
            for (const row of graphRows.querySelectorAll<HTMLElement>(".bk-snapshot-row, .bk-timeline-live-head")) {
                const lane = Number(row.dataset.lane || 0);
                layoutRow(row, lane);
                const dot = row.querySelector<HTMLElement>(".bk-snapshot-dot");
                if (dot) dot.style.left = `${laneX(lane)}px`;
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
				const bend = Math.min(24, Math.abs(from.y - to.y) / 2);
				path.setAttribute(
					"d",
					from.x === to.x
						? `M ${to.x} ${to.y} V ${from.y}`
						: `M ${to.x} ${to.y} V ${from.y - bend * 2} C ${to.x} ${from.y - bend}, ${from.x} ${from.y - bend}, ${from.x} ${from.y}`,
				);
				path.setAttribute(
					"class",
					node.entry.id?.startsWith("fork-")
						? "bk-timeline-fork-edge"
						: "bk-timeline-rail-line",
				);
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

		branchLanes.clear();
		branchLanes.set("main", 0);
		nextLane = 1;
		branches.clear();
		branches.set("main", {
			id: "main",
			name: "Main timeline",
			forkTime: 0,
			entries: [],
		});
		activeBranchId = "main";
		branchCounter = 0;
		nextOrder = 1;
		nodeOrder.clear();
		isAtPastSnapshot = false;
		activeRestoredSnapshot = null;
		restoredEntryId = null;
		selectedNodeId = null;
		focusMode = false;

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
			const rows = [...graphRows.querySelectorAll<HTMLElement>(".bk-snapshot-row")];
			const closest = time === null ? null : rows.reduce<HTMLElement | null>((best, row) => !best || Math.abs(Number(row.dataset.time) - time) < Math.abs(Number(best.dataset.time) - time) ? row : best, null);
			for (const row of rows) row.toggleAttribute("data-inspected", row === closest);
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
			if (branches.has(branchId)) {
				return selectBranch(branchId);
			}
			return false;
		},

		deleteBranch(branchId: string) {
			return deleteBranch(branchId);
		},

		canDeleteBranch(branchId: string) {
			return canDeleteBranch(branchId);
		},

		setFocusMode(focused: boolean) {
			focusMode = focused;
			renderGraph();
		},

		isFocusMode() {
			return focusMode;
		},

		refreshLayout() {
			updateConnections();
		},

		isAtPast() {
			return isAtPastSnapshot;
		},

		branchOnContinuation,

		showFeedback,

		reset,

		dispose() {
			closeBranchMenu();
			graphObserver?.disconnect();
			if (feedbackTimer) clearTimeout(feedbackTimer);
			container.replaceChildren();
		},
	};
}
