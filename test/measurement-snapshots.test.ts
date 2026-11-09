import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createMeasurementTimeline } from "../src/client/measurement-timeline.js";
import { snapshotRuntimeCode } from "../src/renderer/blocks/snapshot-runtime.js";
import type { SimulationSnapshot, SimulationTelemetry } from "../src/types.js";

function withGlobals<T>(win: any, fn: () => T): T {
	const names = [
		"window",
		"document",
		"HTMLElement",
		"Element",
		"Node",
		"CustomEvent",
		"MutationObserver",
		"getComputedStyle",
		"requestAnimationFrame",
		"cancelAnimationFrame",
	];
	const previous = new Map(
		names.map((name) => [name, (globalThis as any)[name]]),
	);
	const cleanup = () => {
		for (const [name, value] of previous) {
			if (value === undefined) delete (globalThis as any)[name];
			else (globalThis as any)[name] = value;
		}
	};
	try {
		for (const name of names) {
			if (win && win[name] !== undefined) {
				(globalThis as any)[name] = win[name];
			}
		}
		const result = fn();
		if (result && typeof (result as any).then === "function") {
			return (result as any).then(
				(val: any) => {
					cleanup();
					return val;
				},
				(err: any) => {
					cleanup();
					throw err;
				},
			) as T;
		}
		cleanup();
		return result;
	} catch (err) {
		cleanup();
		throw err;
	}
}

test("iframe snapshot runtime handles registration, capabilities query, capture, and restore", () => {
	const dom = new JSDOM(
		`<!DOCTYPE html><html><body><canvas id="c"></canvas></body></html>`,
	);
	const { window } = dom;

	// Mock parent
	const parentMessages: any[] = [];
	const mockParent = {
		postMessage: (msg: any) => parentMessages.push(msg),
	};
	Object.defineProperty(window, "parent", {
		value: mockParent,
		configurable: true,
		writable: true,
	});
	(window as any).__simProps = { mass: 1 };
	let renderCalled = false;
	(window as any).__renderFrame = () => {
		renderCalled = true;
	};

	// Execute snapshot runtime code inside iframe environment
	new Function(
		"window",
		"document",
		"var addEventListener = window.addEventListener.bind(window); var CustomEvent = window.CustomEvent; " +
			snapshotRuntimeCode,
	)(window, window.document);

	// Initially, without registration, query capabilities reports unsupported
	window.dispatchEvent(
		new (window as any).MessageEvent("message", {
			source: mockParent,
			data: { type: "bk:snapshot-query-capabilities" },
		}),
	);
	expect(parentMessages.at(-1)).toEqual({
		type: "bk:snapshot-capabilities",
		supported: false,
		capabilities: { exactState: false, customProps: true },
		reason:
			"Simulation has not opted in to exact state snapshots via window.bkRegisterSnapshot",
	});

	// Attempt capture when unsupported
	window.dispatchEvent(
		new (window as any).MessageEvent("message", {
			source: mockParent,
			data: { type: "bk:snapshot-capture", id: "req-1" },
		}),
	);
	expect(parentMessages.at(-1).success).toBe(false);
	expect(parentMessages.at(-1).isExact).toBe(false);

	// Simulation opts in via window.bkRegisterSnapshot
	let simState = { x: 42, v: 3.14 };
	let restoredWith: any = null;
	(window as any).bkRegisterSnapshot({
		capture: () => ({ ...simState }),
		restore: (state: any, props: any) => {
			restoredWith = { state, props };
			simState = { ...state };
		},
	});

	// Capability broadcast sent on registration
	expect(parentMessages.at(-1)).toEqual({
		type: "bk:snapshot-capabilities",
		supported: true,
		capabilities: { exactState: true, customProps: true },
	});

	// Query capabilities now reports supported
	window.dispatchEvent(
		new (window as any).MessageEvent("message", {
			source: mockParent,
			data: { type: "bk:snapshot-query-capabilities" },
		}),
	);
	expect(parentMessages.at(-1).supported).toBe(true);
	expect(parentMessages.at(-1).capabilities.exactState).toBe(true);

	// Capture exact snapshot
	window.dispatchEvent(
		new (window as any).MessageEvent("message", {
			source: mockParent,
			data: { type: "bk:snapshot-capture", id: "req-2" },
		}),
	);
	const captureResponse = parentMessages.at(-1);
	expect(captureResponse.type).toBe("bk:snapshot-data");
	expect(captureResponse.id).toBe("req-2");
	expect(captureResponse.success).toBe(true);
	expect(captureResponse.isExact).toBe(true);
	expect(captureResponse.state).toEqual({ x: 42, v: 3.14 });
	expect(captureResponse.props).toEqual({ mass: 1 });

	// Restore exact snapshot
	(window as any).__simProps.futureOnly = 7;
	const snapshotToRestore: SimulationSnapshot = {
		id: "snap-restore-1",
		time: 1.5,
		timestamp: Date.now(),
		label: "Restored State",
		props: { mass: 2 },
		telemetry: { speed: 3.14 },
		state: { x: 100, v: 0 },
		isExact: true,
	};
	window.dispatchEvent(
		new (window as any).MessageEvent("message", {
			source: mockParent,
			data: {
				type: "bk:snapshot-restore",
				id: "req-3",
				snapshot: snapshotToRestore,
				resumePlayback: false,
			},
		}),
	);

	const restoreResponse = parentMessages.at(-1);
	expect(restoreResponse.type).toBe("bk:snapshot-restored");
	expect(restoreResponse.id).toBe("req-3");
	expect(restoreResponse.success).toBe(true);
	expect(restoredWith.state).toEqual({ x: 100, v: 0 });
	expect(restoredWith.props).toEqual({ mass: 2 });
	expect(simState).toEqual({ x: 100, v: 0 });
	expect((window as any).__simProps).toEqual({ mass: 2 });
	expect(renderCalled).toBe(true);
});

test("security boundary: ignores messages from untrusted source or origin", () => {
	const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
	const { window } = dom;
	const parentMessages: any[] = [];
	const mockParent = {
		postMessage: (msg: any) => parentMessages.push(msg),
	};
	Object.defineProperty(window, "parent", {
		value: mockParent,
		configurable: true,
		writable: true,
	});
	new Function(
		"window",
		"document",
		"var addEventListener = window.addEventListener.bind(window); var CustomEvent = window.CustomEvent; " +
			snapshotRuntimeCode,
	)(window, window.document);

	// Message from untrusted window (not window.parent) must be ignored
	const untrustedWindow = {} as any;
	window.dispatchEvent(
		new (window as any).MessageEvent("message", {
			source: untrustedWindow,
			data: { type: "bk:snapshot-query-capabilities" },
		}),
	);
	expect(parentMessages).toHaveLength(0);
});

test("timeline nodes show newest snapshots first", () => {
	const doc = new JSDOM("<div></div>").window.document;
	const container = doc.querySelector("div")!;
	const schema: SimulationTelemetry = {
		position: { label: "Position", unit: "m" },
	};
	const timeline = createMeasurementTimeline(container, { schema });

	timeline.start(0, { position: 0 });
	timeline.record({ title: "Event t=1", time: 1 });
	timeline.record({ title: "Event t=2", time: 2 });
	timeline.record({ title: "Event t=3", time: 3 });
	timeline.update(5, { position: 50 }, true);

	// Check DOM elements order
	const children = Array.from(container.children) as HTMLElement[];
	const presentIdx = children.findIndex((el) => el.dataset.kind === "present");
	const eventsIdx = children.findIndex((el) =>
		el.classList.contains("bk-timeline-events"),
	);
	const startIdx = children.findIndex((el) => el.dataset.kind === "start");

	// Present must be at the top, events in the middle, start at the bottom!
	expect(presentIdx).toBeLessThan(eventsIdx);
	expect(eventsIdx).toBeLessThan(startIdx);

	// Inside events: newest at top (t=3), then t=2, then t=1
	const eventItems = Array.from(
		container.querySelectorAll('.bk-snapshot-row:not([data-id="start"])'),
	);
	expect(eventItems).toHaveLength(3);
	expect(eventItems[0].getAttribute("aria-label")).toContain("Event t=3");
	expect(eventItems[1].getAttribute("aria-label")).toContain("Event t=2");
	expect(eventItems[2].getAttribute("aria-label")).toContain("Event t=1");

	timeline.dispose();
});

test("branch continuation preserves original future history and allows switching", () => {
	const doc = new JSDOM("<div></div>").window.document;
	const container = doc.querySelector("div")!;
	let restoredCount = 0;

	const timeline = createMeasurementTimeline(container, {
		schema: { v: { label: "Velocity", unit: "m/s" } },
		onRestoreSnapshot: () => {
			restoredCount++;
			return true;
		},
	});

	timeline.setCapability(true);
	timeline.start(0, { v: 0 });

	const snapAt1 = {
		id: "snap-1",
		time: 1,
		timestamp: 1000,
		label: "T1",
		props: {},
		telemetry: { v: 10 },
		state: { step: 1 },
		isExact: true,
	};
	const snapAt3 = {
		id: "snap-3",
		time: 3,
		timestamp: 3000,
		label: "T3",
		props: {},
		telemetry: { v: 30 },
		state: { step: 3 },
		isExact: true,
	};

	timeline.record({ title: "Checkpoint 1", time: 1, snapshot: snapAt1 });
	timeline.record({ title: "Checkpoint 3", time: 3, snapshot: snapAt3 });
	timeline.update(4, { v: 40 }, true);

	// User clicks Checkpoint 1 (rewind to t=1)
	timeline.restoreSnapshot(snapAt1);
	expect(restoredCount).toBe(1);
	expect(timeline.isAtPast()).toBe(true);

	// Continuation: user clicks explicit subtle Continue button (or triggers continuation)
	const continueBtn = container.querySelector<HTMLButtonElement>(
		".bk-timeline-continue-btn",
	);
	if (continueBtn) {
		continueBtn.click();
	} else {
		timeline.branchOnContinuation("Alternate choice in branch");
	}

	// Continuation: user modifies control or resumes simulation at t=1.2
	timeline.record({
		title: "Alternate choice in branch",
		time: 1.2,
		kind: "control",
	});

	// Verify branching occurred
	expect(timeline.getBranches()).toHaveLength(2);
	expect(timeline.getActiveBranchId()).toBe("branch-1");

	// Main branch must still preserve Checkpoint 3 (original future preserved!)
	const mainBranch = timeline.getBranches().find((b) => b.id === "main")!;
	expect(mainBranch.entries.map((e) => e.title)).toContain("Checkpoint 3");

	// Branch 1 has Checkpoint 1 and Alternate choice, but not Checkpoint 3
	const branch1 = timeline.getBranches().find((b) => b.id === "branch-1")!;
	expect(branch1.entries.map((e) => e.title)).toContain("Checkpoint 1");
	expect(branch1.entries.map((e) => e.title)).toContain(
		"Alternate choice in branch",
	);
	expect(branch1.entries.map((e) => e.title)).not.toContain("Checkpoint 3");

	// User switches back to main branch
	timeline.switchBranch("main");
	expect(timeline.getActiveBranchId()).toBe("main");
	expect(container.querySelector('[aria-label*="Checkpoint 3"]')).not.toBeNull();

	timeline.dispose();
});

test("explicit snapshot viewing state: suppresses centered pause overlay, displays subtle stage cue, scene remains interactive", () => {
	const dom = new JSDOM(
		`<!DOCTYPE html><html><body>
		<figure class="bk-object bk-object--maximized" id="test-lab">
			<div class="bk-sim-workspace">
				<div class="bk-sim-stage">
					<div class="bk-sim-preview">
						<iframe></iframe>
					</div>
				</div>
			</div>
		</figure>
		</body></html>`,
	);
	const { window } = dom;
	const figure = window.document.getElementById("test-lab") as HTMLElement;

	// Import workspace functions in JSDOM context
	const {
		bkSyncLabPauseOverlay,
		syncSnapshotViewingState,
	} = require("../src/client/workspace.js");

	// Initial paused state in maximized view: pause overlay is shown
	figure.dataset.bkPlaybackState = "paused";
	bkSyncLabPauseOverlay(figure);
	const preview = figure.querySelector(".bk-sim-preview")!;
	const overlay = preview.querySelector<HTMLElement>(".bk-sim-pause-overlay")!;
	expect(overlay).not.toBeNull();
	expect(overlay.hidden).toBe(false);

	// Enter snapshot viewing state via syncSnapshotViewingState or event
	syncSnapshotViewingState(figure, true, 3.5);

	// Attributes synced
	expect(figure.dataset.bkSnapshotViewing).toBe("true");
	expect(figure.getAttribute("data-snapshot-viewing")).toBe("true");

	// Centered pause overlay is suppressed while viewing snapshot
	expect(overlay.hidden).toBe(true);

	// Stage cue is created and displays the required message
	const cue = figure.querySelector<HTMLElement>(
		".bk-sim-snapshot-cue, .bk-snapshot-stage-cue",
	);
	expect(cue).not.toBeNull();
	expect(cue?.hidden).toBe(false);
	expect(cue?.textContent).toContain("Paused");
	expect(cue?.querySelector("[data-bk-continue-snapshot]")).toBeNull();

	// A restored snapshot remains available for direct interaction.
	const iframe = figure.querySelector("iframe");
	if (iframe) {
		expect(iframe.style.pointerEvents).toBe("");
		expect(iframe.getAttribute("data-bk-viewing-locked")).toBeNull();
	}

	// Exit snapshot viewing state
	syncSnapshotViewingState(figure, false);
	expect(figure.dataset.bkSnapshotViewing).toBeUndefined();
	expect(figure.getAttribute("data-snapshot-viewing")).toBeNull();
	expect(cue?.hidden).toBe(true);
	if (iframe) {
		expect(iframe.style.pointerEvents).toBe("");
		expect(iframe.getAttribute("data-bk-viewing-locked")).toBeNull();
	}

	// Centered pause overlay is unsuppressed
	expect(overlay.hidden).toBe(false);
});

test("snapshot runtime guards replay frame with __bkRestoring and captures atomic time", () => {
	const dom = new JSDOM(
		`<!DOCTYPE html><html><body><canvas id="c"></canvas></body></html>`,
	);
	const { window } = dom;
	const parentMessages: any[] = [];
	const mockParent = { postMessage: (msg: any) => parentMessages.push(msg) };
	Object.defineProperty(window, "parent", {
		value: mockParent,
		configurable: true,
		writable: true,
	});

	let wasRestoringDuringRestore = false;
	let wasRestoringDuringRender = false;
	let renderCalled = false;

	(window as any).__simProps = { stiffness: 10 };
	(window as any).__renderFrame = () => {
		renderCalled = true;
		wasRestoringDuringRender = Boolean((window as any).__bkRestoring);
	};

	new Function(
		"window",
		"document",
		"var addEventListener = window.addEventListener.bind(window); var CustomEvent = window.CustomEvent; " +
			snapshotRuntimeCode,
	)(window, window.document);

	let state = { x: 0.5, v: -1.2, time: 2.75 };
	(window as any).bkRegisterSnapshot({
		capture: () => ({ ...state }),
		restore: (s: any) => {
			wasRestoringDuringRestore = Boolean((window as any).__bkRestoring);
			state = { ...s };
		},
	});

	// Capture atomic state: response includes exact atomic time from simulation state
	window.dispatchEvent(
		new (window as any).MessageEvent("message", {
			source: mockParent,
			data: { type: "bk:snapshot-capture", id: "cap-atomic" },
		}),
	);
	const captureMsg = parentMessages.find((m) => m.id === "cap-atomic");
	expect(captureMsg).toBeDefined();
	expect(captureMsg.time).toBe(2.75);
	expect(captureMsg.state).toEqual({ x: 0.5, v: -1.2, time: 2.75 });

	// Restore: __bkRestoring is set during restore and render frame, preventing physics advance
	window.dispatchEvent(
		new (window as any).MessageEvent("message", {
			source: mockParent,
			data: {
				type: "bk:snapshot-restore",
				id: "restore-atomic",
				snapshot: {
					id: "snap-at-1",
					time: 1.0,
					state: { x: 0.2, v: 0, time: 1.0 },
					props: { stiffness: 10 },
					telemetry: {},
					isExact: true,
				},
				resumePlayback: false,
			},
		}),
	);

	expect(wasRestoringDuringRestore).toBe(true);
	expect(wasRestoringDuringRender).toBe(true);
	expect(renderCalled).toBe(true);
	expect(Boolean((window as any).__bkRestoring)).toBe(false);

	const restoredMsg = parentMessages.find((m) => m.id === "restore-atomic");
	expect(restoredMsg).toBeDefined();
	expect(restoredMsg.success).toBe(true);
	expect(restoredMsg.time).toBe(1.0);
});

test("spring demo does not advance physics or telemetry during snapshot restore", () => {
	const dom = new JSDOM(
		`<!DOCTYPE html><html><body><canvas id="c" width="1280" height="720"></canvas></body></html>`,
	);
	const { window } = dom;

	let registeredHandlers: any = null;
	(window as any).bkRegisterSnapshot = (h: any) => {
		registeredHandlers = h;
	};

	let publishedTelemetry: any[] = [];
	(window as any).defineSimulation = () => ({
		props: { mass: 1, stiffness: 8, damping: 0.12 },
		deltaTime: () => 0.016,
		publishTelemetry: (t: any) => publishedTelemetry.push(t),
		onReset: () => {},
	});
	(window as any).bkColor = () => "#000";
	(window as any).bkUi = () => "standard";

	let simLoopFn: any = null;
	(window as any).bkSetup = (w: any, h: any, fn: any) => {
		simLoopFn = fn;
	};
	(window as any).bkCanvasPoint = () => ({ x: 700, y: 360 });

	const fs = require("fs");
	const path = require("path");
	const springCode = fs.readFileSync(
		path.join(__dirname, "../playground/measurements-lab/spring.js"),
		"utf-8",
	);

	// Execute spring.js
	new Function("window", "document", springCode)(
		window,
		window.document,
	);

	expect(registeredHandlers).not.toBeNull();

	// Capture initial state
	const captured = registeredHandlers.capture();
	expect(captured.x).toBe(0.65);
	expect(captured.time).toBe(0);

	// Advance physics once normally
	publishedTelemetry = [];
	const mockCtx = {
		fillStyle: "",
		strokeStyle: "",
		lineWidth: 0,
		font: "",
		textAlign: "",
		fillRect: () => {},
		fillText: () => {},
		beginPath: () => {},
		moveTo: () => {},
		lineTo: () => {},
		stroke: () => {},
		fill: () => {},
		roundRect: () => {},
		setLineDash: () => {},
	};
	simLoopFn(mockCtx, 1280, 720);
	expect(publishedTelemetry.length).toBeGreaterThan(0);
	expect(registeredHandlers.capture().time).toBeGreaterThan(0);

	// Now simulate snapshot restore at past time=0.5, x=0.3
	(window as any).__bkRestoring = true;
	registeredHandlers.restore({ x: 0.3, v: -0.1, time: 0.5 });
	publishedTelemetry = [];

	// Call loop frame to re-render restored frame
	simLoopFn(mockCtx, 1280, 720);
	(window as any).__bkRestoring = false;

	// Restored state must be EXACTLY preserved: no time advancement, no physics step, no spurious telemetry
	const afterReplay = registeredHandlers.capture();
	expect(afterReplay.x).toBe(0.3);
	expect(afterReplay.v).toBe(-0.1);
	expect(afterReplay.time).toBe(0.5);
	expect(publishedTelemetry).toHaveLength(0);
});

test("bubbling bk:snapshot-view-change dispatches from timeline and syncs figure attributes and cue", () => {
	const dom = new JSDOM(
		`<!DOCTYPE html><html><body>
		<figure class="bk-object bk-object--maximized" id="timeline-fig">
			<div class="bk-sim-workspace">
				<div class="bk-sim-stage">
					<div class="bk-sim-preview">
						<iframe></iframe>
					</div>
				</div>
				<div class="bk-sim-inspector">
					<div class="bk-measurement-history"></div>
				</div>
			</div>
		</figure>
		</body></html>`,
	);
	const { window } = dom;
	const figure = window.document.getElementById("timeline-fig") as HTMLElement;
	const historyContainer = figure.querySelector<HTMLElement>(".bk-measurement-history")!;

	withGlobals(window, () => {
		// Wire workspace handlers onto document
		const { bkWireWorkspace } = require("../src/client/workspace.js");
		bkWireWorkspace();

		// Dispatch bubbling bk:snapshot-view-change from inner timeline element
		const event = new (window as any).CustomEvent("bk:snapshot-view-change", {
			bubbles: true,
			detail: { viewing: true, time: 4.2 },
		});
		historyContainer.dispatchEvent(event);

		// Figure should receive the bubbling event and sync attributes
		expect(figure.dataset.bkSnapshotViewing).toBe("true");
		expect(figure.getAttribute("data-snapshot-viewing")).toBe("true");

		const cue = figure.querySelector<HTMLElement>(".bk-sim-snapshot-cue");
		expect(cue).not.toBeNull();
		expect(cue?.hidden).toBe(false);
		expect(cue?.textContent).toContain("Paused");
		expect(cue?.querySelector("[data-bk-continue-snapshot]")).toBeNull();

		// End viewing via bubbling event
		historyContainer.dispatchEvent(
			new (window as any).CustomEvent("bk:snapshot-view-change", {
				bubbles: true,
				detail: { viewing: false },
			}),
		);
		expect(figure.dataset.bkSnapshotViewing).toBeUndefined();
		expect(figure.getAttribute("data-snapshot-viewing")).toBeNull();
		expect(cue?.hidden).toBe(true);
	});
});

test("interaction branching: scene interaction or control modification branches ONCE before new telemetry and clears viewing cue", () => {
	const dom = new JSDOM(
		`<!DOCTYPE html><html><body>
		<figure class="bk-object bk-object--maximized" id="branch-test-fig">
			<div class="bk-sim-workspace">
				<div class="bk-sim-stage">
					<div class="bk-sim-preview">
						<iframe></iframe>
					</div>
				</div>
				<div class="bk-sim-inspector">
					<div class="bk-measurement-history"></div>
				</div>
			</div>
		</figure>
		</body></html>`,
	);
	const { window } = dom;

	withGlobals(window, () => {
		const { bkWireWorkspace, syncSnapshotViewingState } = require("../src/client/workspace.js");
		const { handleBranchingInteraction } = require("../src/client/telemetry.js");
		bkWireWorkspace();

		const figure = window.document.getElementById("branch-test-fig") as HTMLElement;
		const historyContainer = figure.querySelector<HTMLElement>(".bk-measurement-history")!;

		const timeline = createMeasurementTimeline(historyContainer, {
			schema: { x: { label: "Position", unit: "m" } },
			onRestoreSnapshot: () => true,
		});
		timeline.setCapability(true);
		timeline.start(0, { x: 0 });

		const snapAt1 = {
			id: "snap-at-1",
			time: 1.0,
			timestamp: 1000,
			label: "T1",
			props: {},
			telemetry: { x: 10 },
			state: { x: 10 },
			isExact: true,
		};
		timeline.record({ title: "Checkpoint 1", time: 1.0, snapshot: snapAt1 });
		timeline.record({ title: "Future Event 3", time: 3.0 });
		timeline.update(4.0, { x: 40 }, true);

		// Restore past snapshot
		timeline.restoreSnapshot(snapAt1);
		syncSnapshotViewingState(figure, true, 1.0);

		expect(timeline.isAtPast()).toBe(true);
		expect(figure.dataset.bkSnapshotViewing).toBe("true");

		const cue = figure.querySelector<HTMLElement>(".bk-sim-snapshot-cue");
		expect(cue?.hidden).toBe(false);

		// Mock MeasurementRuntime
		const mockRuntime = {
			figure,
			timeline,
			specs: [],
			samples: {},
			latest: {},
		} as any;

		// User interacts with scene or modifies a host control while viewing snapshot
		handleBranchingInteraction(mockRuntime, "Scene interaction");

		// Branches ONCE
		expect(timeline.isAtPast()).toBe(false);
		expect(timeline.getBranches()).toHaveLength(2);
		expect(timeline.getActiveBranchId()).toBe("branch-1");

		// Stage cue is cleared
		expect(figure.dataset.bkSnapshotViewing).toBeUndefined();
		expect(cue?.hidden).toBe(true);

		// Original future remains intact in main branch
		const mainBranch = timeline.getBranches().find((b) => b.id === "main")!;
		expect(mainBranch.entries.map((e) => e.title)).toContain("Future Event 3");

		// Subsequent interaction does NOT create another branch (branches count stays 2)
		handleBranchingInteraction(mockRuntime, "Subsequent interaction");
		expect(timeline.getBranches()).toHaveLength(2);
		expect(timeline.getActiveBranchId()).toBe("branch-1");

		timeline.dispose();
	});
});

test("view update bottleneck fix: scheduleViewUpdate coalesces via rAF and pendingSnapshotRequests are bounded", () => {
	const { addPendingSnapshotRequest, scheduleViewUpdate } = require("../src/client/telemetry.js");

	// 1. Verify pendingSnapshotRequests bounds to max 25
	const mockRuntime = {
		pendingSnapshotRequests: new Map(),
	} as any;

	for (let i = 0; i < 30; i++) {
		addPendingSnapshotRequest(mockRuntime, `req-${i}`, () => {});
	}

	expect(mockRuntime.pendingSnapshotRequests.size).toBe(25);
	expect(mockRuntime.pendingSnapshotRequests.has("req-0")).toBe(false);
	expect(mockRuntime.pendingSnapshotRequests.has("req-4")).toBe(false);
	expect(mockRuntime.pendingSnapshotRequests.has("req-5")).toBe(true);
	expect(mockRuntime.pendingSnapshotRequests.has("req-29")).toBe(true);

	// 2. Verify scheduleViewUpdate animation frame coalescing
	let rafCallback: (() => void) | null = null;
	let rafCallCount = 0;
	const origRaf = (globalThis as any).requestAnimationFrame;
	(globalThis as any).requestAnimationFrame = (cb: () => void) => {
		rafCallCount++;
		rafCallback = cb;
		return 1234;
	};

	try {
		const dom = new JSDOM(`<!DOCTYPE html><html><body><figure id="f" data-bk-playback-state="playing"></figure></body></html>`);
		let flushCount = 0;
		const r = {
			figure: dom.window.document.getElementById("f")!,
			viewRafId: null,
			timers: new Set(),
			timeline: { update: () => flushCount++, isAtPast: () => false },
			graphs: { update: () => {} },
			specs: [],
			values: {},
			time: 1.0,
			unreadValues: new Set(),
			unreadEvents: 0,
			preferences: { visible: [] },
		} as any;

		// Call scheduleViewUpdate 5 times synchronously
		scheduleViewUpdate(r);
		scheduleViewUpdate(r);
		scheduleViewUpdate(r);
		scheduleViewUpdate(r);
		scheduleViewUpdate(r);

		// Must have scheduled only 1 rAF!
		expect(rafCallCount).toBe(1);
		expect(r.viewRafId).toBe(1234);

		// Execute frame
		if (rafCallback) (rafCallback as () => void)();
		expect(r.viewRafId).toBeNull();
		expect(flushCount).toBe(1);

		// Next call schedules a new frame
		scheduleViewUpdate(r);
		expect(rafCallCount).toBe(2);
	} finally {
		if (origRaf !== undefined) {
			(globalThis as any).requestAnimationFrame = origRaf;
		} else {
			delete (globalThis as any).requestAnimationFrame;
		}
	}
});




test("snapshot capture returns measurements from the captured simulation frame", () => {
 const dom = new JSDOM("<canvas></canvas>");
 const win = dom.window as any;
 const messages: any[] = [];
 const parent = { postMessage: (message: any) => messages.push(message) };
 Object.defineProperty(win, "parent", { value: parent, configurable: true });
 win.defineSimulation = () => ({ publishTelemetry() {} });
 new Function("window", "document", snapshotRuntimeCode)(win, win.document);
 const sim = win.defineSimulation({});
 win.bkRegisterSnapshot({ capture: () => ({ time: 3, x: 4 }), restore() {} });
 sim.publishTelemetry({ time: 3, displacement: 4 });
 win.dispatchEvent(new win.MessageEvent("message", { source: parent, data: { type: "bk:snapshot-capture", id: "atomic", time: 1 } }));
 const captured = messages.find(message => message.id === "atomic");
 expect(captured.time).toBe(3);
 expect(captured.state.x).toBe(4);
 expect(captured.telemetry).toEqual({ time: 3, displacement: 4 });
 dom.window.close();
});

test("snapshot inspection keeps controls interactive and playback requests a branch", () => {
	const dom = new JSDOM(
		`<!DOCTYPE html><html><body>
		<figure class="bk-object bk-object--maximized" id="immutable-lab">
			<div class="bk-sim-workspace">
				<div class="bk-sim-stage">
					<div class="bk-sim-preview">
						<iframe></iframe>
					</div>
					<div class="bk-steps-controls bk-sim-playback">
						<button type="button" class="bk-steps-btn" data-bk-playback aria-keyshortcuts="Space"><span class="bk-sim-btn-play">Play</span></button>
						<button type="button" class="bk-steps-btn bk-sim-capture-btn" data-bk-capture-snapshot>Capture</button>
					</div>
				</div>
				<aside class="bk-sim-inspector">
					<div class="bk-sim-controls">
						<input type="range" data-bk-control data-bk-control-key="mass" min="1" max="10" value="5">
					</div>
					<div class="bk-measurement-history"></div>
				</aside>
			</div>
		</figure>
		</body></html>`,
	);
	const { window } = dom;

	withGlobals(window, () => {
		const { bkWireWorkspace, syncSnapshotViewingState, bkSetLabPlayback } = require("../src/client/workspace.js");
		bkWireWorkspace();

		const figure = window.document.getElementById("immutable-lab") as HTMLElement;
		const iframe = figure.querySelector("iframe")!;
		const playBtn = figure.querySelector<HTMLButtonElement>("[data-bk-playback]")!;
		const slider = figure.querySelector<HTMLInputElement>("[data-bk-control]")!;

		// Start paused
		figure.dataset.bkPlaybackState = "paused";

		// Enter snapshot viewing state
		syncSnapshotViewingState(figure, true, 2.0);

		expect(iframe.hasAttribute("inert")).toBe(false);
		expect(iframe.style.pointerEvents).toBe("");
		expect(slider.disabled).toBe(false);
		expect(playBtn.disabled).toBe(false);
		let continuations = 0;
		figure.addEventListener("bk:snapshot-continue", () => { continuations++; });
		bkSetLabPlayback(figure, true);
		expect(continuations).toBe(1);
		expect(figure.dataset.bkPlaybackState).toBe("playing");
		const cue = figure.querySelector<HTMLElement>(".bk-sim-snapshot-cue");
		expect(cue?.textContent).toContain("Paused");

		// 5. Exit snapshot viewing (continuation unlocks)
		syncSnapshotViewingState(figure, false);
		expect(iframe.style.pointerEvents).toBe("");
		expect(iframe.getAttribute("data-bk-viewing-locked")).toBeNull();
		expect(slider.disabled).toBe(false);
		expect(slider.getAttribute("data-bk-viewing-disabled")).toBeNull();
		expect(playBtn.disabled).toBe(false);
		expect(playBtn.getAttribute("data-bk-viewing-disabled")).toBeNull();
		expect(cue?.hidden).toBe(true);
	});
});

test("harness capture button: created in controls for timeline sims, disabled when unsupported/inspecting/pending, and captures exact snapshot", async () => {
	const dom = new JSDOM(
		`<!DOCTYPE html><html><body>
		<figure class="bk-object bk-object--maximized" id="capture-lab">
			<div class="bk-sim-workspace">
				<div class="bk-sim-stage">
					<div class="bk-sim-preview">
						<iframe></iframe>
					</div>
					<div class="bk-steps-controls bk-sim-playback">
						<div class="bk-steps-nav">
							<button type="button" class="bk-steps-btn" data-bk-playback aria-keyshortcuts="Space"><span class="bk-sim-btn-play">Play</span></button>
							<button type="button" class="bk-steps-btn" data-bk-reset-simulation></button>
						</div>
					</div>
				</div>
				<aside class="bk-sim-inspector">
					<div class="bk-measurement-history"></div>
				</aside>
			</div>
			<script class="bk-sim-telemetry-schema" type="application/json">{"velocity": {"label": "Velocity", "unit": "m/s"}}</script>
		</figure>
		</body></html>`,
	);
	const { window } = dom;

	withGlobals(window, () => {
		const { bkWireWorkspace } = require("../src/client/workspace.js");
		const { bkWireTelemetry, bkInitTelemetry } = require("../src/client/telemetry.js");
		bkWireWorkspace();
		bkWireTelemetry();
		bkInitTelemetry();

		const figure = window.document.getElementById("capture-lab") as HTMLElement;
		const captureBtn = figure.querySelector<HTMLButtonElement>("[data-bk-capture-snapshot]");

		// Capture button exists in controls
		expect(captureBtn).not.toBeNull();
		// Initially disabled before capabilities query confirms exact snapshot support
		expect(captureBtn?.disabled).toBe(true);

		const iframe = figure.querySelector("iframe")!;
		const messages: any[] = [];
		iframe.contentWindow!.postMessage = (msg: any) => {
			messages.push(msg);
		};

		// Simulation reports exact snapshot capability
		window.dispatchEvent(
			new window.MessageEvent("message", {
				source: iframe.contentWindow,
				data: { type: "bk:snapshot-capabilities", canRestoreExactState: true },
			}),
		);

		// Button is now enabled for capturing
		expect(captureBtn?.disabled).toBe(false);

		// Click capture button
		captureBtn?.click();

		// Verify request message was sent to iframe
		const captureMsg = messages.find((m) => m.type === "bk:snapshot-capture");
		expect(captureMsg).not.toBeUndefined();
		expect(captureBtn?.disabled).toBe(true); // Pending in flight

		// Iframe responds with captured state
		window.dispatchEvent(
			new window.MessageEvent("message", {
				source: iframe.contentWindow,
				data: {
					type: "bk:snapshot-data",
					id: captureMsg.id,
					success: true,
					isExact: true,
					state: { position: 10 },
					telemetry: { velocity: 5 },
					time: 2.0,
				},
			}),
		);

		// In-flight capture completed, button re-enabled
		expect(captureBtn?.disabled).toBe(false);

		// Entering snapshot viewing disables capture button
		figure.dispatchEvent(
			new (window as any).CustomEvent("bk:snapshot-view-change", {
				bubbles: true,
				detail: { viewing: true, time: 2.0 },
			}),
		);
		expect(captureBtn?.disabled).toBe(true);
	});
});

test("startup graph preferences: keep the latest window for each measurement", () => {
	const dom = new JSDOM(
		`<!DOCTYPE html><html><body>
		<figure class="bk-object" id="graph-lab">
			<div class="bk-sim-workspace">
				<div class="bk-sim-stage">
					<div class="bk-embed-frame"><iframe></iframe></div>
				</div>
				<aside class="bk-sim-inspector">
					<div class="bk-measurement-history"></div>
				</aside>
			</div>
			<script class="bk-sim-telemetry-schema" type="application/json">{"height": {"label": "Height", "unit": "m", "graph": true}}</script>
		</figure>
		</body></html>`,
		{ url: "https://example.test/lesson" },
	);
	const { window } = dom;

	// Populate sessionStorage with a top-left minimized overlay AND a legitimate bottom graph panel
	window.sessionStorage.setItem(
		"bk:measurements:/lesson:graph-lab",
		JSON.stringify({
			version: 2,
			graphs: [
				{ key: "height", minimized: true, x: 10, y: 50 },
				{ key: "height", minimized: false, x: 20, y: 350 },
			],
		}),
	);

	withGlobals(window, () => {
		const { bkInitTelemetry } = require("../src/client/telemetry.js");
		bkInitTelemetry();

		// Read back stored preferences in sessionStorage
		const stored = JSON.parse(
			window.sessionStorage.getItem("bk:measurements:/lesson:graph-lab") || "{}",
		);
		// Top-left minimized overlay is filtered out, bottom graph preserved
		expect(stored.graphs).toHaveLength(1);
		expect(stored.graphs[0].y).toBe(350);
		expect(stored.graphs[0].minimized).toBe(false);
	});
});



test("initial snapshot survives late host capability discovery and resets for the next trial", () => {
 const dom = new JSDOM('<canvas></canvas>');
 const w = dom.window as any;
 const messages: any[] = [];
 const parent = { postMessage: (data: any) => messages.push(data) };
 Object.defineProperty(w, 'parent', { value: parent, configurable: true });
 w.__simProps = { damping: 1 };
 w.defineSimulation = () => ({ publishTelemetry() {} });
 new Function('window', 'document', snapshotRuntimeCode)(w, w.document);
 let state = { time: 0, position: 1 };
 w.bkRegisterSnapshot({ capture: () => state, restore: (saved: any) => { state = saved; } });
 const sim = w.defineSimulation({});
 sim.publishTelemetry(state);
 state = { time: 8, position: 4 };
 w.__simProps = { damping: 2 };
 sim.publishTelemetry(state);
 const capture = () => {
  w.dispatchEvent(new w.MessageEvent('message', { source: parent, data: { type: 'bk:snapshot-capture', id: 'initial', initial: true } }));
  return messages.at(-1);
 };
 expect(capture()).toMatchObject({ isExact: true, time: 0, state: { position: 1 }, props: { damping: 1 }, telemetry: { position: 1 } });
 w.dispatchEvent(new w.MessageEvent('message', { source: parent, data: { type: 'bk:reset' } }));
 state = { time: 0, position: 3 };
 sim.publishTelemetry(state);
 expect(capture()).toMatchObject({ time: 0, state: { position: 3 }, props: { damping: 2 } });
 dom.window.close();
});

test("bkResetTelemetry settles pending requests and rejects stale generations so old callbacks never add ghost nodes", async () => {
	const dom = new JSDOM(`
		<figure id="reset-sim" class="bk-object">
			<div class="bk-sim-workspace">
				<div class="bk-sim-stage">
					<div class="bk-embed-frame"><iframe></iframe></div>
					<div class="bk-steps-controls bk-sim-playback">
						<div class="bk-steps-nav">
							<button type="button" class="bk-steps-btn" data-bk-playback><span>Play</span></button>
							<button type="button" class="bk-steps-btn bk-sim-capture-btn" data-bk-capture-snapshot>Capture</button>
							<button type="button" class="bk-steps-btn" data-bk-reset-simulation>Reset</button>
						</div>
					</div>
				</div>
				<div class="bk-sim-inspector"><div class="bk-measurement-history"></div></div>
			</div>
			<script class="bk-sim-telemetry-schema" type="application/json">{"val": {"label": "Val", "unit": ""}}</script>
		</figure>
	`);
	const { window } = dom;
	await withGlobals(window, async () => {
		const { bkWireWorkspace } = require("../src/client/workspace.js");
		const { bkWireTelemetry, bkInitTelemetry, bkResetTelemetry, getMeasurementRuntime, restoreSimulationSnapshot } = require("../src/client/telemetry.ts");
		bkWireWorkspace();
		bkWireTelemetry();
		bkInitTelemetry();

		const figure = window.document.getElementById("reset-sim") as HTMLElement;
		const history = figure.querySelector<HTMLElement>(".bk-measurement-history")!;
		const iframe = figure.querySelector("iframe")!;

		const iframeMessages: any[] = [];
		iframe.contentWindow!.postMessage = (msg: any) => {
			iframeMessages.push(msg);
		};

		// 1. Announce exact snapshot capabilities
		window.dispatchEvent(
			new window.MessageEvent("message", {
				source: iframe.contentWindow,
				data: { type: "bk:snapshot-capabilities", supported: true },
			}),
		);

		const r = getMeasurementRuntime("reset-sim")!;
		expect(r).toBeDefined();

		const snap: SimulationSnapshot = {
			id: "snap-pending",
			time: 1.0,
			timestamp: 1000,
			label: "Snap Pending",
			props: {},
			telemetry: { val: 10 },
			state: { val: 10 },
			isExact: true,
		};

		// Launch in-flight restoreSimulationSnapshot
		const restorePromise = restoreSimulationSnapshot(r, snap);
		expect(r.pendingRestoreRequests.size + r.pendingSnapshotRequests.size).toBeGreaterThan(0);

		// Also launch in-flight manual capture
		const captureBtn = figure.querySelector<HTMLButtonElement>("[data-bk-capture-snapshot]")!;
		captureBtn.click();
		expect(r.inFlightManualCapture).toBe(true);
		expect(captureBtn.disabled).toBe(true);

		const oldCaptureMsg = iframeMessages.find((m) => m.type === "bk:snapshot-capture" && m.id?.startsWith("snap-"));
		const oldCaptureId = oldCaptureMsg?.id;

		// 2. Perform bkResetTelemetry -> MUST settle pending requests immediately
		bkResetTelemetry("reset-sim");

		// Pending restore promise MUST resolve false immediately, not hang!
		const restoreResult = await restorePromise;
		expect(restoreResult).toBe(false);

		// Pending request maps must be settled and cleared
		expect(r.pendingSnapshotRequests.size).toBe(0);
		expect(r.pendingRestoreRequests.size).toBe(0);
		expect(r.inFlightManualCapture).toBe(false);
		expect(captureBtn.disabled).toBe(false);

		// 3. Stale delayed responses arrive from previous trial
		if (oldCaptureId) {
			window.dispatchEvent(
				new window.MessageEvent("message", {
					source: iframe.contentWindow,
					data: {
						type: "bk:snapshot-data",
						id: oldCaptureId,
						success: true,
						isExact: true,
						state: { val: 999 },
						time: 1.0,
					},
				}),
			);
		}

		// Ensure no ghost nodes were added
		expect(history.querySelectorAll(".bk-snapshot-row:not([data-id='start'])")).toHaveLength(0);
	});
});

test("rapid concurrent restores sequence atomically and older in-flight restore does not clobber newer restore", async () => {
	const dom = new JSDOM(`
		<figure id="race-sim" class="bk-object">
			<div class="bk-sim-workspace">
				<div class="bk-sim-stage">
					<div class="bk-embed-frame"><iframe></iframe></div>
					<div class="bk-sim-controls">
						<input type="range" data-bk-prop="pos" min="0" max="100" value="0">
					</div>
				</div>
				<div class="bk-sim-inspector"><div class="bk-measurement-history"></div></div>
			</div>
			<script class="bk-sim-telemetry-schema" type="application/json">{"pos": {"label": "Pos", "unit": "m"}}</script>
		</figure>
	`);
	const { window } = dom;
	await withGlobals(window, async () => {
		const { bkWireWorkspace } = require("../src/client/workspace.js");
		const { bkWireTelemetry, bkInitTelemetry, getMeasurementRuntime, restoreSimulationSnapshot } = require("../src/client/telemetry.ts");
		bkWireWorkspace();
		bkWireTelemetry();
		bkInitTelemetry();

		const figure = window.document.getElementById("race-sim") as HTMLElement;
		const iframe = figure.querySelector("iframe")!;

		const sentRestoreMessages: any[] = [];
		iframe.contentWindow!.postMessage = (msg: any) => {
			if (msg.type === "bk:snapshot-capture") {
				// Immediate preserve response for current state
				window.dispatchEvent(
					new window.MessageEvent("message", {
						source: iframe.contentWindow,
						data: {
							type: "bk:snapshot-data",
							id: msg.id,
							success: true,
							isExact: true,
							state: { pos: 0 },
							time: 0,
							props: { pos: 0 },
							telemetry: { pos: 0 },
						},
					}),
				);
			} else if (msg.type === "bk:snapshot-restore") {
				sentRestoreMessages.push(msg);
			}
		};

		// Simulation announces capability
		window.dispatchEvent(
			new window.MessageEvent("message", {
				source: iframe.contentWindow,
				data: { type: "bk:snapshot-capabilities", supported: true },
			}),
		);

		const r = getMeasurementRuntime("race-sim")!;
		expect(r).toBeDefined();

		const snapA: SimulationSnapshot = {
			id: "snap-A",
			time: 1.0,
			timestamp: 1000,
			label: "Snap A",
			props: { pos: 10 },
			telemetry: { pos: 10 },
			state: { pos: 10 },
			isExact: true,
		};

		const snapB: SimulationSnapshot = {
			id: "snap-B",
			time: 2.0,
			timestamp: 2000,
			label: "Snap B",
			props: { pos: 20 },
			telemetry: { pos: 20 },
			state: { pos: 20 },
			isExact: true,
		};

		// Rapid concurrent restores: restore A launched, then restore B launched immediately
		const pA = restoreSimulationSnapshot(r, snapA);
		const pB = restoreSimulationSnapshot(r, snapB);

		// Allow microtasks to postMessage
		await Promise.resolve();
		await Promise.resolve();

		expect(sentRestoreMessages.length).toBeGreaterThanOrEqual(1);
		const reqB = sentRestoreMessages.find((m) => m.snapshot.id === "snap-B");
		const reqA = sentRestoreMessages.find((m) => m.snapshot.id === "snap-A");

		// Deliver OUT OF ORDER ACKs: deliver B's ACK first, then deliver A's ACK later
		if (reqB) {
			window.dispatchEvent(
				new window.MessageEvent("message", {
					source: iframe.contentWindow,
					data: {
						type: "bk:snapshot-restored",
						id: reqB.id,
						success: true,
						isExact: true,
						time: 2.0,
						props: { pos: 20 },
					},
				}),
			);
		}

		if (reqA) {
			// Older ACK arrives delayed
			window.dispatchEvent(
				new window.MessageEvent("message", {
					source: iframe.contentWindow,
					data: {
						type: "bk:snapshot-restored",
						id: reqA.id,
						success: true,
						isExact: true,
						time: 1.0,
						props: { pos: 10 },
					},
				}),
			);
		}

		const [resA, resB] = await Promise.all([pA, pB]);
		expect(resA).toBe(false); // Older superseded restore resolves false immediately
		expect(resB).toBe(true);  // Newer restore wins and resolves true

		// Newest model, controls, telemetry state (snapB) WINS!
		expect(r.time).toBe(2.0);
		expect(r.values.pos).toBe(20);
		expect((figure as any).__bkCurrentProps?.pos).toBe(20);
		const input = figure.querySelector<HTMLInputElement>("[data-bk-prop='pos']")!;
		expect(input.value).toBe("20");
	});
});

test("custom adapter state with nested objects is deep cloned and mutations do not corrupt historical snapshots", () => {
 const dom = new JSDOM("<canvas></canvas>");
 const w = dom.window as any;
 const messages: any[] = [];
 const parent = { postMessage: (data: any) => messages.push(data) };
 Object.defineProperty(w, "parent", { value: parent, configurable: true });
 new Function("window", "document", snapshotRuntimeCode)(w, w.document);

 let customState = {
  time: 1.0,
  rig: {
   jointAngles: [0.1, 0.2, 0.3],
   metadata: { name: "arm", active: true },
  },
 };

 w.bkRegisterSnapshot({
  capture: () => customState,
  restore: (s: any) => { customState = s; },
 });

 // Request capture
 w.dispatchEvent(new w.MessageEvent("message", {
  source: parent,
  data: { type: "bk:snapshot-capture", id: "deep-test", time: 1.0 },
 }));

 const capMsg = messages.find(m => m.id === "deep-test");
 expect(capMsg).toBeDefined();
 expect(capMsg.state.rig.jointAngles).toEqual([0.1, 0.2, 0.3]);

 // Mutate simulation state after capture
 customState.rig.jointAngles[0] = 999.0;
 customState.rig.metadata.name = "mutated";

 // Captured snapshot must remain pure / uncorrupted!
 expect(capMsg.state.rig.jointAngles[0]).toBe(0.1);
 expect(capMsg.state.rig.metadata.name).toBe("arm");

 dom.window.close();
});

test("cross-branch pending captures are branch-bound and do not append to active branch after switch", async () => {
	const dom = new JSDOM(`
		<figure id="branch-sim" class="bk-object">
			<div class="bk-sim-workspace">
				<div class="bk-sim-stage">
					<div class="bk-embed-frame"><iframe></iframe></div>
					<div class="bk-steps-controls bk-sim-playback">
						<div class="bk-steps-nav">
							<button type="button" class="bk-steps-btn bk-sim-capture-btn" data-bk-capture-snapshot>Capture</button>
						</div>
					</div>
				</div>
				<div class="bk-sim-inspector"><div class="bk-measurement-history"></div></div>
			</div>
			<script class="bk-sim-telemetry-schema" type="application/json">{"speed": {"label": "Speed", "unit": "m/s"}}</script>
		</figure>
	`);
	const { window } = dom;
	await withGlobals(window, async () => {
		const { bkWireWorkspace } = require("../src/client/workspace.js");
		const { bkWireTelemetry, bkInitTelemetry, getMeasurementRuntime } = require("../src/client/telemetry.ts");
		bkWireWorkspace();
		bkWireTelemetry();
		bkInitTelemetry();

		const figure = window.document.getElementById("branch-sim") as HTMLElement;
		const iframe = figure.querySelector("iframe")!;

		let pendingCaptureMsg: any = null;
		iframe.contentWindow!.postMessage = (msg: any) => {
			if (msg.type === "bk:snapshot-capture") {
				if (msg.label === "Present") {
					window.dispatchEvent(
						new window.MessageEvent("message", {
							source: iframe.contentWindow,
							data: {
								type: "bk:snapshot-data",
								id: msg.id,
								success: true,
								isExact: true,
								state: {},
								telemetry: {},
								time: 0,
							},
						}),
					);
				} else {
					pendingCaptureMsg = msg;
				}
			} else if (msg.type === "bk:snapshot-restore") {
				window.dispatchEvent(
					new window.MessageEvent("message", {
						source: iframe.contentWindow,
						data: {
							type: "bk:snapshot-restored",
							id: msg.id,
							success: true,
							isExact: true,
						},
					}),
				);
			}
		};

		// Capabilities
		window.dispatchEvent(
			new window.MessageEvent("message", {
				source: iframe.contentWindow,
				data: { type: "bk:snapshot-capabilities", supported: true },
			}),
		);

		const r = getMeasurementRuntime("branch-sim")!;
		expect(r).toBeDefined();

		// Record initial state on main branch with snap1 and snap2
		const snap1 = { id: "s1", time: 1.0, timestamp: 1000, label: "Main Event 1", props: { speed: 10 }, telemetry: { speed: 10 }, state: {}, isExact: true };
		const snap2 = { id: "s2", time: 2.0, timestamp: 2000, label: "Main Event 2", props: { speed: 20 }, telemetry: { speed: 20 }, state: {}, isExact: true };
		r.timeline!.start(0, { speed: 0 });
		r.timeline!.record({ title: "Main Event 1", time: 1.0, snapshot: snap1 });
		r.timeline!.record({ title: "Main Event 2", time: 2.0, snapshot: snap2 });

		expect(r.timeline!.getActiveBranchId()).toBe("main");

		// Inspect ancestor snap1 and fork to create branch-1
		await r.timeline!.restoreSnapshot(snap1);
		const newBranchId = r.timeline!.branchOnContinuation("Branch choice");
		expect(newBranchId).toBeDefined();
		expect(newBranchId).not.toBe("main");

		// Switch back to Main head
		await r.timeline!.switchBranch("main");
		expect(r.timeline!.getActiveBranchId()).toBe("main");

		// Launch capture on Main branch
		const captureBtn = figure.querySelector<HTMLButtonElement>("[data-bk-capture-snapshot]")!;
		captureBtn.click();
		expect(pendingCaptureMsg).not.toBeNull();
		const captureId = pendingCaptureMsg.id;

		// While capture is in-flight, switch to the other branch!
		await r.timeline!.switchBranch(newBranchId!);
		const currentActiveBranchId = r.timeline!.getActiveBranchId();
		expect(currentActiveBranchId).toBe(newBranchId);

		// Now delayed reply from Main's capture arrives!
		window.dispatchEvent(
			new window.MessageEvent("message", {
				source: iframe.contentWindow,
				data: {
					type: "bk:snapshot-data",
					id: captureId,
					success: true,
					isExact: true,
					state: { speed: 42 },
					telemetry: { speed: 42 },
					time: 1.5,
				},
			}),
		);

		// Assert: Active branch MUST NOT have Main's captured snapshot appended!
		const activeBranch = r.timeline!.getBranches().find((b) => b.id === currentActiveBranchId)!;
		const activeTitles = activeBranch.entries.map((e) => e.title);
		expect(activeTitles).not.toContain("Saved snapshot");

		// And Main branch preserves lineage (or records against originating branch)
		const mainBranch = r.timeline!.getBranches().find((b) => b.id === "main")!;
		const mainTitles = mainBranch.entries.map((e) => e.title);
		expect(mainTitles).toContain("Saved snapshot");
	});
});

test("async adapter capture and restore handlers are rejected cleanly", () => {
	const dom = new JSDOM("<canvas></canvas>");
	const w = dom.window as any;
	const messages: any[] = [];
	const parent = { postMessage: (data: any) => messages.push(data) };
	Object.defineProperty(w, "parent", { value: parent, configurable: true });
	new Function("window", "document", snapshotRuntimeCode)(w, w.document);

	// Register an async capture handler
	w.bkRegisterSnapshot({
		capture: async () => ({ time: 1, pos: 5 }),
		restore: async () => {},
	});

	// Attempt capture with async handler
	w.dispatchEvent(
		new w.MessageEvent("message", {
			source: parent,
			data: { type: "bk:snapshot-capture", id: "async-cap" },
		}),
	);

	const capMsg = messages.find((m) => m.id === "async-cap");
	expect(capMsg).toBeDefined();
	expect(capMsg.success).toBe(false);
	expect(capMsg.isExact).toBe(false);
	expect(capMsg.error).toContain("Async snapshot capture is not supported");

	// Attempt restore with async handler
	messages.length = 0;
	w.dispatchEvent(
		new w.MessageEvent("message", {
			source: parent,
			data: {
				type: "bk:snapshot-restore",
				id: "async-restore",
				snapshot: { id: "s1", time: 1, state: {}, props: {}, telemetry: {}, isExact: true },
			},
		}),
	);

	const restoreMsg = messages.find((m) => m.id === "async-restore");
	expect(restoreMsg).toBeDefined();
	expect(restoreMsg.success).toBe(false);
	expect(restoreMsg.isExact).toBe(false);
	expect(restoreMsg.error).toContain("Async snapshot restore is not supported");
	expect(Boolean(w.__bkRestoring)).toBe(false);

	dom.window.close();
});

test("no-op control events and active presets do not create spurious branch continuations", async () => {
	const dom = new JSDOM(`
		<figure id="noop-sim" class="bk-object bk-object--maximized" data-bk-playback-state="paused">
			<div class="bk-sim-workspace">
				<div class="bk-sim-stage"><div class="bk-embed-frame"><iframe></iframe></div></div>
				<div class="bk-sim-inspector">
					<div class="bk-sim-controls" data-bk-default-props='{"mass":5}'>
						<input type="range" data-bk-prop="mass" min="1" max="10" value="5">
						<button type="button" data-bk-preset="heavy" data-bk-preset-props='{"mass":5}' class="is-active">Heavy</button>
						<button type="button" data-bk-preset="light" data-bk-preset-props='{"mass":2}'>Light</button>
						<button type="button" data-bk-action="disabled-action" disabled>Disabled</button>
					</div>
					<div class="bk-measurement-history"></div>
				</div>
			</div>
			<script class="bk-sim-telemetry-schema" type="application/json">{"mass": {"label": "Mass"}}</script>
		</figure>
	`);
	const { window } = dom;
	await withGlobals(window, async () => {
		const { bkWireWorkspace } = require("../src/client/workspace.js");
		const { bkWireSimControls } = require("../src/client/simulation.js");
		const { bkWireTelemetry, bkInitTelemetry, getMeasurementRuntime } = require("../src/client/telemetry.ts");
		bkWireWorkspace();
		bkWireSimControls();
		bkWireTelemetry();
		bkInitTelemetry();

		const figure = window.document.getElementById("noop-sim") as HTMLElement;
		const slider = figure.querySelector<HTMLInputElement>("[data-bk-prop='mass']")!;
		const heavyPreset = figure.querySelector<HTMLButtonElement>("[data-bk-preset='heavy']")!;
		const lightPreset = figure.querySelector<HTMLButtonElement>("[data-bk-preset='light']")!;
		const disabledAction = figure.querySelector<HTMLButtonElement>("[data-bk-action='disabled-action']")!;
		const iframe = figure.querySelector("iframe")!;

		iframe.contentWindow!.postMessage = (msg: any) => {
			if (msg.type === "bk:snapshot-capture") {
				window.dispatchEvent(
					new window.MessageEvent("message", {
						source: iframe.contentWindow,
						data: {
							type: "bk:snapshot-data",
							id: msg.id,
							success: true,
							isExact: true,
							state: {},
							telemetry: {},
							time: 0,
						},
					}),
				);
			} else if (msg.type === "bk:snapshot-restore") {
				window.dispatchEvent(
					new window.MessageEvent("message", {
						source: iframe.contentWindow,
						data: {
							type: "bk:snapshot-restored",
							id: msg.id,
							success: true,
							isExact: true,
							props: msg.snapshot?.props,
						},
					}),
				);
			}
		};

		// Capabilities
		window.dispatchEvent(
			new window.MessageEvent("message", {
				source: iframe.contentWindow,
				data: { type: "bk:snapshot-capabilities", supported: true },
			}),
		);

		const r = getMeasurementRuntime("noop-sim")!;
		expect(r).toBeDefined();

		// Record initial history with an ancestor (s1) and later descendant (s2)
		const snap1 = { id: "s1", time: 1.0, timestamp: 1000, label: "S1", props: { mass: 5 }, telemetry: { mass: 5 }, state: {}, isExact: true };
		const snap2 = { id: "s2", time: 2.0, timestamp: 2000, label: "S2", props: { mass: 5 }, telemetry: { mass: 5 }, state: {}, isExact: true };
		r.timeline!.start(0, { mass: 5 });
		r.timeline!.record({ title: "S1", time: 1.0, snapshot: snap1 });
		r.timeline!.record({ title: "S2", time: 2.0, snapshot: snap2 });

		// Restore ancestor snapshot s1 (which has later descendant s2)
		await r.timeline!.restoreSnapshot(snap1);
		expect(figure.dataset.bkSnapshotViewing).toBe("true");

		const initialBranches = r.timeline!.getBranches().length;

		// 1. Click on identical preset (mass: 5 vs current mass: 5) -> must NOT fork or exit viewing
		heavyPreset.click();
		expect(figure.dataset.bkSnapshotViewing).toBe("true");
		expect(r.timeline!.getBranches().length).toBe(initialBranches);

		// 2. Click on disabled action -> must NOT fork or exit viewing
		disabledAction.click();
		expect(figure.dataset.bkSnapshotViewing).toBe("true");
		expect(r.timeline!.getBranches().length).toBe(initialBranches);

		// 3. Slider event with IDENTICAL value (mass: 5) -> must NOT fork or exit viewing
		slider.value = "5";
		slider.dispatchEvent(new window.Event("input", { bubbles: true }));
		slider.dispatchEvent(new window.Event("change", { bubbles: true }));
		expect(figure.dataset.bkSnapshotViewing).toBe("true");
		expect(r.timeline!.getBranches().length).toBe(initialBranches);

		// 4. Changed props at ancestor snapshot (mass changed to 2 via light preset) -> FORKS ONCE!
		lightPreset.click();
		expect(figure.dataset.bkSnapshotViewing).toBeUndefined();
		expect(r.timeline!.getBranches().length).toBe(initialBranches + 1);

		// 5. Changed props at head extends without forking
		const branchesAfterFork = r.timeline!.getBranches().length;
		slider.value = "7";
		slider.dispatchEvent(new window.Event("input", { bubbles: true }));
		slider.dispatchEvent(new window.Event("change", { bubbles: true }));
		// Head edit extends; branches count does not increase
		expect(r.timeline!.getBranches().length).toBe(branchesAfterFork);
	});
});

test("preset comparisons preserve types and compare nested JSON props", () => {
 const { arePropsEqual } = require("../src/client/telemetry.ts");
 const current = new Map<string, unknown>([["mass", 1], ["options", { points: [1, 2], enabled: true }]]);
 expect(arePropsEqual(current, { mass: "1" })).toBe(false);
 expect(arePropsEqual(current, { options: { enabled: true, points: [1, 2] } })).toBe(true);
 expect(arePropsEqual(current, { options: { enabled: true, points: [9, 2] } })).toBe(false);
});

test("branch plots preserve each future and restore inherited data without mixing siblings", () => {
 const { graphData, restoreBranchSamples } = require("../src/client/telemetry.js");
 const point = (time: number, y: number) => ({time, x: time, y});
 const r = {
  timeline: { getActiveBranchId: () => "main" },
  specs: [{key: "x", xAxis: {key: "time"}}],
  samples: {x: [point(0, 0), point(1, 10)]}, latest: {x: point(3, 30)},
 } as any;
 restoreBranchSamples(r, "main");
 r.graphSnapshotTime = 1;
 r.latest = {x: point(1, 10)};
 expect(graphData(r).x.map((p: any) => p.y)).toEqual([0, 10]);
 // Continuation inherits only the shared prefix.
 r.samples.x = graphData(r).x;
 r.sampleBranchId = "branch-1";
 delete r.graphSnapshotTime;
 r.latest = {x: point(2, 99)};
 restoreBranchSamples(r, "main");
 expect(graphData({...r, latest: {}}).x.map((p: any) => p.y)).toEqual([0, 10, 30]);
 r.graphSnapshotTime = 1;
 restoreBranchSamples(r, "branch-1");
 delete r.graphSnapshotTime;
 r.latest = {};
 expect(graphData(r).x.map((p: any) => p.y)).toEqual([0, 10, 99]);
 r.samples.x[0].y = -1;
 expect(r.branchSamples.get("main").x[0].y).toBe(0);
});
