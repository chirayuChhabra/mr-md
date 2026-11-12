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
	const button = container.querySelector(
		'[aria-label="Fast, 3 s"]',
	) as HTMLButtonElement;
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
	expect(
		container
			.querySelectorAll(".bk-snapshot-row")[1]
			?.getAttribute("aria-label"),
	).toContain("Fast");
	expect(
		container
			.querySelectorAll(".bk-snapshot-row")[0]
			?.getAttribute("aria-label"),
	).toContain("Earlier");
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

	raceTimeline.update(3, {}, false, {
		...snapFast,
		id: "preserved-future",
		time: 3,
	});
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
	expect(container.querySelector(".bk-timeline-status")?.textContent).toContain(
		"2 s",
	);
	expect(
		container.querySelector('[data-kind="present"] .bk-timeline-time')
			?.textContent,
	).toBe("3 s");

	timeline.dispose();
	raceTimeline.dispose();
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
		'.bk-snapshot-row[data-key="speed"]',
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

	const liveHead = container.querySelector<HTMLElement>(
		".bk-timeline-live-head",
	)!;
	const rows = Array.from(
		container.querySelectorAll<HTMLButtonElement>(".bk-snapshot-row"),
	);
	expect(liveHead).not.toBeNull();
	expect(rows).toHaveLength(4); // e3, e2, e1, start

	// Focus liveHead and press ArrowDown -> first row (e3)
	liveHead.focus();
	liveHead.dispatchEvent(
		new doc.defaultView!.KeyboardEvent("keydown", {
			key: "ArrowDown",
			bubbles: true,
		}),
	);
	expect(doc.activeElement).toBe(rows[0]);

	// From row 0, press ArrowDown -> row 1 (e2)
	rows[0].dispatchEvent(
		new doc.defaultView!.KeyboardEvent("keydown", {
			key: "ArrowDown",
			bubbles: true,
		}),
	);
	expect(doc.activeElement).toBe(rows[1]);

	// From row 1, press End -> last row (rows[3], start)
	rows[1].dispatchEvent(
		new doc.defaultView!.KeyboardEvent("keydown", {
			key: "End",
			bubbles: true,
		}),
	);
	expect(doc.activeElement).toBe(rows[3]);

	// From last row, press ArrowUp -> row 2 (e1)
	rows[3].dispatchEvent(
		new doc.defaultView!.KeyboardEvent("keydown", {
			key: "ArrowUp",
			bubbles: true,
		}),
	);
	expect(doc.activeElement).toBe(rows[2]);

	// From row 2, press Home -> liveHead
	rows[2].dispatchEvent(
		new doc.defaultView!.KeyboardEvent("keydown", {
			key: "Home",
			bubbles: true,
		}),
	);
	expect(doc.activeElement).toBe(liveHead);

	timeline.dispose();
});

test("inspecting an ancestor keeps the connected head at the preserved future", () => {
	const doc = new JSDOM("<div></div>").window.document;
	const container = doc.querySelector("div")!;
	const snapshot = (id: string, time: number) => ({
		id,
		time,
		timestamp: time,
		label: id,
		props: {},
		telemetry: {},
		isExact: true,
	});
	const timeline = createMeasurementTimeline(container, {
		schema: {},
		onRestoreSnapshot: () => true,
	});
	timeline.start(0, {}, snapshot("start", 0));
	timeline.record({
		id: "older",
		title: "Older",
		time: 2,
		snapshot: snapshot("older", 2),
	});
	timeline.update(8, {}, false, snapshot("future", 8));
	(container.querySelector('[data-id="older"]') as HTMLButtonElement).click();
	expect(
		container.querySelector(".bk-timeline-live-head .bk-timeline-time")
			?.textContent,
	).toBe("8 s");
	expect(
		container.querySelector(
			".bk-timeline-node-details .bk-timeline-details-time",
		)?.textContent,
	).toBe("2 s");
	timeline.dispose();
});

const snapshot = (id: string, time: number) => ({
	id,
	time,
	timestamp: time * 1000,
	label: id,
	props: { mass: time + 1 },
	telemetry: { speed: time * 2 },
	state: { position: time * 3 },
	isExact: true,
});

function linearTimeline(
	onRestoreSnapshot: (
		value: ReturnType<typeof snapshot>,
	) => boolean | Promise<boolean> = () => true,
) {
	const doc = new JSDOM("<figure><div></div></figure>").window.document;
	const container = doc.querySelector("div")!;
	const timeline = createMeasurementTimeline(container, {
		schema: { speed: { label: "Speed", unit: "m/s" } },
		onRestoreSnapshot,
	});
	timeline.setCapability(true);
	timeline.start(0, { speed: 0 }, snapshot("initial", 0));
	for (const time of [2, 4])
		timeline.record({
			id: `saved-${time}`,
			title: `Saved ${time}`,
			time,
			snapshot: snapshot(`snapshot-${time}`, time),
		});
	timeline.update(6, { speed: 12 }, true, snapshot("present", 6));
	return { doc, container, timeline };
}

test("linear continuation resumes the selected state and preserves every saved capture", () => {
	const restored: ReturnType<typeof snapshot>[] = [];
	const { timeline, container } = linearTimeline((value) => {
		restored.push(value);
		return true;
	});
	expect(timeline.restoreSnapshot(snapshot("snapshot-2", 2))).toBe(true);
	expect(restored[0]).toEqual(snapshot("snapshot-2", 2));
	expect(timeline.isAtPast()).toBe(true);
	timeline.update(2.1, { speed: 999 }, true);
	timeline.record({ id: "passive", title: "Passive tick", time: 2.1 });
	expect(timeline.getBranches()[0].presentPoint?.time).toBe(6);
	expect(timeline.getBranches()[0].entries.map((entry) => entry.id)).toEqual([
		"saved-2",
		"saved-4",
	]);
	expect(timeline.branchOnContinuation("Resumed")).toBe("main");
	expect(timeline.isAtPast()).toBe(false);
	expect(timeline.getBranches()).toHaveLength(1);
	expect(timeline.getBranches()[0].presentPoint).toMatchObject({
		time: 2,
		values: { speed: 4 },
		playing: false,
	});
	timeline.record({
		id: "continued",
		title: "Changed mass",
		time: 2.1,
		kind: "control",
	});
	expect(timeline.getBranches()[0].entries.map((entry) => entry.id)).toEqual([
		"saved-2",
		"saved-4",
		"continued",
	]);
	expect(container.querySelectorAll("[data-fork]")).toHaveLength(0);
	expect(container.querySelector(".bk-timeline-delete-btn")).toBeNull();
	timeline.dispose();
});

test("restoring a saved moment waits for acknowledgement before changing inspection state", async () => {
	let acknowledge!: (value: boolean) => void;
	const { timeline, container } = linearTimeline(
		() =>
			new Promise((resolve) => {
				acknowledge = resolve;
			}),
	);
	const pending = timeline.restoreSnapshot(snapshot("snapshot-2", 2));
	expect(timeline.isAtPast()).toBe(false);
	expect(timeline.getBranches()[0].presentPoint?.time).toBe(6);
	acknowledge(true);
	expect(await pending).toBe(true);
	expect(timeline.isAtPast()).toBe(true);
	expect(
		container.querySelector(".bk-timeline-past-hint")?.textContent,
	).toContain("Continue from this moment");
	timeline.branchOnContinuation();
	expect(timeline.getBranches()).toHaveLength(1);
	expect(timeline.getBranches()[0].presentPoint?.time).toBe(2);
	timeline.dispose();
});

test("Back to live restores the preserved present without changing saved history", async () => {
	const restored: string[] = [];
	const { timeline, container } = linearTimeline((value) => {
		restored.push(value.id);
		return true;
	});
	timeline.restoreSnapshot(snapshot("snapshot-2", 2));
	container
		.querySelector<HTMLButtonElement>(".bk-timeline-return-btn")!
		.click();
	await Promise.resolve();
	expect(restored).toEqual(["snapshot-2", "present"]);
	expect(timeline.isAtPast()).toBe(false);
	expect(timeline.getBranches()[0].presentPoint?.time).toBe(6);
	expect(timeline.getBranches()[0].entries).toHaveLength(2);
	timeline.dispose();
});

test("Resume and reset publish inspection lifecycle events without branch management UI", () => {
	const { timeline, container, doc } = linearTimeline();
	const events: Array<{ viewing: boolean; time?: number }> = [];
	doc
		.querySelector("figure")!
		.addEventListener("bk:snapshot-view-change", (event) =>
			events.push((event as CustomEvent).detail),
		);
	container.querySelector<HTMLButtonElement>('[data-id="saved-2"]')!.click();
	expect(
		container.querySelector<HTMLElement>(".bk-timeline-node-details")!.hidden,
	).toBe(false);
	expect(
		container.querySelector(".bk-timeline-details-title")?.textContent,
	).toBe("Saved 2");
	expect(
		container.querySelector(".bk-timeline-details-desc")?.textContent,
	).toContain("Speed: 4 m/s");
	const resume = container.querySelector<HTMLButtonElement>(
		".bk-timeline-continue-btn",
	)!;
	expect(resume.textContent).toBe("Resume");
	resume.click();
	expect(events).toEqual([
		{ viewing: true, time: 2 },
		{ viewing: false, time: 2 },
	]);
	expect(timeline.getBranches()).toHaveLength(1);
	expect(container.querySelector(".bk-timeline-menu")).toBeNull();
	timeline.reset();
	expect(events.at(-1)).toEqual({ viewing: false });
	expect(container.querySelectorAll(".bk-snapshot-row")).toHaveLength(0);
	timeline.dispose();
});

test("captures retain recording order across equal timestamps and rewinds on one rail", () => {
	const { timeline, container } = linearTimeline();
	timeline.restoreSnapshot(snapshot("snapshot-2", 2));
	timeline.branchOnContinuation();
	for (const id of ["a", "b"]) timeline.record({ id, title: id, time: 2 });
	const rows = [...container.querySelectorAll<HTMLElement>(".bk-snapshot-row")];
	expect(rows.map((row) => row.dataset.id)).toEqual([
		"b",
		"a",
		"saved-4",
		"saved-2",
		"start",
	]);
	expect(new Set(rows.map((row) => row.dataset.lane))).toEqual(new Set(["0"]));
	expect(
		container.querySelector('[data-node-role="head"] .bk-snapshot-title')
			?.textContent,
	).toBe("b");
	timeline.dispose();
});

test("long capture histories keep a fixed rail and focused nodes during live telemetry updates", () => {
	const { timeline, container, doc } = linearTimeline();
	const initialGutter = container
		.querySelector<HTMLElement>(".bk-timeline-graph-rows")!
		.style.getPropertyValue("--snapshot-gutter");
	for (let time = 7; time < 67; time++)
		timeline.record({ id: `capture-${time}`, title: `Capture ${time}`, time });
	const rows = [...container.querySelectorAll<HTMLElement>(".bk-snapshot-row")];
	expect(rows).toHaveLength(63);
	expect(new Set(rows.map((row) => row.dataset.lane))).toEqual(new Set(["0"]));
	expect(
		container
			.querySelector<HTMLElement>(".bk-timeline-graph-rows")!
			.style.getPropertyValue("--snapshot-gutter"),
	).toBe(initialGutter);
	const focused = rows[20];
	focused.focus();
	for (const time of [67, 68, 69]) {
		timeline.update(time, { speed: time }, true);
		expect(doc.activeElement).toBe(focused);
	}
	expect(container.querySelector("select")).toBeNull();
	timeline.dispose();
});

test("renaming a snapshot updates its selected details and rejects empty labels", () => {
	const { timeline, container } = linearTimeline();
	container.querySelector<HTMLButtonElement>('[data-id="saved-2"]')!.click();
	expect(
		timeline.renameSnapshot("snapshot-2", "  Trial with heavier mass  "),
	).toBe(true);
	expect(
		container.querySelector('[data-id="saved-2"]')?.getAttribute("aria-label"),
	).toBe("Trial with heavier mass, 2 s");
	expect(
		container.querySelector(".bk-timeline-details-title")?.textContent,
	).toBe("Trial with heavier mass");
	expect(timeline.renameSnapshot("snapshot-2", "   ")).toBe(false);
	expect(timeline.renameSnapshot("missing", "Missing")).toBe(false);
	expect(timeline.getBranches()[0].entries[0].snapshot?.label).toBe(
		"Trial with heavier mass",
	);
	timeline.dispose();
});

test("continuation waits for the latest restore acknowledgement", async () => {
 const doc = new JSDOM("<div></div>").window.document;
 let acknowledge!: (ok: boolean) => void;
 const snapshot = (id: string, time: number) => ({id,time,timestamp:time,label:id,props:{},telemetry:{},isExact:true});
 const first = snapshot("first", 1);
 const second = snapshot("second", 2);
 const timeline = createMeasurementTimeline(doc.querySelector("div")!, {
  schema:{}, onRestoreSnapshot: state => state.id === "first" ? true : new Promise<boolean>(resolve => {acknowledge=resolve}),
 });
 timeline.start(0, {});
 timeline.restoreSnapshot(first);
 const pending = timeline.restoreSnapshot(second);
 expect(timeline.continueFromSnapshot()).toBeNull();
 expect(timeline.isAtPast()).toBe(true);
 acknowledge(true);
 expect(await pending).toBe(true);
 expect(timeline.continueFromSnapshot()).toBe("main");
 expect(timeline.isAtPast()).toBe(false);
 expect(timeline.getBranches()[0].presentPoint?.time).toBe(2);
 timeline.dispose();
});
