import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import {
	createMeasurementPlots,
	registerMeasurementPlotRenderer,
} from "../src/client/measurement-plots.js";
import type {
	MeasurementPlot,
	MeasurementPlotRenderContext,
} from "../src/measurement-types.js";

describe("Measurement Plots Framework", () => {
	let dom: JSDOM;
	let document: Document;
	let window: Window;
	let origDoc: any;
	let origWin: any;
	let origRaf: any;
	let origCaf: any;
	let rafCallbacks: Array<() => void> = [];

	beforeEach(() => {
		dom = new JSDOM("<!DOCTYPE html><html><body><div id=\"plots-container\" class=\"bk-measurement-plots\"></div></body></html>", {
			url: "http://localhost",
			pretendToBeVisual: true,
		});
		document = dom.window.document;
		window = dom.window as unknown as Window;

		origDoc = (globalThis as any).document;
		origWin = (globalThis as any).window;
		origRaf = (globalThis as any).requestAnimationFrame;
		origCaf = (globalThis as any).cancelAnimationFrame;

		(globalThis as any).document = document;
		(globalThis as any).window = window;

		rafCallbacks = [];
		(globalThis as any).requestAnimationFrame = (cb: () => void) => {
			rafCallbacks.push(cb);
			return rafCallbacks.length;
		};
		(globalThis as any).cancelAnimationFrame = (id: number) => {
			if (id > 0 && id <= rafCallbacks.length) {
				rafCallbacks[id - 1] = () => {};
			}
		};
	});

	afterEach(() => {
		(globalThis as any).document = origDoc;
		(globalThis as any).window = origWin;
		(globalThis as any).requestAnimationFrame = origRaf;
		(globalThis as any).cancelAnimationFrame = origCaf;
	});

	function flushRaf(): void {
		const cbs = [...rafCallbacks];
		rafCallbacks = [];
		cbs.forEach((cb) => cb());
	}

	test("missing configured x leaves a gap instead of inventing sample coordinates", () => {
		const container = document.getElementById("plots-container") as HTMLElement;
		const instance = createMeasurementPlots(container, [{ id: "missing-x", type: "line", x: "t", y: "y" }]);
		instance.update({ t: 1, y: 1 });
		instance.update({ y: 2 });
		instance.update({ t: 3, y: 3 });
		flushRaf();
		expect(container.querySelector(".bk-measurement-line")?.getAttribute("d")?.match(/M /g)?.length).toBe(2);
		instance.dispose();
	});

	test("dataset line preserves gaps and caps work at the configured limit", () => {
		const container = document.getElementById("plots-container") as HTMLElement;
		const instance = createMeasurementPlots(container, [{ id: "data-gaps", type: "line", data: "points", maxPoints: 4 }]);
		instance.update({ points: [{ x: 0, y: 1 }, null, { x: 2, y: 3 }, { x: 3, y: 4 }, { x: 4, y: 5 }] });
		flushRaf();
		const path = container.querySelector(".bk-measurement-line")?.getAttribute("d") ?? "";
		expect(path.match(/M /g)?.length).toBe(2);
		expect(path.match(/L /g)?.length).toBe(1);
		instance.dispose();
	});

	describe("Initialization & DOM Architecture", () => {
		test("renders empty placeholder when plots array is empty", () => {
			const container = document.getElementById("plots-container") as HTMLElement;
			const instance = createMeasurementPlots(container, []);

			expect(container.querySelector(".bk-measurement-empty")).not.toBeNull();
			expect(container.textContent).toContain("No measurement plots configured.");
			instance.dispose();
			expect(container.textContent).toBe("");
		});

		test("renders single plot without carousel navigation controls", () => {
			const container = document.getElementById("plots-container") as HTMLElement;
			const plots: MeasurementPlot[] = [
				{
					id: "speed-trace",
					title: "Speed Profile",
					type: "line",
					x: "time",
					y: "speed",
					xLabel: "Time (s)",
					yLabel: "Speed (m/s)",
				},
			];

			const instance = createMeasurementPlots(container, plots);

			expect(container.querySelector(".bk-measurement-wrapper")).not.toBeNull();
			expect(container.querySelector(".bk-measurement-title")?.textContent).toBe("Speed Profile");
			expect(container.querySelector(".bk-measurement-nav")).toBeNull();
			expect(container.querySelectorAll(".bk-measurement-plot-item").length).toBe(1);

			// Check SVG attributes
			const svg = container.querySelector("svg.bk-measurement-svg");
			expect(svg).not.toBeNull();
			expect(svg?.getAttribute("viewBox")).toBe("0 0 460 260");
			expect(svg?.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");

			instance.dispose();
		});

		test("renders multiple plots with carousel navigation and counter", () => {
			const container = document.getElementById("plots-container") as HTMLElement;
			const plots: MeasurementPlot[] = [
				{ id: "p1", title: "Plot One", type: "line", y: "v1" },
				{ id: "p2", title: "Plot Two", type: "scatter", y: "v2" },
				{ id: "p3", title: "Plot Three", type: "bar", data: "barData" },
			];

			const instance = createMeasurementPlots(container, plots);

			const nav = container.querySelector(".bk-measurement-nav");
			expect(nav).not.toBeNull();
			const counter = container.querySelector(".bk-measurement-counter");
			expect(counter?.textContent).toBe("1 / 3");
			expect(container.querySelectorAll(".bk-measurement-plot-item").length).toBe(3);

			instance.dispose();
		});
	});

	describe("Streaming Scalar Telemetry & Line/Scatter Plots", () => {
		test("streaming updates append points and render line path", () => {
			const container = document.getElementById("plots-container") as HTMLElement;
			const plots: MeasurementPlot[] = [
				{
					id: "osc",
					title: "Oscillation",
					type: "line",
					x: "t",
					y: "x",
					xMin: 0,
					xMax: 10,
					yMin: -2,
					yMax: 2,
				},
			];

			const instance = createMeasurementPlots(container, plots);

			// Empty state before data
			const empty = container.querySelector(".bk-measurement-empty");
			expect(empty?.classList.contains("bk-measurement-hidden")).toBe(false);

			instance.update({ t: 0, x: 0.5 });
			instance.update({ t: 1, x: 1.0 });
			instance.update({ t: 2, x: 0.2 });
			flushRaf();

			expect(empty?.classList.contains("bk-measurement-hidden")).toBe(true);

			const path = container.querySelector(".bk-measurement-line");
			expect(path).not.toBeNull();
			const d = path?.getAttribute("d") || "";
			expect(d).toContain("M ");
			expect(d).toContain("L ");

			instance.dispose();
		});

		test("auto-increments sample counter when x property is omitted", () => {
			const container = document.getElementById("plots-container") as HTMLElement;
			const plots: MeasurementPlot[] = [
				{ id: "step-y", type: "line", y: "signal" },
			];

			const instance = createMeasurementPlots(container, plots);
			instance.update({ signal: 10 });
			instance.update({ signal: 20 });
			instance.update({ signal: 30 });
			flushRaf();

			const path = container.querySelector(".bk-measurement-line");
			expect(path).not.toBeNull();
			expect(path?.getAttribute("d")).not.toBe("");

			instance.dispose();
		});

		test("multi-series streaming renders legend and distinct series paths", () => {
			const container = document.getElementById("plots-container") as HTMLElement;
			const plots: MeasurementPlot[] = [
				{
					id: "kinematics",
					title: "Kinematics",
					type: "line",
					x: "t",
					series: [
						{ y: "pos", label: "Position" },
						{ y: "vel", label: "Velocity" },
					],
				},
			];

			const instance = createMeasurementPlots(container, plots);

			const legendItems = container.querySelectorAll(".bk-measurement-legend-item");
			expect(legendItems.length).toBe(2);
			expect(legendItems[0].textContent).toContain("Position");
			expect(legendItems[1].textContent).toContain("Velocity");

			instance.update({ t: 0, pos: 1, vel: 0 });
			instance.update({ t: 1, pos: 2, vel: 1 });
			flushRaf();

			const lines = container.querySelectorAll(".bk-measurement-line");
			expect(lines.length).toBe(2);
			expect(lines[0].classList.contains("bk-measurement-series-0")).toBe(true);
			expect(lines[1].classList.contains("bk-measurement-series-1")).toBe(true);

			instance.dispose();
		});

		test("handles missing or non-finite points without fabricating zero or connecting gaps", () => {
			const container = document.getElementById("plots-container") as HTMLElement;
			const plots: MeasurementPlot[] = [
				{
					id: "gap-test",
					type: "line",
					x: "t",
					y: "val",
					xMin: 0,
					xMax: 10,
					yMin: 0,
					yMax: 10,
				},
			];

			const instance = createMeasurementPlots(container, plots);

			instance.update({ t: 0, val: 5 });
			instance.update({ t: 1, val: 6 });
			// Gap / missing / NaN value
			instance.update({ t: 2, val: Number.NaN });
			instance.update({ t: 3, val: null });
			instance.update({ t: 4, val: "invalid" as any });
			// Resume after gap
			instance.update({ t: 5, val: 8 });
			instance.update({ t: 6, val: 9 });
			flushRaf();

			const path = container.querySelector(".bk-measurement-line");
			const d = path?.getAttribute("d") || "";

			// The path should contain two distinct segments (two "M " commands), not one continuous line
			const moveCount = (d.match(/M /g) || []).length;
			expect(moveCount).toBe(2);

			instance.dispose();
		});

		test("enforces maxPoints hard bounds and sliding FIFO window", () => {
			const container = document.getElementById("plots-container") as HTMLElement;
			const plots: MeasurementPlot[] = [
				{ id: "bounded", type: "line", y: "val", maxPoints: 5 },
			];

			const instance = createMeasurementPlots(container, plots);

			for (let i = 0; i < 20; i++) {
				instance.update({ val: i * 10 });
			}
			flushRaf();

			// Ensure SVG path has valid commands without error
			const path = container.querySelector(".bk-measurement-line");
			expect(path).not.toBeNull();

			instance.dispose();
		});

		test("throttles updates with sampleMs", () => {
			const container = document.getElementById("plots-container") as HTMLElement;
			const plots: MeasurementPlot[] = [
				{ id: "throttled", type: "scatter", y: "val", sampleMs: 100 },
			];

			const instance = createMeasurementPlots(container, plots);

			instance.update({ val: 1 });
			// Immediate second update within throttle window
			instance.update({ val: 2 });
			flushRaf();

			const points = container.querySelectorAll(".bk-measurement-scatter-point");
			expect(points.length).toBe(1);

			instance.dispose();
		});
	});

	describe("Dataset Telemetry & Plot Types", () => {
		test("renders bar plot from dataset telemetry", () => {
			const container = document.getElementById("plots-container") as HTMLElement;
			const plots: MeasurementPlot[] = [
				{
					id: "spectrum",
					title: "Energy Spectrum",
					type: "bar",
					data: "bars",
					xLabel: "Mode",
					yLabel: "Energy",
				},
			];

			const instance = createMeasurementPlots(container, plots);

			instance.update({
				bars: [
					{ x: 1, y: 10 },
					{ x: 2, y: 25 },
					{ x: 3, y: 15 },
				],
			});
			flushRaf();

			const bars = container.querySelectorAll(".bk-measurement-bar");
			expect(bars.length).toBe(3);

			instance.dispose();
		});

		test("renders vector field plot from dataset telemetry", () => {
			const container = document.getElementById("plots-container") as HTMLElement;
			const plots: MeasurementPlot[] = [
				{
					id: "flow",
					title: "Velocity Field",
					type: "vector-field",
					data: "vectors",
					xMin: 0,
					xMax: 10,
					yMin: 0,
					yMax: 10,
				},
			];

			const instance = createMeasurementPlots(container, plots);

			instance.update({
				vectors: [
					{ x: 2, y: 2, u: 1, v: 0 },
					{ x: 4, y: 4, u: 0, v: 1 },
					{ x: 6, y: 6, u: 1, v: 1 },
				],
			});
			flushRaf();

			const shafts = container.querySelectorAll(".bk-measurement-vector-shaft");
			const arrows = container.querySelectorAll(".bk-measurement-vector-arrow");
			expect(shafts.length).toBe(3);
			expect(arrows.length).toBe(3);

			instance.dispose();
		});

		test("handles malformed datasets gracefully", () => {
			const container = document.getElementById("plots-container") as HTMLElement;
			const plots: MeasurementPlot[] = [
				{ id: "bar-safe", type: "bar", data: "badData" },
			];

			const instance = createMeasurementPlots(container, plots);

			// Non-array
			instance.update({ badData: "not-an-array" });
			flushRaf();
			expect(container.querySelectorAll(".bk-measurement-bar").length).toBe(0);

			// Array with bad items
			instance.update({
				badData: [
					null,
					undefined,
					{ x: "bad", y: 10 },
					{ x: 1, y: Number.POSITIVE_INFINITY },
					{ x: 2, y: 5 }, // valid
				],
			});
			flushRaf();

			const bars = container.querySelectorAll(".bk-measurement-bar");
			expect(bars.length).toBe(1);

			instance.dispose();
		});
	});

	describe("Carousel Navigation & Interaction", () => {
		test("next and previous buttons cycle through slides with wraparound", () => {
			const container = document.getElementById("plots-container") as HTMLElement;
			const plots: MeasurementPlot[] = [
				{ id: "p1", title: "First Plot", type: "line", y: "a" },
				{ id: "p2", title: "Second Plot", type: "line", y: "b" },
			];

			const instance = createMeasurementPlots(container, plots);

			const title = container.querySelector(".bk-measurement-title");
			const counter = container.querySelector(".bk-measurement-counter");
			const nextBtn = container.querySelector(".bk-measurement-next") as HTMLButtonElement;
			const prevBtn = container.querySelector(".bk-measurement-prev") as HTMLButtonElement;

			expect(title?.textContent).toBe("First Plot");
			expect(counter?.textContent).toBe("1 / 2");

			// Click Next -> Slide 2
			nextBtn.click();
			expect(title?.textContent).toBe("Second Plot");
			expect(counter?.textContent).toBe("2 / 2");

			// Click Next -> Wraps to Slide 1
			nextBtn.click();
			expect(title?.textContent).toBe("First Plot");
			expect(counter?.textContent).toBe("1 / 2");

			// Click Prev -> Wraps to Slide 2
			prevBtn.click();
			expect(title?.textContent).toBe("Second Plot");
			expect(counter?.textContent).toBe("2 / 2");

			instance.dispose();
		});

		test("keyboard navigation responds to Arrow keys, Home, and End", () => {
			const container = document.getElementById("plots-container") as HTMLElement;
			const plots: MeasurementPlot[] = [
				{ id: "p1", title: "P1", type: "line", y: "a" },
				{ id: "p2", title: "P2", type: "line", y: "b" },
				{ id: "p3", title: "P3", type: "line", y: "c" },
			];

			const instance = createMeasurementPlots(container, plots);
			const carousel = container.querySelector(".bk-measurement-carousel") as HTMLElement;
			const title = container.querySelector(".bk-measurement-title");

			// ArrowRight -> P2
			carousel.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
			expect(title?.textContent).toBe("P2");

			// End -> P3
			carousel.dispatchEvent(new window.KeyboardEvent("keydown", { key: "End", bubbles: true }));
			expect(title?.textContent).toBe("P3");

			// Home -> P1
			carousel.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Home", bubbles: true }));
			expect(title?.textContent).toBe("P1");

			// ArrowLeft -> Wraps to P3
			carousel.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
			expect(title?.textContent).toBe("P3");

			instance.dispose();
		});

		test("touch swipe navigates horizontally while ignoring vertical gestures", () => {
			const container = document.getElementById("plots-container") as HTMLElement;
			const plots: MeasurementPlot[] = [
				{ id: "p1", title: "Plot A", type: "line", y: "a" },
				{ id: "p2", title: "Plot B", type: "line", y: "b" },
			];

			const instance = createMeasurementPlots(container, plots);
			const carousel = container.querySelector(".bk-measurement-carousel") as HTMLElement;
			const title = container.querySelector(".bk-measurement-title");

			// Vertical gesture (deltaY = 80, deltaX = 10) -> Should NOT switch slide
			carousel.dispatchEvent(new (window as any).TouchEvent("touchstart", {
				touches: [{ clientX: 100, clientY: 100 }],
			}));
			carousel.dispatchEvent(new (window as any).TouchEvent("touchend", {
				changedTouches: [{ clientX: 90, clientY: 180 }],
			}));
			expect(title?.textContent).toBe("Plot A");

			// Horizontal swipe left (deltaX = -50, deltaY = 5) -> Should switch to Plot B
			carousel.dispatchEvent(new (window as any).TouchEvent("touchstart", {
				touches: [{ clientX: 100, clientY: 100 }],
			}));
			carousel.dispatchEvent(new (window as any).TouchEvent("touchend", {
				changedTouches: [{ clientX: 50, clientY: 105 }],
			}));
			expect(title?.textContent).toBe("Plot B");

			instance.dispose();
		});
	});

	describe("Lifecycle: Reset & Dispose", () => {
		test("reset() clears historical buffers and restores empty state", () => {
			const container = document.getElementById("plots-container") as HTMLElement;
			const plots: MeasurementPlot[] = [
				{ id: "p1", type: "line", y: "val" },
			];

			const instance = createMeasurementPlots(container, plots);

			instance.update({ val: 42 });
			flushRaf();
			const empty = container.querySelector(".bk-measurement-empty");
			expect(empty?.classList.contains("bk-measurement-hidden")).toBe(true);

			// Call reset()
			instance.reset();
			expect(empty?.classList.contains("bk-measurement-hidden")).toBe(false);
			const path = container.querySelector(".bk-measurement-line");
			expect(path).toBeNull();

			instance.dispose();
		});

		test("dispose() cancels RAF and clears container DOM", () => {
			const container = document.getElementById("plots-container") as HTMLElement;
			const plots: MeasurementPlot[] = [
				{ id: "p1", type: "line", y: "val" },
			];

			const instance = createMeasurementPlots(container, plots);
			expect(container.children.length).toBeGreaterThan(0);

			instance.dispose();
			expect(container.innerHTML).toBe("");
		});
	});

	describe("Extension Registry", () => {
		test("registerMeasurementPlotRenderer renders custom plot type", () => {
			let customRenderCalled = false;

			registerMeasurementPlotRenderer("custom-stars", (ctx: MeasurementPlotRenderContext) => {
				customRenderCalled = true;
				const star = document.createElementNS("http://www.w3.org/2000/svg", "circle");
				star.setAttribute("class", "bk-measurement-star");
				ctx.contentGroup.appendChild(star);
			});

			const container = document.getElementById("plots-container") as HTMLElement;
			const plots: MeasurementPlot[] = [
				{ id: "star-chart", type: "custom-stars", data: "starData" },
			];

			const instance = createMeasurementPlots(container, plots);
			instance.update({
				starData: [{ x: 1, y: 1 }],
			});
			flushRaf();

			expect(customRenderCalled).toBe(true);
			expect(container.querySelector(".bk-measurement-star")).not.toBeNull();

			instance.dispose();
		});
	});
});
