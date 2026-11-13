import type {
	MeasurementTone,
	SimulationSnapshot,
	SimulationTelemetry,
} from "../types.js";
import {
	downloadSnapshotImage,
	validSnapshotImage,
} from "./measurement-files.js";
import {
	type ExperimentStore,
	experimentStore,
	type SavedCollection,
	type SavedMoment,
} from "./saved-experiments-store.js";

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
	nameOnSave?: boolean;
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
	storageKey?: string;
	store?: ExperimentStore;
	config?: { start?: boolean; present?: boolean; controls?: boolean };
	getVisibleKeys?: () => string[];
	onSelect?: (key: string) => void;
	onCompareBranch?: (branchId: string) => void;
	onRestoreSnapshot?: (
		snapshot: SimulationSnapshot,
		entry?: MeasurementTimelineEntry,
	) => Promise<boolean> | boolean | void;
	canRestoreSnapshot?: () => boolean;
	getPlaybackState?: () => boolean;
}

export function createMeasurementTimeline(
	container: HTMLElement,
	options: CreateMeasurementTimelineOptions,
) {
	const doc = container.ownerDocument;
	const win = doc.defaultView;
	const store =
		options.store ||
		experimentStore(
			win?.indexedDB,
			options.storageKey ||
				`${win?.location.pathname}:${container.closest(".bk-object")?.id}`,
		);
	let moments: SavedMoment[] = [];
	let persistedMoments: SavedMoment[] = [];
	let workspace: SimulationSnapshot | undefined;
	let selected: SavedMoment | null = null;
	let initial: SavedMoment | null = null;
	let normalState: SimulationSnapshot | undefined;
	let normalPlaying = false;
	let preview = false;
	let busy = false;
	let disposed = false;
	let loadFailed = false;
	let restoreRequest = 0;
	let queue: Promise<void> = Promise.resolve();
	let persistSequence = 0;
	let collapseAll = false;
	let autoExpanded: string | null = null;
	const collapsed = new Set<string>();
	const expanded = new Set<string>();
	const branch: TimelineBranch = {
		id: "main",
		name: "Current experiment",
		forkTime: 0,
		entries: [],
	};
	const status = doc.createElement("p");
	status.className = "bk-saved-status";
	status.setAttribute("role", "status");
	status.setAttribute("aria-live", "polite");
	const list = doc.createElement("div");
	list.className = "bk-saved-list";
	const detail = doc.createElement("section");
	detail.className = "bk-saved-preview";
	detail.setAttribute("aria-label", "Restore controls");
	const storageLabel = doc.createElement("p");
	storageLabel.className = "bk-saved-storage";
	storageLabel.textContent = "Loading states…";
	container.classList.add("bk-saved-experiments");
	const toolbar = doc.createElement("div");
	toolbar.className = "bk-saved-toolbar";
	container.replaceChildren(status, toolbar, detail, list, storageLabel);
	const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
	const emit = (viewing: boolean, time?: number) => {
		const EventCtor = win?.CustomEvent || CustomEvent;
		container.dispatchEvent(
			new EventCtor("bk:snapshot-view-change", {
				bubbles: true,
				detail: { viewing, time },
			}),
		);
	};
	const restorePlayback = (playing: boolean) => {
		const EventCtor = win?.CustomEvent || CustomEvent;
		container.dispatchEvent(
			new EventCtor("bk:timeline-live", { bubbles: true, detail: { playing } }),
		);
	};
	let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
	const feedback = (message: string) => {
		clearTimeout(feedbackTimer);
		status.dataset.visible = "true";
		feedbackTimer = setTimeout(() => {
			delete status.dataset.visible;
		}, 8000);
		status.textContent = message;
	};
	const persist = async () => {
		await ready;
		if (loadFailed) throw new Error("Saved states could not be loaded.");
		const value: SavedCollection = clone({
			version: 1,
			moments,
			workspace: undefined,
		});
		const sequence = ++persistSequence;
		const write = queue
			.catch(() => {})
			.then(async () => {
				if (!store.update) {
					await store.write(value);
					persistedMoments = clone(value.moments);
					return;
				}
				const previous = new Map(
					persistedMoments.map((moment) => [moment.id, moment]),
				);
				const next = new Map(
					value.moments.map((moment) => [moment.id, moment]),
				);
				const removed = new Set(
					[...previous.keys()].filter((id) => !next.has(id)),
				);
				const changed = value.moments.filter(
					(moment) =>
						JSON.stringify(previous.get(moment.id)) !== JSON.stringify(moment),
				);
				// Unchanged local records must not overwrite another tab's edits or deletions.
				if (!removed.size && !changed.length) return;
				const merged = await store.update((current) => {
					const changes = new Map(changed.map((moment) => [moment.id, moment]));
					const additions = changed.filter(
						(moment) => !previous.has(moment.id),
					);
					return {
						version: 1,
						moments: [
							...additions.filter(
								(moment) =>
									!current.moments.some((item) => item.id === moment.id),
							),
							...current.moments
								.filter((moment) => !removed.has(moment.id))
								.map((moment) => changes.get(moment.id) || moment),
						],
					};
				});
				persistedMoments = clone(value.moments);
				if (
					sequence === persistSequence &&
					JSON.stringify(moments) === JSON.stringify(value.moments)
				) {
					moments = clone(merged.moments);
					persistedMoments = clone(merged.moments);
					render();
				}
			});
		queue = write;
		try {
			await write;
			if (!disposed) storageLabel.textContent = "States saved on this device";
		} catch (error) {
			if (!disposed) {
				storageLabel.textContent = "Changes are only available in this session";
				feedback(
					"Could not save on this device. Free some storage, then try again.",
				);
			}
			throw error;
		}
	};
	const button = (text: string, action: () => void, primary = false) => {
		const el = doc.createElement("button");
		el.type = "button";
		el.className = `bk-saved-button${primary ? " bk-saved-button--primary" : ""}`;
		el.textContent = text;
		el.disabled = busy;
		el.addEventListener("click", action);
		return el;
	};
	const actionIcon = (
		label: "Rename" | "Download" | "Delete",
		action: () => void,
	) => {
		const el = button(label, action);
		el.classList.add("bk-saved-icon", `bk-saved-icon--${label.toLowerCase()}`);
		el.setAttribute("aria-label", label);
		el.title = label;
		const paths = {
			Rename: '<path d="m16 3 5 5M4 20l4-1L21 6l-4-4L4 15z"/>',
			Download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
			Delete: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
		};
		el.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[label]}</svg>`;
		return el;
	};
	const restore = async (snapshot: SimulationSnapshot): Promise<boolean> => {
		if (
			!options.onRestoreSnapshot ||
			options.canRestoreSnapshot?.() === false ||
			!snapshot.isExact
		) {
			feedback("This simulation cannot restore this saved moment.");
			return false;
		}
		try {
			return (await options.onRestoreSnapshot(clone(snapshot))) !== false;
		} catch {
			feedback(
				"Could not open this moment. Your current experiment is preserved.",
			);
			return false;
		}
	};
	const open = async (moment: SavedMoment) => {
		if (busy) return;
		await ready;
		const request = ++restoreRequest;
		busy = true;
		render();
		const fromNormal = !normalState;
		const wasPlaying =
			options.getPlaybackState?.() ?? branch.presentPoint?.playing ?? false;
		const restored = await restore(moment.snapshot);
		if (restored && fromNormal && workspace?.isExact) {
			normalState = clone(workspace);
			normalPlaying = wasPlaying;
		}
		if (disposed || request !== restoreRequest) return;
		if (restored) {
			selected = moment;
			autoExpanded =
				collapsed.has(moment.id) || (collapseAll && !expanded.has(moment.id))
					? moment.id
					: null;
			preview = true;
			emit(true, moment.snapshot.time);
			if (
				storageLabel.textContent === "States saved on this device" &&
				(!moment.snapshot.measurementHistory ||
					!Object.values(moment.snapshot.measurementHistory).some(
						(points) => points.length,
					))
			) {
				feedback("This saved state has no recorded graph history.");
			}
		} else
			feedback(
				"Could not open this moment. Your current experiment is preserved.",
			);
		busy = false;
		render();
	};
	const returnToPresent = async () => {
		if (busy || !normalState) return;
		const request = ++restoreRequest;
		const current = clone(normalState);
		busy = true;
		render();
		const restored = await restore(current);
		if (disposed || request !== restoreRequest) return;
		if (restored) {
			preview = false;
			selected = null;
			autoExpanded = null;
			normalState = undefined;
			workspace = current;
			emit(false, current.time);
			branch.presentPoint = {
				time: current.time,
				values: current.telemetry,
				playing: normalPlaying,
				snapshot: current,
			};
			restorePlayback(normalPlaying);
			normalPlaying = false;
		} else {
			emit(true, selected?.snapshot.time);
			feedback("Could not return yet. Your experiment is still preserved.");
		}
		busy = false;
		render();
	};
	const continueFromSnapshot = () => {
		if (busy || !preview || !selected) return null;
		workspace = clone(selected.snapshot);
		selected = null;
		normalState = undefined;
		normalPlaying = false;
		autoExpanded = null;
		preview = false;
		emit(false, workspace.time);
		const EventCtor = win?.CustomEvent || CustomEvent;
		container.dispatchEvent(
			new EventCtor("bk:state-resumed", { bubbles: true }),
		);
		render();
		return "main";
	};
	const render = () => {
		if (disposed) return;
		list.replaceChildren();
		toolbar.replaceChildren();
		const toggleAll = button(
			collapseAll ? "Expand all" : "Collapse all",
			() => {
				collapseAll = !collapseAll;
				autoExpanded = null;
				collapsed.clear();
				expanded.clear();
				render();
				toolbar.querySelector<HTMLButtonElement>("button")?.focus();
			},
		);
		toggleAll.setAttribute("aria-expanded", String(!collapseAll));
		toggleAll.setAttribute(
			"aria-label",
			collapseAll ? "Expand all previews" : "Collapse all previews",
		);
		toggleAll.title = collapseAll
			? "Expand all previews"
			: "Collapse all previews";
		toggleAll.classList.add("bk-saved-toggle-all");
		toggleAll.innerHTML =
			'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 8 4-4 4 4M8 16l4 4 4-4"/></svg>';
		const heading = doc.createElement("span");
		heading.textContent = "Saved states";
		toolbar.append(heading, toggleAll);
		detail.hidden = false;
		const live = button("Live", () => {
			if (normalState) void returnToPresent();
		});
		live.className = "bk-saved-live";
		live.setAttribute("aria-label", "Return to live experiment");
		if (!normalState) live.setAttribute("aria-current", "true");
		detail.replaceChildren(live);
		if (!moments.length && !initial) {
			const empty = doc.createElement("p");
			empty.className = "bk-saved-empty";
			empty.textContent = "Use the camera to save a state and its screenshot.";
			list.append(empty);
		}
		for (const moment of [...moments, ...(initial ? [initial] : [])]) {
			const card = doc.createElement("article");
			card.className = "bk-saved-card";
			card.dataset.savedId = moment.id;
			if (selected?.id === moment.id && preview) card.dataset.selected = "true";
			const isCollapsed =
				autoExpanded !== moment.id &&
				(collapsed.has(moment.id) || (collapseAll && !expanded.has(moment.id)));
			card.dataset.collapsed = String(isCollapsed);
			const opener = button(moment.name, () => void open(moment));
			opener.className = "bk-saved-open";
			opener.setAttribute("aria-label", `Load ${moment.name}`);
			if (selected?.id === moment.id && preview)
				opener.setAttribute("aria-current", "true");
			const name = doc.createElement("span");
			name.textContent = moment.name;
			opener.replaceChildren(name);
			if (validSnapshotImage(moment.snapshot.imageDataUrl)) {
				const image = doc.createElement("img");
				image.src = moment.snapshot.imageDataUrl;
				image.alt = "";
				opener.prepend(image);
			}
			const actions = doc.createElement("div");
			actions.className = "bk-saved-card-actions";
			if (moment !== initial) {
				actions.append(
					actionIcon("Rename", () => {
						if (card.querySelector("form")) return;
						const form = doc.createElement("form");
						form.className = "bk-saved-rename";
						const input = doc.createElement("input");
						input.value = moment.name;
						input.maxLength = 100;
						input.setAttribute("aria-label", "Saved moment name");
						const submit = button("Save", () => {}, true);
						submit.type = "submit";
						const label = doc.createElement("label");
						label.textContent = "State name";
						label.append(input);
						form.append(label, button("Cancel", render), submit);
						form.addEventListener("keydown", (event) => {
							if (event.key === "Escape") {
								event.preventDefault();
								render();
							}
						});
						form.addEventListener("submit", async (event) => {
							event.preventDefault();
							if (!input.value.trim() || busy) return;
							moment.name = input.value.trim();
							moment.snapshot.label = moment.name;
							busy = true;
							submit.disabled = true;
							try {
								await persist();
							} catch {
								// persist reports storage failures without discarding the edit.
							} finally {
								busy = false;
								render();
							}
						});
						opener.after(form);
						opener.disabled = true;
						input.focus();
						input.select();
					}),
				);
			}
			if (validSnapshotImage(moment.snapshot.imageDataUrl))
				actions.append(
					actionIcon("Download", () =>
						downloadSnapshotImage(
							doc,
							moment.snapshot.imageDataUrl!,
							moment.name,
						),
					),
				);
			if (moment !== initial)
				actions.append(
					actionIcon("Delete", () => {
						const index = moments.findIndex((m) => m.id === moment.id);
						if (index < 0) return;
						moments.splice(index, 1);
						render();
						feedback("State deleted.");
						const undo = button("Undo", () => {
							moments.splice(index, 0, moment);
							render();
							feedback("State restored.");
							void persist().catch(() => {});
						});
						status.append(" ", undo);
						void persist().catch(() => {});
					}),
				);
			card.append(opener, actions);
			if (
				moment !== initial ||
				validSnapshotImage(moment.snapshot.imageDataUrl)
			) {
				const toggle = button(
					isCollapsed ? "Expand preview" : "Collapse preview",
					() => {
						autoExpanded = null;
						if (isCollapsed) {
							collapsed.delete(moment.id);
							expanded.add(moment.id);
						} else {
							collapsed.add(moment.id);
							expanded.delete(moment.id);
						}
						render();
						[...list.querySelectorAll<HTMLElement>(".bk-saved-card")]
							.find((c) => c.dataset.savedId === moment.id)
							?.querySelector<HTMLButtonElement>(".bk-saved-toggle")
							?.focus();
					},
				);
				toggle.classList.add("bk-saved-toggle");
				toggle.setAttribute(
					"aria-label",
					`${isCollapsed ? "Expand" : "Collapse"} preview for ${moment.name}`,
				);
				toggle.setAttribute("aria-expanded", String(!isCollapsed));
				toggle.innerHTML =
					'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
				card.append(toggle);
			}
			list.append(card);
		}
	};
	const ready = store
		.read()
		.then((value) => {
			moments = value.moments;
			persistedMoments = clone(value.moments);
			moments.forEach((moment, index) => {
				if (/^State [\d.]+ s$/.test(moment.name))
					moment.name = `Saved state ${moments.length - index}`;
			});
			if (!disposed) {
				storageLabel.textContent = "States saved on this device";
				render();
			}
		})
		.catch(() => {
			loadFailed = true;
			if (!disposed) {
				storageLabel.textContent = "Device storage is unavailable";
				feedback(
					"Your saved states could not be loaded. They have not been overwritten.",
				);
				render();
			}
		});
	render();
	const onPageHide = () => {
		if (moments.length) void persist().catch(() => {});
	};
	win?.addEventListener("pagehide", onPageHide);
	return {
		ready,
		returnToPresent,
		continueFromSnapshot,
		start(
			time: number,
			values: Record<string, unknown>,
			snapshot?: SimulationSnapshot,
		) {
			branch.startPoint = { time, values, snapshot };
			if (snapshot?.isExact && options.config?.start !== false) {
				initial = {
					id: "initial",
					name: "Initial state",
					savedAt: 0,
					snapshot: clone(snapshot),
				};
				render();
			}
		},
		update(
			time: number,
			values: Record<string, unknown>,
			playing: boolean,
			snapshot?: SimulationSnapshot,
		) {
			if (preview) return;
			branch.presentPoint = { time, values, playing, snapshot };
			if (!snapshot?.isExact) return;
			workspace = clone(snapshot);
		},
		async record(entry: MeasurementTimelineEntry) {
			if (entry.kind !== "snapshot" || !entry.snapshot?.isExact) return;
			await ready;
			const snapshot = clone(entry.snapshot);
			if (!moments.some((m) => m.id === snapshot.id))
				moments.unshift({
					id: snapshot.id,
					name: entry.title,
					savedAt: Date.now(),
					snapshot,
				});
			render();
			try {
				await persist();
				feedback("State saved.");
				if (entry.nameOnSave) {
					const card = [
						...list.querySelectorAll<HTMLElement>(".bk-saved-card"),
					].find((c) => c.dataset.savedId === snapshot.id);
					card
						?.querySelector<HTMLButtonElement>(".bk-saved-card-actions button")
						?.click();
				}
			} catch {}
		},
		renameSnapshot(id: string, name: string) {
			const moment = moments.find((m) => m.snapshot.id === id);
			if (!moment || !name.trim()) return false;
			moment.name = name.trim().slice(0, 100);
			moment.snapshot.label = moment.name;
			render();
			void persist().catch(() => {});
			return true;
		},
		restoreSnapshot(snapshot: SimulationSnapshot) {
			const moment = [...moments, ...(initial ? [initial] : [])].find(
				(m) => m.snapshot.id === snapshot.id,
			);
			if (moment) return open(moment);
			return Promise.resolve(false);
		},
		setCapability(_supported: boolean, _reason?: string) {},
		setInspectedTime(_time: number | null) {},
		refreshLayout() {},
		getActiveBranchId() {
			return "main";
		},
		getBranches() {
			return [branch];
		},
		getBranchCount() {
			return 1;
		},
		canBranch() {
			return false;
		},
		branchOnContinuation(_reason?: string) {
			return null;
		},

		isAtPast() {
			return preview;
		},
		showFeedback: feedback,
		getSavedMoments() {
			return clone(moments);
		},
		reset() {
			restoreRequest++;
			busy = false;
			preview = false;
			selected = null;
			workspace = undefined;
			normalState = undefined;
			normalPlaying = false;
			initial = null;
			emit(false);
			render();
		},
		dispose() {
			disposed = true;
			clearTimeout(feedbackTimer);
			restoreRequest++;
			win?.removeEventListener("pagehide", onPageHide);
			container.replaceChildren();
		},
	};
}
