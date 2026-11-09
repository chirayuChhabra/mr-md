import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createMeasurementTimeline } from "../src/client/measurement-timeline.js";

test("timeline snapshots, ordering, focus, selection and reset", () => {
	const doc = new JSDOM("<div></div>").window.document;
	const container = doc.querySelector("div")!;
	let selected = "";
	const timeline = createMeasurementTimeline(container, {
		schema: { speed: { label: "Speed", unit: "m/s" } },
		onSelect: (key) => {
			selected = key;
		},
	});
	timeline.start(0, { speed: 2 });
	timeline.record({ key: "speed", title: "Fast", time: 3, tone: "warning" });
	timeline.record({ title: "Earlier", time: 1 });
	const button = container.querySelector('[aria-label="Fast, 3 s"]') as HTMLButtonElement;
	button.focus();
	timeline.update(4, { speed: 5 }, true);
	expect(doc.activeElement).toBe(button);
	expect(
		container.querySelector('[data-kind="start"] .bk-timeline-time')
			?.textContent,
	).toBe("0 s");
	expect(
		container.querySelector('[data-kind="start"] .bk-timeline-snapshot')
			?.textContent,
	).toBe("Speed: 2 m/s");
	expect(
		container.querySelector('[data-kind="present"] .bk-timeline-label')
			?.textContent,
	).toBe("Present");
	expect(
		container.querySelector('[data-kind="present"] .bk-timeline-time')
			?.textContent,
	).toBe("4 s");
	expect(
		container.querySelector('[data-kind="present"] .bk-timeline-snapshot')
			?.textContent,
	).toBe("Speed: 5 m/s");
	expect(container.querySelectorAll(".bk-snapshot-row")[1]?.getAttribute("aria-label")).toContain("Fast");
	expect(container.querySelectorAll(".bk-snapshot-row")[0]?.getAttribute("aria-label")).toContain("Earlier");
	expect(container.querySelector(".bk-timeline-row-info")).toBeNull();
	expect(button.dataset.tone).toBe("warning");
	button.click();
	expect(selected).toBe("speed");
	timeline.update(5, { speed: 6 }, false);
	expect(
		container.querySelector('[data-kind="present"] .bk-timeline-label')
			?.textContent,
	).toBe("Paused");
	expect(
		container.querySelector('[data-kind="present"] .bk-timeline-time')
			?.textContent,
	).toBe("5 s");
	timeline.reset();
	expect(container.textContent).toContain("Measurements will appear");
	expect(container.querySelector(".bk-snapshot-row")).toBeNull();
	timeline.dispose();
});

test("exact snapshot restoration, frozen state, and explicit continuation branching without auto-branching on passive ticks", () => {
	const doc = new JSDOM("<div></div>").window.document;
	const container = doc.querySelector("div")!;
	const restoredSnapshots: any[] = [];

	const timeline = createMeasurementTimeline(container, {
		schema: { speed: { label: "Speed", unit: "m/s" } },
		onRestoreSnapshot: (snapshot) => {
			restoredSnapshots.push(snapshot);
			return true;
		},
	});

	timeline.setCapability(true);
	timeline.start(0, { speed: 0 });

	// Record events on main branch
	const snap1 = {
		id: "snap-1",
		time: 2,
		timestamp: 1000,
		label: "Milestone 1",
		props: { mass: 1 },
		telemetry: { speed: 10 },
		state: { x: 5 },
		isExact: true,
	};
	const snap2 = {
		id: "snap-2",
		time: 4,
		timestamp: 2000,
		label: "Milestone 2",
		props: { mass: 2 },
		telemetry: { speed: 20 },
		state: { x: 10 },
		isExact: true,
	};

	timeline.record({
		id: "event-1",
		title: "Milestone 1",
		time: 2,
		snapshot: snap1,
	});
	timeline.record({
		id: "event-2",
		title: "Milestone 2",
		time: 4,
		snapshot: snap2,
	});
	timeline.update(6, { speed: 30 }, true);

	expect(timeline.getActiveBranchId()).toBe("main");
	expect(timeline.getBranches()).toHaveLength(1);
	expect(timeline.isAtPast()).toBe(false);

	// Restore snapshot 1 (at t=2)
	timeline.restoreSnapshot(snap1);
	expect(timeline.isAtPast()).toBe(true);
	expect(restoredSnapshots).toHaveLength(1);
	expect(restoredSnapshots[0].id).toBe("snap-1");
	expect(
		container.querySelector('[data-kind="present"] .bk-timeline-label')
			?.textContent,
	).toBe("Branch head");

	// 1. Passive updates while viewing frozen snapshot MUST NOT auto-branch!
	timeline.update(2.1, { speed: 12 }, true);
	timeline.update(3.0, { speed: 15 }, false);
	expect(timeline.isAtPast()).toBe(true);
	expect(timeline.getBranches()).toHaveLength(1);
	expect(timeline.getActiveBranchId()).toBe("main");

	// 2. Passive records while viewing snapshot MUST NOT auto-branch!
	timeline.record({
		id: "passive-event",
		title: "Passive Monitor Tick",
		time: 2.2,
	});
	expect(timeline.isAtPast()).toBe(true);
	expect(timeline.getBranches()).toHaveLength(1);

	timeline.branchOnContinuation("Parameters changed");

	// Branch created explicitly!
	expect(timeline.getBranches()).toHaveLength(2);
	const branchIds = timeline.getBranches().map((b) => b.id);
	expect(branchIds).toContain("main");
	expect(branchIds).toContain("branch-1");
	expect(timeline.getActiveBranchId()).toBe("branch-1");
	expect(timeline.isAtPast()).toBe(false);

	// Main branch still preserves Milestone 2 (t=4)
	const mainBranch = timeline.getBranches().find((b) => b.id === "main")!;
	expect(mainBranch.entries.map((e) => e.title)).toContain("Milestone 2");

	// Branch-1 has inherited history up to t=2, but NOT Milestone 2
	const forkedBranch = timeline.getBranches().find((b) => b.id === "branch-1")!;
	expect(forkedBranch.entries.map((e) => e.title)).toContain("Milestone 1");
	expect(forkedBranch.entries.map((e) => e.title)).not.toContain("Milestone 2");

	// Switch back to main branch
	timeline.switchBranch("main");
	expect(timeline.getActiveBranchId()).toBe("main");
	expect(container.querySelector('[aria-label="Milestone 2, 4 s"]')).not.toBeNull();

	timeline.dispose();
});

test("nested forks preserve snapshots and branch lineage", () => {
	const doc = new JSDOM("<div></div>").window.document;
	const container = doc.querySelector("div")!;

	const timeline = createMeasurementTimeline(container, {
		schema: { speed: { label: "Speed", unit: "m/s" } },
		onRestoreSnapshot: () => true,
	});

	timeline.setCapability(true);
	timeline.start(0, { speed: 0 });

	// Main branch has snap1 at t=2
	const snap1 = {
		id: "snap-main-1",
		time: 2,
		timestamp: 2000,
		label: "Main Checkpoint",
		props: {},
		telemetry: { speed: 10 },
		isExact: true,
	};
	timeline.record({
		id: "e-m1",
		title: "Main Checkpoint",
		time: 2,
		snapshot: snap1,
	});
	timeline.record({
		id: "e-m2",
		title: "Main Later Progress",
		time: 4,
	});
	timeline.update(5, { speed: 25 }, false);

	// Fork 1: Branch from snap1 (t=2, true ancestor because e-m2 is at t=4)
	timeline.restoreSnapshot(snap1);
	const branch1Id = timeline.branchOnContinuation("Fork from main");
	expect(branch1Id).toBe("branch-1");
	expect(timeline.getActiveBranchId()).toBe("branch-1");

	const branch1 = timeline.getBranches().find((b) => b.id === "branch-1")!;
	expect(branch1.parentBranchId).toBe("main");
	expect(branch1.forkTime).toBe(2);
	expect(branch1.forkSnapshotId).toBe("snap-main-1");

	// On branch-1: record a new milestone snap2 at t=3.5 and later entry at t=4.5
	const snap2 = {
		id: "snap-b1-2",
		time: 3.5,
		timestamp: 3500,
		label: "Branch 1 Milestone",
		props: {},
		telemetry: { speed: 18 },
		isExact: true,
	};
	timeline.record({
		id: "e-b1-2",
		title: "Branch 1 Milestone",
		time: 3.5,
		snapshot: snap2,
	});
	timeline.record({
		id: "e-b1-3",
		title: "Branch 1 Later Progress",
		time: 4.5,
	});

	// Fork 2 (Nested): Branch from snap2 on branch-1 (t=3.5, true ancestor because e-b1-3 is at t=4.5)
	timeline.restoreSnapshot(snap2);
	const branch2Id = timeline.branchOnContinuation("Nested fork from branch-1");
	expect(branch2Id).toBe("branch-2");
	expect(timeline.getActiveBranchId()).toBe("branch-2");

	// Verify complete lineage across all 3 branches!
	const allBranches = timeline.getBranches();
	expect(allBranches).toHaveLength(3);

	const branch2 = allBranches.find((b) => b.id === "branch-2")!;
	expect(branch2.parentBranchId).toBe("branch-1");
	expect(branch2.forkTime).toBe(3.5);
	expect(branch2.forkSnapshotId).toBe("snap-b1-2");

	// Branch 2 inherits snap1 (t=2) and snap2 (t=3.5)
	expect(branch2.entries.map((e) => e.title)).toContain("Main Checkpoint");
	expect(branch2.entries.map((e) => e.title)).toContain("Branch 1 Milestone");

	// All branches visible in graph with lineage preserved
	const lanes = container.querySelectorAll(".bk-snapshot-row[data-lane=\"2\"]");
	expect(lanes.length).toBeGreaterThan(0);

	timeline.dispose();
});

test("minimal git style node/edge graph renders all branches visible simultaneously with keyboard accessibility", () => {
	const doc = new JSDOM("<div></div>").window.document;
	const container = doc.querySelector("div")!;

	const timeline = createMeasurementTimeline(container, {
		schema: { speed: { label: "Speed", unit: "m/s" } },
		onRestoreSnapshot: () => true,
	});
	timeline.setCapability(true);
	timeline.start(0, { speed: 0 });

	// No verbose dropdown select exists
	expect(container.querySelector("select")).toBeNull();

	const snap1 = {
		id: "snap-g1",
		time: 2,
		timestamp: 1000,
		label: "Checkpoint 1",
		props: {},
		telemetry: { speed: 10 },
		isExact: true,
	};
	const snap2 = {
		id: "snap-g2",
		time: 4,
		timestamp: 2000,
		label: "Future Milestone",
		props: {},
		telemetry: { speed: 20 },
		isExact: true,
	};

	timeline.record({
		id: "e-1",
		title: "Checkpoint 1",
		time: 2,
		snapshot: snap1,
	});
	timeline.record({
		id: "e-2",
		title: "Future Milestone",
		time: 4,
		snapshot: snap2,
	});
	timeline.update(4, { speed: 20 }, false);

	// Restore and branch
	timeline.restoreSnapshot(snap1);
	timeline.branchOnContinuation("New branch");

	timeline.record({
		id: "e-fork",
		title: "Divergent Action",
		time: 2.5,
	});

	expect(container.querySelector("select")).toBeNull();

	// Git-style graph container is present
	const gitGraph = container.querySelector(".bk-timeline-git-graph");
	expect(gitGraph).not.toBeNull();

	expect(container.querySelector('.bk-snapshot-row[data-branch-id="main"]')).not.toBeNull();
	expect(container.querySelector('.bk-snapshot-row[data-branch-id="branch-1"]')).not.toBeNull();
	expect(container.querySelector('.bk-timeline-branch-pill')).toBeNull();

	// Nodes are keyboard accessible with role="button" and aria-label
	const nodes = Array.from(
		container.querySelectorAll<HTMLButtonElement>(".bk-snapshot-row"),
	);
	expect(nodes.length).toBeGreaterThan(0);
	for (const node of nodes) {
		expect(node.tagName).toBe("BUTTON");
		expect(node.getAttribute("aria-label")).not.toBeNull();
	}

	// Rails and fork connectors exist in the git graph
	const rails = container.querySelectorAll(".bk-snapshot-edges path");
	expect(rails.length).toBeGreaterThan(0);

	const forkEdge = container.querySelector(".bk-timeline-fork-edge");
	expect(forkEdge).not.toBeNull();

	timeline.dispose();
});

test("selected node reveals small title/time/details only with subtle continue button", () => {
	const doc = new JSDOM("<div></div>").window.document;
	const container = doc.querySelector("div")!;

	const snap = {
		id: "snap-node-test",
		time: 3.5,
		timestamp: 3500,
		label: "Focused Checkpoint",
		props: {},
		telemetry: { speed: 15.5 },
		isExact: true,
	};

	const timeline = createMeasurementTimeline(container, {
		schema: { speed: { label: "Speed", unit: "m/s" } },
		onRestoreSnapshot: () => true,
	});
	timeline.setCapability(true);
	timeline.start(0, { speed: 0 });

	timeline.record({
		id: "node-entry",
		title: "Focused Checkpoint",
		time: 3.5,
		snapshot: snap,
	});

	// Before selection, details panel is hidden
	const detailsPanel = container.querySelector(
		".bk-timeline-node-details",
	) as HTMLElement;
	expect(detailsPanel).not.toBeNull();
	expect(detailsPanel.hidden).toBe(true);

	// Find the node button
	const nodeBtn = container.querySelector(
		'.bk-snapshot-row[data-id="node-entry"]',
	) as HTMLButtonElement;
	expect(nodeBtn).not.toBeNull();

	// Click to select & restore
	nodeBtn.click();

	// Node displays held selected state, but aria-current is reserved for actual live head
	expect(nodeBtn.dataset.selected).toBe("true");
	expect(nodeBtn.dataset.active).toBe("true");
	expect(nodeBtn.getAttribute("aria-current")).toBeNull();
	expect(
		container
			.querySelector('.bk-timeline-live-head')
			?.getAttribute("aria-current"),
	).toBe("true");

	// Details panel is now revealed with small title, time, details, and subtle continue button
	expect(detailsPanel.hidden).toBe(false);
	expect(
		detailsPanel.querySelector(".bk-timeline-details-title")?.textContent,
	).toBe("Focused Checkpoint");
	expect(
		detailsPanel.querySelector(".bk-timeline-details-time")?.textContent,
	).toBe("3.5 s");
	expect(
		detailsPanel.querySelector(".bk-timeline-details-desc")?.textContent,
	).toContain("Speed: 15.5 m/s");

	expect(container.querySelector(".bk-timeline-past-hint")?.textContent).toContain("Changes continue on this branch");

	timeline.dispose();
});

test("honest reporting when simulation has not opted in to snapshot restoration", () => {
	const doc = new JSDOM("<div></div>").window.document;
	const container = doc.querySelector("div")!;
	let restoreCalled = false;

	const timeline = createMeasurementTimeline(container, {
		schema: { speed: { label: "Speed", unit: "m/s" } },
		onRestoreSnapshot: () => {
			restoreCalled = true;
		},
	});

	timeline.setCapability(
		false,
		"Simulation has not registered snapshot handlers",
	);
	timeline.start(0, { speed: 0 });

	const nonExactSnap = {
		id: "snap-fallback",
		time: 3,
		timestamp: 3000,
		label: "Event",
		props: {},
		telemetry: { speed: 5 },
		isExact: false,
	};
	timeline.record({
		id: "ev",
		title: "Event",
		time: 3,
		snapshot: nonExactSnap,
	});

	// Attempt restore: should NOT call restore callback or fake rewind
	const result = timeline.restoreSnapshot(nonExactSnap);
	expect(result).toBe(false);
	expect(restoreCalled).toBe(false);
	expect(timeline.isAtPast()).toBe(false);
	expect(
		container.querySelector(".bk-timeline-capability")?.textContent,
	).toContain("opted in");

	timeline.dispose();
});

test("restore waits for acknowledgement and keeps the original present while paused in history", async () => {
	const dom = new JSDOM("<div></div>");
	let acknowledge!: (success: boolean) => void;
	const timeline = createMeasurementTimeline(
		dom.window.document.querySelector("div")!,
		{
			schema: {},
			onRestoreSnapshot: () =>
				new Promise<boolean>((resolve) => {
					acknowledge = resolve;
				}),
		},
	);
	const snapshot = {
		id: "past",
		time: 1,
		timestamp: 0,
		label: "Past",
		props: {},
		telemetry: {},
		state: {},
		isExact: true,
	};
	timeline.start(0, {});
	timeline.update(5, {}, true, { ...snapshot, id: "future", time: 5 });
	timeline.restoreSnapshot(snapshot);
	expect(timeline.isAtPast()).toBe(false);
	acknowledge(true);
	await Promise.resolve();
	expect(timeline.isAtPast()).toBe(true);

	// Passive update while in history keeps present point intact
	timeline.update(1, {}, false);
	expect(timeline.getBranches()[0].presentPoint?.time).toBe(5);

	// Explicit continuation creates branch
	timeline.branchOnContinuation("Resumed");
	expect(timeline.getBranches()).toHaveLength(2);
	expect(timeline.getBranches()[0].presentPoint?.time).toBe(5);
	timeline.dispose();
	dom.window.close();
});

test("persistent past hint is shown while viewing snapshot and CustomEvent bk:snapshot-view-change dispatches", async () => {
	const doc = new JSDOM("<figure><div class='timeline'></div></figure>").window
		.document;
	const figure = doc.querySelector("figure")!;
	const container = doc.querySelector(".timeline") as HTMLElement;

	const viewEvents: Array<{ viewing: boolean; time?: number }> = [];
	figure.addEventListener("bk:snapshot-view-change", (evt: Event) => {
		viewEvents.push((evt as CustomEvent).detail);
	});

	const snap = {
		id: "snap-hint",
		time: 2.5,
		timestamp: 2500,
		label: "Past State",
		props: {},
		telemetry: { speed: 8 },
		isExact: true,
	};

	const timeline = createMeasurementTimeline(container, {
		schema: { speed: { label: "Speed", unit: "m/s" } },
		onRestoreSnapshot: () => true,
	});
	timeline.setCapability(true);
	timeline.start(0, { speed: 0 });

	timeline.record({
		id: "hint-entry",
		title: "Past State",
		time: 2.5,
		snapshot: snap,
	});
	timeline.update(5, { speed: 20 }, true, { ...snap, id: "present", time: 5 });

	const pastHint = container.querySelector(
		".bk-timeline-past-hint",
	) as HTMLElement;
	expect(pastHint).not.toBeNull();
	expect(pastHint.hidden).toBe(true);

	// 1. Restore snapshot -> hint visible, event fired with viewing: true
	timeline.restoreSnapshot(snap);
	expect(pastHint.hidden).toBe(false);
	expect(pastHint.textContent).toContain("Changes here start a new branch");

	expect(viewEvents).toHaveLength(1);
	expect(viewEvents[0]).toEqual({ viewing: true, time: 2.5 });

	// 2. Return to present -> hint hidden, event fired with viewing: false
	const returnBtn = container.querySelector(
		".bk-timeline-return-btn",
	) as HTMLButtonElement;
	returnBtn.click();
	await Promise.resolve();
	expect(pastHint.hidden).toBe(true);
	expect(viewEvents).toHaveLength(2);
	expect(viewEvents[1].viewing).toBe(false);

	// 3. Restore again, then explicit continuation branch -> hint hidden, event fired with viewing: false
	timeline.restoreSnapshot(snap);
	expect(pastHint.hidden).toBe(false);
	expect(viewEvents).toHaveLength(3);
	expect(viewEvents[2]).toEqual({ viewing: true, time: 2.5 });

	timeline.branchOnContinuation("Explicit branch");
	expect(pastHint.hidden).toBe(true);
	expect(viewEvents).toHaveLength(4);
	expect(viewEvents[3].viewing).toBe(false);

	// 4. Reset -> event fired with viewing: false
	timeline.reset();
	expect(viewEvents[viewEvents.length - 1]).toEqual({ viewing: false });

	timeline.dispose();
});

test("async restore failure and race handling prevent invalid state transitions", async () => {
	const doc = new JSDOM("<div></div>").window.document;
	const container = doc.querySelector("div")!;

	let shouldFail = false;
	const timeline = createMeasurementTimeline(container, {
		schema: {},
		onRestoreSnapshot: () => {
			if (shouldFail) return Promise.resolve(false);
			return Promise.resolve(true);
		},
	});
	timeline.setCapability(true);
	timeline.start(0, {});

	const snap = {
		id: "snap-async",
		time: 1.5,
		timestamp: 1500,
		label: "Async Snap",
		props: {},
		telemetry: {},
		isExact: true,
	};
	timeline.record({
		id: "e-async",
		title: "Async Snap",
		time: 1.5,
		snapshot: snap,
	});

	// Test Failure
	shouldFail = true;
	const restoreResult = await timeline.restoreSnapshot(snap);
	expect(restoreResult).toBe(false);
	expect(timeline.isAtPast()).toBe(false);
	expect(
		container.querySelector(".bk-timeline-capability")?.textContent,
	).toContain("could not restore");

	// Test Race conditions: slow request vs fast request
	let resolveSlow!: (val: boolean) => void;
	let resolveFast!: (val: boolean) => void;

	const snapSlow = {
		id: "snap-slow",
		time: 1.0,
		timestamp: 1000,
		label: "Slow",
		props: {},
		telemetry: {},
		isExact: true,
	};
	const snapFast = {
		id: "snap-fast",
		time: 2.0,
		timestamp: 2000,
		label: "Fast",
		props: {},
		telemetry: {},
		isExact: true,
	};

	const raceTimeline = createMeasurementTimeline(container, {
		schema: {},
		onRestoreSnapshot: (s) =>
			new Promise<boolean>((resolve) => {
				if (s.id === "snap-slow") resolveSlow = resolve;
				else resolveFast = resolve;
			}),
	});
	raceTimeline.setCapability(true);
	raceTimeline.start(0, {});
	raceTimeline.record({
		id: "e-slow",
		title: "Slow",
		time: 1.0,
		snapshot: snapSlow,
	});
	raceTimeline.record({
		id: "e-fast",
		title: "Fast",
		time: 2.0,
		snapshot: snapFast,
	});

	raceTimeline.update(3, {}, false, { ...snapFast, id: "preserved-future", time: 3 });
	// User clicks slow, then quickly clicks fast
	raceTimeline.restoreSnapshot(snapSlow);
	raceTimeline.restoreSnapshot(snapFast);

	// Fast resolves first!
	resolveFast(true);
	await Promise.resolve();
	expect(raceTimeline.isAtPast()).toBe(true);

	// Slow resolves later - should be ignored as stale!
	resolveSlow(true);
	await Promise.resolve();

	// The restored selection stays at Fast; the head remains at the preserved future.
	expect(container.querySelector(".bk-timeline-status")?.textContent).toContain("2 s");
	expect(container.querySelector('[data-kind="present"] .bk-timeline-time')?.textContent).toBe("3 s");

	timeline.dispose();
	raceTimeline.dispose();
});

test("branch switching waits for restore acknowledgement before updating active branch", async () => {
	const doc = new JSDOM("<div></div>").window.document;
	const container = doc.querySelector("div")!;

	let ackResolve!: (ok: boolean) => void;
	const timeline = createMeasurementTimeline(container, {
		schema: {},
		onRestoreSnapshot: () =>
			new Promise<boolean>((resolve) => {
				ackResolve = resolve;
			}),
	});
	timeline.setCapability(true);
	timeline.start(0, {});

	const snap1 = {
		id: "snap-b1",
		time: 2,
		timestamp: 2000,
		label: "B1",
		props: {},
		telemetry: {},
		isExact: true,
	};
	timeline.record({ id: "e-b1", title: "B1", time: 2, snapshot: snap1 });
	timeline.record({ id: "e-b2", title: "B2", time: 3 });
	timeline.update(4, {}, false, { ...snap1, id: "main-present", time: 4 });

	// Restore snapshot and fork explicitly
	const pRestore = timeline.restoreSnapshot(snap1);
	ackResolve(true);
	await pRestore;

	timeline.branchOnContinuation("Fork Item");
	expect(timeline.getActiveBranchId()).toBe("branch-1");

	// Switch to main branch which has main-present snapshot
	const pSwitch = timeline.switchBranch("main");

	// While pending, active branch MUST NOT have switched yet!
	expect(timeline.getActiveBranchId()).toBe("branch-1");

	// If switch restore fails:
	ackResolve(false);
	await pSwitch;
	expect(timeline.getActiveBranchId()).toBe("branch-1");
	expect(
		container.querySelector(".bk-timeline-capability")?.textContent,
	).toContain("could not switch");

	timeline.dispose();
});

test("avoids claiming restore on click when snapshot is unavailable", () => {
	const doc = new JSDOM("<div></div>").window.document;
	const container = doc.querySelector("div")!;

	let restoreCalled = false;
	let selectKey = "";

	const timeline = createMeasurementTimeline(container, {
		schema: { speed: { label: "Speed", unit: "m/s" } },
		onSelect: (k) => {
			selectKey = k;
		},
		onRestoreSnapshot: () => {
			restoreCalled = true;
			return true;
		},
	});
	timeline.start(0, { speed: 0 });

	// Event with NO snapshot
	timeline.record({
		id: "no-snap",
		key: "speed",
		title: "Regular Event",
		time: 2,
	});

	const button = container.querySelector(
		".bk-snapshot-row[data-key=\"speed\"]",
	) as HTMLButtonElement;
	button.click();

	// Select called, but restore NOT called
	expect(selectKey).toBe("speed");
	expect(restoreCalled).toBe(false);
	expect(timeline.isAtPast()).toBe(false);

	// Calling restoreSnapshot with null/undefined returns false with warning feedback
	const res = timeline.restoreSnapshot(undefined as any);
	expect(res).toBe(false);
	expect(restoreCalled).toBe(false);
	expect(
		container.querySelector(".bk-timeline-capability")?.textContent,
	).toContain("No snapshot available");

	timeline.dispose();
});

test("new snapshots appear above their ancestors and branch rails keep their fork", () => {
 const doc = new JSDOM('<div></div>').window.document;
 const container = doc.querySelector('div')!;
 const snap = (id: string, time: number) => ({ id, time, timestamp: time, label: id, props: {}, telemetry: {}, isExact: true });
 const timeline = createMeasurementTimeline(container, {schema:{},onRestoreSnapshot:()=>true});
 timeline.start(0, {}, snap('initial', 0));
 timeline.record({id:'early',title:'Early',time:1,snapshot:snap('early-state',1)});
 timeline.record({id:'future',title:'Future',time:8,snapshot:snap('future-state',8)});
 const labels = [...container.querySelectorAll('.bk-snapshot-row')].map(n=>n.getAttribute('aria-label'));
 expect(labels[0]).toContain('Future');
 expect(labels.at(-1)).toContain('Start');
 (container.querySelector('[data-id="early"]') as HTMLButtonElement).click();
 timeline.branchOnContinuation('Damping changed');
 timeline.record({id:'alternative',title:'Alternative',time:2,snapshot:snap('alternative-state',2)});
 expect(container.querySelector('.bk-snapshot-row')?.getAttribute('aria-label')).toContain('Alternative');
 expect(container.textContent).toContain('Damping changed');
 expect(timeline.getBranches()[0].entries.some(e=>e.id==='future')).toBe(true);
 timeline.dispose();
});

test("continuation from branch head returns existing active branch ID without creating another branch", () => {
	const doc = new JSDOM("<div></div>").window.document;
	const container = doc.querySelector("div")!;
	const snap = (id: string, time: number) => ({
		id,
		time,
		timestamp: time * 1000,
		label: id,
		props: {},
		telemetry: { speed: time },
		isExact: true,
	});

	const timeline = createMeasurementTimeline(container, {
		schema: { speed: { label: "Speed", unit: "m/s" } },
		onRestoreSnapshot: () => true,
	});
	timeline.setCapability(true);
	timeline.start(0, { speed: 0 }, snap("start-snap", 0));

	// Record entries on main
	timeline.record({ id: "e1", title: "First", time: 1, snapshot: snap("snap-1", 1) });
	timeline.record({ id: "e2", title: "Head Milestone", time: 3, snapshot: snap("snap-2", 3) });
	timeline.update(3, { speed: 3 }, false, snap("snap-2", 3));

	expect(timeline.getActiveBranchId()).toBe("main");
	expect(timeline.getBranches()).toHaveLength(1);

	// Case 1: Restore the latest recorded node (HEAD of the branch)
	timeline.restoreSnapshot(snap("snap-2", 3));
	expect(timeline.isAtPast()).toBe(true);

	// Continuation from head must return the EXISTING active branch ID without creating another branch
	const resultHead = timeline.branchOnContinuation("Resumed simulation");
	expect(resultHead).toBe("main");
	expect(timeline.getActiveBranchId()).toBe("main");
	expect(timeline.getBranches()).toHaveLength(1);
	expect(timeline.isAtPast()).toBe(false);

	// Further recording continues on main
	timeline.record({ id: "e3", title: "Extended Entry", time: 4, snapshot: snap("snap-3", 4) });
	const mainEntries = timeline.getBranches()[0].entries;
	expect(mainEntries.map((e) => e.title)).toContain("Extended Entry");

	// Case 2: Restore an ancestor node (e1 at t=1, which has e2 and e3 as descendants)
	timeline.restoreSnapshot(snap("snap-1", 1));
	expect(timeline.isAtPast()).toBe(true);

	// Continuation from a true ancestor creates a new branch
	const resultAncestor = timeline.branchOnContinuation("Branched from First");
	expect(resultAncestor).toBe("branch-1");
	expect(timeline.getActiveBranchId()).toBe("branch-1");
	expect(timeline.getBranches()).toHaveLength(2);
	expect(timeline.isAtPast()).toBe(false);

	// Case 3: Calling continuation when not at past returns null
	expect(timeline.branchOnContinuation("No-op")).toBeNull();

	timeline.dispose();
});

test("same-time distinct nodes preserve recording order and distinguish ancestor from head", () => {
	const doc = new JSDOM("<div></div>").window.document;
	const container = doc.querySelector("div")!;
	const snap = (id: string, time: number) => ({
		id,
		time,
		timestamp: time * 1000,
		label: id,
		props: {},
		telemetry: { speed: time },
		isExact: true,
	});

	const timeline = createMeasurementTimeline(container, {
		schema: {},
		onRestoreSnapshot: () => true,
	});
	timeline.setCapability(true);
	timeline.start(0, {}, snap("start", 0));

	// Record two distinct milestones at the SAME timestamp (t = 2.0s)
	const snapA = snap("snap-a", 2);
	const snapB = snap("snap-b", 2);
	timeline.record({ id: "event-a", title: "Milestone A", time: 2, snapshot: snapA });
	timeline.record({ id: "event-b", title: "Milestone B", time: 2, snapshot: snapB });
	timeline.update(2, {}, false, snapB);

	// Restoring event-a (first event at t=2): has event-b as later recorded descendant -> true ancestor!
	timeline.restoreSnapshot(snapA);
	const forkedBranchId = timeline.branchOnContinuation("Fork from A");
	expect(forkedBranchId).toBe("branch-1");
	expect(timeline.getActiveBranchId()).toBe("branch-1");

	// Switch back to main
	timeline.switchBranch("main");
	expect(timeline.getActiveBranchId()).toBe("main");

	// Restoring event-b on main (last event at t=2): has no descendants -> branch head!
	timeline.restoreSnapshot(snapB);
	const headResult = timeline.branchOnContinuation("Resume from B");
	expect(headResult).toBe("main");
	expect(timeline.getActiveBranchId()).toBe("main");
	expect(timeline.getBranches()).toHaveLength(2); // No extra branch created!

	timeline.dispose();
});

test("explicit head, start, and fork node semantics with distinct selection", () => {
	const doc = new JSDOM("<div></div>").window.document;
	const container = doc.querySelector("div")!;
	const snap = (id: string, time: number) => ({
		id,
		time,
		timestamp: time * 1000,
		label: id,
		props: {},
		telemetry: {},
		isExact: true,
	});

	const timeline = createMeasurementTimeline(container, {
		schema: {},
		onRestoreSnapshot: () => true,
	});
	timeline.setCapability(true);
	timeline.start(0, {}, snap("start", 0));

	timeline.record({ id: "checkpoint", title: "Checkpoint", time: 2, snapshot: snap("snap-c", 2) });
	timeline.record({ id: "future-head", title: "Head Node", time: 4, snapshot: snap("snap-h", 4) });
	timeline.update(4, {}, false, snap("snap-h", 4));

	// Check start node semantics
	const startRow = container.querySelector('.bk-snapshot-row[data-id="start"]') as HTMLElement;
	expect(startRow).not.toBeNull();
	expect(startRow.dataset.nodeRole).toBe("start");
	expect(startRow.querySelector('.bk-snapshot-role[data-role="start"]')?.textContent).toBe("Start");

	// Check head node semantics (actual branch tip)
	const headRow = container.querySelector('.bk-snapshot-row[data-id="future-head"]') as HTMLElement;
	expect(headRow).not.toBeNull();
	expect(headRow.dataset.nodeRole).toBe("head");
	expect(headRow.dataset.head).toBe("true");
	expect(headRow.querySelector('.bk-snapshot-role[data-role="head"]')?.textContent).toBe("Latest saved");

	// Select ancestor checkpoint
	const checkpointRow = container.querySelector('.bk-snapshot-row[data-id="checkpoint"]') as HTMLElement;
	checkpointRow.click();

	// Selection state is applied to checkpoint, but checkpoint is NOT head!
	expect(checkpointRow.dataset.selected).toBe("true");
	expect(checkpointRow.dataset.nodeRole).toBe("node");
	expect(checkpointRow.dataset.head).toBeUndefined();

	// Head row retains its head marker and semantics while checkpoint is selected!
	expect(headRow.dataset.nodeRole).toBe("head");
	expect(headRow.dataset.head).toBe("true");

	// Fork node semantics on a branched timeline
	timeline.branchOnContinuation("Branched Fork");
	const forkRow = container.querySelector('.bk-snapshot-row[data-node-role="fork"]') as HTMLElement;
	expect(forkRow).not.toBeNull();
	expect(forkRow.querySelector('.bk-snapshot-role[data-role="fork"]')?.textContent).toBe("Fork");

	timeline.dispose();
});

test("branch management: branch counting, focus view toggle, and leaf-only delete with safe rollback", async () => {
	const doc = new JSDOM("<div></div>").window.document;
	const container = doc.querySelector("div")!;
	let shouldFailRestore = false;

	const snap = (id: string, time: number) => ({
		id,
		time,
		timestamp: time * 1000,
		label: id,
		props: {},
		telemetry: {},
		isExact: true,
	});

	const timeline = createMeasurementTimeline(container, {
		schema: {},
		onRestoreSnapshot: () => {
			if (shouldFailRestore) return Promise.resolve(false);
			return Promise.resolve(true);
		},
	});
	timeline.setCapability(true);
	timeline.start(0, {}, snap("start", 0));

	timeline.record({ id: "e1", title: "M1", time: 1, snapshot: snap("s1", 1) });
	timeline.record({ id: "e2", title: "M2", time: 3, snapshot: snap("s2", 3) });
	timeline.update(3, {}, false, snap("s2", 3));

	// Create Branch 1 from M1 (ancestor of M2)
	await timeline.restoreSnapshot(snap("s1", 1));
	timeline.branchOnContinuation("Fork 1");
	expect(timeline.getActiveBranchId()).toBe("branch-1");
	expect(timeline.getBranchCount()).toBe(2);

	// Create nested Branch 2 from Branch 1 (b1-s1 is ancestor of b1-s2)
	timeline.record({ id: "b1-e1", title: "B1 Milestone", time: 2, snapshot: snap("b1-s1", 2) });
	timeline.record({ id: "b1-e2", title: "B1 Later", time: 4, snapshot: snap("b1-s2", 4) });
	await timeline.restoreSnapshot(snap("b1-s1", 2));
	timeline.branchOnContinuation("Fork 2");
	expect(timeline.getActiveBranchId()).toBe("branch-2");
	expect(timeline.getBranchCount()).toBe(3);

	// Rule 1: Cannot delete Main
	const delMain = timeline.deleteBranch("main");
	expect(delMain).toBe(false);
	expect(timeline.canDeleteBranch("main").allowed).toBe(false);

	// Rule 2: Cannot delete Branch 1 because Branch 2 depends on it (non-leaf)
	const delB1 = timeline.deleteBranch("branch-1");
	expect(delB1).toBe(false);
	expect(timeline.canDeleteBranch("branch-1").allowed).toBe(false);

	// Rule 3: Active leaf delete requires successful fallback restore. If restore fails -> abort and keep data intact!
	shouldFailRestore = true;
	const failedDel = await timeline.deleteBranch("branch-2");
	expect(failedDel).toBe(false);
	expect(timeline.getBranchCount()).toBe(3);
	expect(timeline.getActiveBranchId()).toBe("branch-2");

	// When restore succeeds: active branch-2 is deleted, fallback branch-1 is restored
	shouldFailRestore = false;
	const okDel = await timeline.deleteBranch("branch-2");
	expect(okDel).toBe(true);
	expect(timeline.getBranchCount()).toBe(2);
	expect(timeline.getActiveBranchId()).toBe("branch-1");

	// All paths are visible by default.
	expect(timeline.isFocusMode()).toBe(false);
	timeline.setFocusMode(false);
	expect(timeline.isFocusMode()).toBe(false);
	timeline.setFocusMode(true);
	expect(timeline.isFocusMode()).toBe(true);

	timeline.dispose();
});

test("accessible polite status announcements for success, switch, and fork without noisy toasts", () => {
	const doc = new JSDOM("<div></div>").window.document;
	const container = doc.querySelector("div")!;

	const snap = (id: string, time: number) => ({
		id,
		time,
		timestamp: time * 1000,
		label: id,
		props: {},
		telemetry: {},
		isExact: true,
	});

	const timeline = createMeasurementTimeline(container, {
		schema: {},
		onRestoreSnapshot: () => true,
	});
	timeline.setCapability(true);
	timeline.start(0, {}, snap("start", 0));

	const statusEl = container.querySelector(".bk-timeline-status") as HTMLElement;
	expect(statusEl).not.toBeNull();
	expect(statusEl.getAttribute("role")).toBe("status");
	expect(statusEl.getAttribute("aria-live")).toBe("polite");

	// Record e1 and subsequent e2 so e1 is an ancestor
	const s1 = snap("s1", 2);
	const s2 = snap("s2", 4);
	timeline.record({ id: "e1", title: "M1", time: 2, snapshot: s1 });
	timeline.record({ id: "e2", title: "M2", time: 4, snapshot: s2 });
	timeline.update(4, {}, false, s2);

	// Restore snapshot triggers polite announcement
	timeline.restoreSnapshot(s1);
	expect(statusEl.textContent).toContain("Restored snapshot at 2 s");

	// Fork triggers announcement
	timeline.branchOnContinuation("New Lineage");
	expect(statusEl.textContent).toContain("Branch created at 2 s");

	// Branch switch triggers announcement
	timeline.switchBranch("main");
	expect(statusEl.textContent).toContain("Switched to Main timeline");

	timeline.dispose();
});

test("refuses deletion without restorable fallback, exposes clear reasons via canDeleteBranch, and supports inline confirmation with focus retention", async () => {
	const doc = new JSDOM("<div></div>").window.document;
	const container = doc.querySelector("div")!;
	let restoreOk = true;

	const timeline = createMeasurementTimeline(container, {
		schema: { speed: { label: "Speed", unit: "m/s" } },
		onRestoreSnapshot: () => restoreOk,
	});
	timeline.setCapability(true);
	timeline.start(0, { speed: 0 }, {
		id: "snap-root",
		time: 0,
		timestamp: 0,
		label: "Start",
		props: {},
		telemetry: { speed: 0 },
		isExact: true,
	});

	const snap1 = {
		id: "snap-m1",
		time: 2,
		timestamp: 2000,
		label: "M1",
		props: {},
		telemetry: { speed: 10 },
		isExact: true,
	};
	timeline.record({ id: "e1", title: "M1", time: 2, snapshot: snap1 });
	timeline.record({ id: "e2", title: "M2", time: 4 });

	// Main cannot be deleted
	const mainCheck = timeline.canDeleteBranch("main");
	expect(mainCheck.allowed).toBe(false);
	expect(mainCheck.reason).toContain("Main timeline cannot be deleted");
	expect(await timeline.deleteBranch("main")).toBe(false);

	// Fork branch-1 from snap1
	timeline.restoreSnapshot(snap1);
	timeline.branchOnContinuation("B1");
	expect(timeline.getActiveBranchId()).toBe("branch-1");

	const snapB1 = {
		id: "snap-b1",
		time: 3,
		timestamp: 3000,
		label: "B1 Snap",
		props: {},
		telemetry: { speed: 12 },
		isExact: true,
	};
	timeline.record({ id: "eb1", title: "B1 Snap", time: 3, snapshot: snapB1 });
	timeline.record({ id: "eb2", title: "B1 Later", time: 5 });

	// Fork branch-2 from snapB1
	timeline.restoreSnapshot(snapB1);
	timeline.branchOnContinuation("B2");
	expect(timeline.getActiveBranchId()).toBe("branch-2");

	// branch-1 is a parent branch with children -> cannot be deleted
	const parentCheck = timeline.canDeleteBranch("branch-1");
	expect(parentCheck.allowed).toBe(false);
	expect(parentCheck.reason).toContain("active child branches");
	expect(await timeline.deleteBranch("branch-1")).toBe(false);
	expect(timeline.getBranchCount()).toBe(3);

	// Select branch-2 node in UI to inspect details panel
	const rowB2 = container.querySelector('.bk-snapshot-row[data-branch-id="branch-2"]') as HTMLButtonElement;
	expect(rowB2).not.toBeNull();
	rowB2.click();

	const delBtn = container.querySelector('.bk-timeline-delete-btn') as HTMLButtonElement;
	expect(delBtn).not.toBeNull();
	expect(delBtn.textContent).toBe("Delete branch");

	// First click -> inline confirmation (destructive protection)
	delBtn.click();
	expect(delBtn.dataset.confirm).toBe("true");
	expect(delBtn.textContent).toBe("Confirm delete");
	expect(timeline.getActiveBranchId()).toBe("branch-2");
	expect(timeline.getBranchCount()).toBe(3);

	// If restore fallback fails -> refuse deletion and preserve active branch
	restoreOk = false;
	delBtn.click();
	await Promise.resolve();
	await Promise.resolve();
	expect(timeline.getActiveBranchId()).toBe("branch-2");
	expect(timeline.getBranchCount()).toBe(3);

	// When restore fallback succeeds -> deletes branch-2 and restores fallback
	restoreOk = true;
	delBtn.click(); // resets to confirm
	delBtn.click(); // confirms
	await Promise.resolve();
	await Promise.resolve();
	expect(timeline.getBranchCount()).toBe(2);
	expect(timeline.getActiveBranchId()).toBe("branch-1");

	timeline.dispose();
});

test("management controls maintain focus during live telemetry updates and ticks", () => {
	const doc = new JSDOM("<div></div>").window.document;
	const container = doc.querySelector("div")!;

	const timeline = createMeasurementTimeline(container, {
		schema: { speed: { label: "Speed", unit: "m/s" } },
		onRestoreSnapshot: () => true,
	});
	timeline.setCapability(true);
	timeline.start(0, { speed: 0 });

	const snap1 = {
		id: "snap-m1",
		time: 2,
		timestamp: 2000,
		label: "M1",
		props: {},
		telemetry: { speed: 10 },
		isExact: true,
	};
	timeline.record({ id: "e1", title: "M1", time: 2, snapshot: snap1 });
	timeline.record({ id: "e2", title: "M2", time: 4 });

	// Fork so branches > 1 and management controls exist
	timeline.restoreSnapshot(snap1);
	timeline.branchOnContinuation("B1");

	const node = container.querySelector<HTMLButtonElement>('.bk-snapshot-row[data-id="e1"]')!;
	node.focus();
	for (const time of [4.2, 4.4, 4.6]) {
		timeline.update(time, { speed: 15 }, true);
		expect(doc.activeElement).toBe(node);
	}
	expect(container.querySelector("select")).toBeNull();

	timeline.dispose();
});

test("keyboard navigation: Home, End, ArrowUp, and ArrowDown across live head and snapshot nodes", () => {
	const doc = new JSDOM("<div></div>").window.document;
	const container = doc.querySelector("div")!;

	const timeline = createMeasurementTimeline(container, {
		schema: { speed: { label: "Speed", unit: "m/s" } },
		onRestoreSnapshot: () => true,
	});
	timeline.setCapability(true);
	timeline.start(0, { speed: 0 });

	timeline.record({ id: "e1", title: "Node 1", time: 1 });
	timeline.record({ id: "e2", title: "Node 2", time: 2 });
	timeline.record({ id: "e3", title: "Node 3", time: 3 });

	const liveHead = container.querySelector<HTMLElement>(".bk-timeline-live-head")!;
	const rows = Array.from(container.querySelectorAll<HTMLButtonElement>(".bk-snapshot-row"));
	expect(liveHead).not.toBeNull();
	expect(rows).toHaveLength(4); // e3, e2, e1, start

	// Focus liveHead and press ArrowDown -> first row (e3)
	liveHead.focus();
	liveHead.dispatchEvent(new doc.defaultView!.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
	expect(doc.activeElement).toBe(rows[0]);

	// From row 0, press ArrowDown -> row 1 (e2)
	rows[0].dispatchEvent(new doc.defaultView!.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
	expect(doc.activeElement).toBe(rows[1]);

	// From row 1, press End -> last row (rows[3], start)
	rows[1].dispatchEvent(new doc.defaultView!.KeyboardEvent("keydown", { key: "End", bubbles: true }));
	expect(doc.activeElement).toBe(rows[3]);

	// From last row, press ArrowUp -> row 2 (e1)
	rows[3].dispatchEvent(new doc.defaultView!.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
	expect(doc.activeElement).toBe(rows[2]);

	// From row 2, press Home -> liveHead
	rows[2].dispatchEvent(new doc.defaultView!.KeyboardEvent("keydown", { key: "Home", bubbles: true }));
	expect(doc.activeElement).toBe(liveHead);

	timeline.dispose();
});

test("bounded layout handles 20 sibling branches and 12 nested branches in narrow containers", () => {
	const doc = new JSDOM("<div></div>").window.document;
	const container = doc.querySelector("div")!;

	const timeline = createMeasurementTimeline(container, {
		schema: { speed: { label: "Speed", unit: "m/s" } },
		onRestoreSnapshot: () => true,
	});
	timeline.setCapability(true);
	timeline.start(0, { speed: 0 });

	const baseSnap = {
		id: "base-snap",
		time: 1,
		timestamp: 1000,
		label: "Base",
		props: {},
		telemetry: { speed: 5 },
		isExact: true,
	};
	timeline.record({ id: "e-base", title: "Base", time: 1, snapshot: baseSnap });
	timeline.record({ id: "e-base-later", title: "Base Later", time: 10 });

	// Create 20 sibling branches from baseSnap
	for (let i = 1; i <= 20; i++) {
		timeline.restoreSnapshot(baseSnap);
		timeline.branchOnContinuation(`Sibling Branch ${i}`);
		timeline.record({ id: `e-sib-${i}`, title: `Entry ${i}`, time: 1 + i * 0.1 });
	}

	expect(timeline.getBranchCount()).toBe(21);

	const graphRows = container.querySelector<HTMLElement>(".bk-timeline-graph-rows")!;
	const gutterPx = parseInt(graphRows.style.getPropertyValue("--snapshot-gutter"), 10);
	expect(parseInt(graphRows.style.minWidth, 10)).toBeGreaterThanOrEqual(gutterPx + 96);
	expect(new Set([...container.querySelectorAll<HTMLElement>(".bk-snapshot-row")].map(row => row.dataset.branchId)).size).toBe(21);
	expect(container.querySelector("select")).toBeNull();

	timeline.dispose();

	// Now test 12 deep nested branches
	const container2 = doc.createElement("div");
	const timeline2 = createMeasurementTimeline(container2, {
		schema: {},
		onRestoreSnapshot: () => true,
	});
	timeline2.setCapability(true);
	timeline2.start(0, {});

	let prevSnap = {
		id: "snap-root-deep",
		time: 1,
		timestamp: 1000,
		label: "Deep Root",
		props: {},
		telemetry: {},
		isExact: true,
	};
	timeline2.record({ id: "e-deep-0", title: "Deep 0", time: 1, snapshot: prevSnap });
	timeline2.record({ id: "e-deep-0-later", title: "Deep 0 Later", time: 50 });

	for (let d = 1; d <= 12; d++) {
		timeline2.restoreSnapshot(prevSnap);
		timeline2.branchOnContinuation(`Chain ${d}`);
		const nextSnap = {
			id: `snap-chain-${d}`,
			time: 1 + d,
			timestamp: (1 + d) * 1000,
			label: `Chain ${d}`,
			props: {},
			telemetry: {},
			isExact: true,
		};
		timeline2.record({ id: `e-chain-${d}`, title: `Chain Entry ${d}`, time: 1 + d, snapshot: nextSnap });
		timeline2.record({ id: `e-chain-later-${d}`, title: `Chain Later ${d}`, time: 1 + d + 0.5 });
		prevSnap = nextSnap;
	}

	expect(timeline2.getBranchCount()).toBe(13);
	const rows2 = container2.querySelectorAll(".bk-snapshot-row");
	expect(rows2.length).toBeGreaterThan(0);

	// Lineage preserved and bounded
	const gutterVar2 = (container2.querySelector<HTMLElement>(".bk-timeline-graph-rows")!).style.getPropertyValue("--snapshot-gutter");
	const gutterPx2 = parseInt(gutterVar2.replace("px", ""), 10);
	expect(parseInt(container2.querySelector<HTMLElement>(".bk-timeline-graph-rows")!.style.minWidth, 10)).toBeGreaterThanOrEqual(gutterPx2 + 96);

	timeline2.dispose();
});

test("continuing the latest saved node preserves unrecorded future on its original branch", () => {
	const doc = new JSDOM("<div></div>").window.document;
	const container = doc.querySelector("div")!;

	const timeline = createMeasurementTimeline(container, {
		schema: { speed: { label: "Speed", unit: "m/s" } },
		onRestoreSnapshot: () => true,
	});
	timeline.setCapability(true);
	timeline.start(0, { speed: 0 });

	const headSnap = {
		id: "snap-head",
		time: 3,
		timestamp: 3000,
		label: "Saved Head",
		props: {},
		telemetry: { speed: 15 },
		isExact: true,
	};
	timeline.record({ id: "e-head", title: "Saved Head", time: 3, snapshot: headSnap });

	// Live progress occurred after head snapshot (unrecorded live update at t=8)
	timeline.update(8, { speed: 25 }, true);

	// Restore head snapshot
	timeline.restoreSnapshot(headSnap);

	// Continue from head snapshot
	const resultBranchId = timeline.branchOnContinuation("Continue Work");

	expect(resultBranchId).toBe("branch-1");
	expect(timeline.getActiveBranchId()).toBe("branch-1");
	expect(timeline.getBranchCount()).toBe(2);
	const branches = timeline.getBranches();
	expect(branches.find(b => b.id === "main")!.presentPoint?.time).toBe(8);
	expect(branches.find(b => b.id === "branch-1")!.presentPoint?.time).toBe(3);

	timeline.dispose();
});



test("branch delete confirmation can be cancelled without deleting history", () => {
 const doc = new JSDOM('<div></div>').window.document;
 const container = doc.querySelector('div')!;
 const snapshot = (id: string, time: number) => ({id,time,timestamp:time,label:id,props:{},telemetry:{},isExact:true});
 const timeline = createMeasurementTimeline(container,{schema:{},onRestoreSnapshot:()=>true});
 timeline.start(0,{},snapshot('root',0));
 timeline.record({id:'one',title:'One',time:1,snapshot:snapshot('one',1)});
 timeline.record({id:'two',title:'Two',time:2,snapshot:snapshot('two',2)});
 (container.querySelector('[data-id="one"]') as HTMLButtonElement).click();
 timeline.branchOnContinuation('Alternative');
 (container.querySelector('[data-id="fork-branch-1"]') as HTMLButtonElement).click();
 const button = container.querySelector('[data-action="delete"]') as HTMLButtonElement;
 button.click();
 expect(button.textContent).toBe('Confirm delete');
 const cancel = [...container.querySelectorAll('button')].find(n=>n.textContent==='Cancel')!;
 cancel.click();
 expect(timeline.getBranchCount()).toBe(2);
 expect(button.textContent).toBe('Delete branch');
 expect(doc.activeElement).toBe(button);
 timeline.dispose();
});

test("inspecting an ancestor keeps the connected head at the preserved future", () => {
 const doc = new JSDOM('<div></div>').window.document;
 const container = doc.querySelector('div')!;
 const snapshot = (id: string, time: number) => ({id,time,timestamp:time,label:id,props:{},telemetry:{},isExact:true});
 const timeline = createMeasurementTimeline(container,{schema:{},onRestoreSnapshot:()=>true});
 timeline.start(0,{},snapshot('start',0));
 timeline.record({id:'older',title:'Older',time:2,snapshot:snapshot('older',2)});
 timeline.update(8,{},false,snapshot('future',8));
 (container.querySelector('[data-id="older"]') as HTMLButtonElement).click();
 expect(container.querySelector('.bk-timeline-live-head .bk-timeline-time')?.textContent).toBe('8 s');
 expect(container.querySelector('.bk-timeline-node-details .bk-timeline-details-time')?.textContent).toBe('2 s');
 timeline.dispose();
});


test("main rail and surviving branch lanes stay fixed when a sibling branch is deleted", async () => {
 const doc = new JSDOM("<div></div>").window.document;
 const container = doc.querySelector("div")!;
 const timeline = createMeasurementTimeline(container, { schema: {}, onRestoreSnapshot: () => true });
 timeline.setCapability(true);
 const snap = { id: "base", time: 1, timestamp: 1000, label: "Base", props: {}, telemetry: {}, isExact: true };
 timeline.start(0, {});
 timeline.record({ id: "base-entry", title: "Base", time: 1, snapshot: snap });
 timeline.record({ id: "later", title: "Later", time: 10, snapshot: { ...snap, id: "later", time: 10 } });
 const mainLeft = container.querySelector<HTMLElement>('[data-id="base-entry"] .bk-snapshot-dot')!.style.left;
 for (let i = 1; i <= 2; i++) {
  await timeline.switchBranch("main");
  timeline.restoreSnapshot(snap);
  timeline.branchOnContinuation(`Alternative ${i}`);
  timeline.record({ id: `child-${i}`, title: `Child ${i}`, time: 2, snapshot: { ...snap, id: `child-${i}`, time: 2 } });
 }
 const lane = container.querySelector<HTMLElement>('[data-id="child-2"]')!.dataset.lane;
 expect(await timeline.deleteBranch("branch-1")).toBe(true);
 expect(timeline.getBranchCount()).toBe(2);
 expect(container.querySelector<HTMLElement>('[data-id="child-2"]')!.dataset.lane).toBe(lane);
 expect(container.querySelector<HTMLElement>('[data-id="base-entry"] .bk-snapshot-dot')!.style.left).toBe(mainLeft);
 expect(container.querySelector<HTMLElement>('[data-id="base-entry"]')!.dataset.lane).toBe("0");
 timeline.dispose();
});

test("branch menu supports keyboard navigation, rename, Escape and outside dismissal", async () => {
 const doc = new JSDOM("<div></div>").window.document;
 const container = doc.querySelector("div")!;
 const timeline = createMeasurementTimeline(container, { schema: {}, onCompareBranch: () => {} });
 timeline.start(0, {});
 timeline.record({ id: "saved", title: "Saved moment", time: 1 });
 const openMenu = () => {
  const row = container.querySelector<HTMLElement>('[data-id="saved"]')!;
  row.dispatchEvent(new doc.defaultView!.KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true }));
  return { row, menu: container.querySelector<HTMLElement>(".bk-timeline-menu")! };
 };
 const first = openMenu();
 expect(first.menu.getAttribute("role")).toBe("menu");
 expect(doc.activeElement?.textContent).toBe("Rename branch");
 first.menu.dispatchEvent(new doc.defaultView!.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
 expect(doc.activeElement?.textContent).toBe("Compare in plots");
 first.menu.dispatchEvent(new doc.defaultView!.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
 expect(container.querySelector(".bk-timeline-menu")).toBeNull();
 expect(doc.activeElement).toBe(first.row);
 const second = openMenu();
 second.menu.querySelector<HTMLButtonElement>("button")!.click();
 expect(second.menu.getAttribute("role")).toBe("dialog");
 const input = second.menu.querySelector<HTMLInputElement>('input[aria-label="Branch name"]')!;
 input.value = "Original experiment";
 second.menu.querySelector("form")!.dispatchEvent(new doc.defaultView!.Event("submit", { bubbles: true, cancelable: true }));
 expect(timeline.getBranches()[0].name).toBe("Original experiment");
 expect(container.querySelector(".bk-timeline-menu")).toBeNull();
 openMenu();
 doc.body.dispatchEvent(new doc.defaultView!.MouseEvent("pointerdown", { bubbles: true }));
 expect(container.querySelector(".bk-timeline-menu")).toBeNull();
 timeline.dispose();
});
