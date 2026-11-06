import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { normalizeSimulationOptions, normalizeWorldOptions } from "../src/builder/utils.js";
import { renderSimulationControls } from "../src/renderer/markdown/controls.js";
import { renderSimulation } from "../src/renderer/blocks/simulation.js";
import { renderSteps } from "../src/renderer/blocks/steps.js";
import {
	bkApplyPropsToControls,
	bkGetCurrentProps,
	bkReadSimProps,
	bkWireSimControls,
} from "../src/client/simulation.js";
import type { SimulationBlock, StepsBlock } from "../src/types.js";

describe("Simulation Host Controls - Expanded Contract", () => {
	describe("renderSimulationControls", () => {
		test("renders select control with typed options and escaped labels", () => {
			const block: SimulationBlock = {
				type: "simulation",
				src: "sim.js",
				props: {
					theme: "dark",
				},
				tunables: {
					theme: {
						type: "select",
						label: "Visual <Theme>",
						options: [
							{ label: "Light & Clear", value: "light" },
							{ label: "Dark & Sleek", value: "dark" },
						],
					},
				},
			};

			const html = renderSimulationControls(block, "test-sim");
			expect(html).toContain('class="bk-sim-select"');
			expect(html).toContain("Visual &lt;Theme&gt;");
			expect(html).toContain('<select data-bk-prop="theme"');
			expect(html).toContain('value="light" data-bk-val="&quot;light&quot;"');
			expect(html).toContain('value="dark" data-bk-val="&quot;dark&quot;" selected');
			expect(html).toContain("Light &amp; Clear");
			expect(html).toContain("Dark &amp; Sleek");
		});

		test("renders segmented control with scoped radio names and typed options", () => {
			const block: SimulationBlock = {
				type: "simulation",
				src: "sim.js",
				props: {
					speed: 2,
				},
				tunables: {
					speed: {
						type: "segmented",
						label: "Speed Level",
						options: [
							{ label: "1x", value: 1 },
							{ label: "2x", value: 2 },
							{ label: "3x", value: 3 },
						],
					},
				},
			};

			const html1 = renderSimulationControls(block, "sim-block-1");
			const html2 = renderSimulationControls(block, "sim-block-2");

			expect(html1).toContain('class="bk-sim-segmented"');
			expect(html1).toContain('role="radiogroup"');
			expect(html1).toContain('name="bk-seg-sim-block-1-speed"');
			expect(html2).toContain('name="bk-seg-sim-block-2-speed"');

			// Radio for 2 should be checked
			expect(html1).toContain('value="2" data-bk-val="2" checked');
			expect(html1).toContain('value="1" data-bk-val="1"');
			expect(html1).not.toContain('value="1" data-bk-val="1" checked');
		});

		test("renders unit suffix on number and range controls", () => {
			const block: SimulationBlock = {
				type: "simulation",
				src: "sim.js",
				props: {
					velocity: 15,
					count: 42,
				},
				tunables: {
					velocity: {
						type: "range",
						label: "Velocity",
						min: 0,
						max: 50,
						step: 1,
						unit: "m/s",
					},
					count: {
						type: "number",
						label: "Count",
						min: 1,
						max: 100,
						unit: "items",
					},
				},
			};

			const html = renderSimulationControls(block);
			expect(html).toContain('<span class="bk-sim-unit">m/s</span>');
			expect(html).toContain('<span class="bk-sim-unit">items</span>');
		});

		test("renders presets and actions independent of controls", () => {
			const block: SimulationBlock = {
				type: "simulation",
				src: "sim.js",
				props: {
					mass: 10,
					hiddenSeed: 999,
				},
				tunables: {
					mass: { type: "range", min: 1, max: 20 },
				},
				presets: {
					heavy: { label: "Heavy Core", props: { mass: 20 } },
					light: { label: "Light Core", props: { mass: 2 } },
				},
				actions: {
					fire: { label: "Launch Rocket & Test" },
					reset: { label: "Reset" },
				},
			};

			const html = renderSimulationControls(block);
			expect(html).toContain('class="bk-sim-presets"');
			expect(html).toContain('class="bk-sim-preset-select"');
			expect(html).toContain("data-bk-preset-select");
			expect(html).toContain("Choose preset");
			expect(html).toContain('value="heavy"');
			expect(html).toContain('data-bk-preset-props="{&quot;mass&quot;:20}"');
			expect(html).toContain("Heavy Core");
			expect(html).toContain('value="light"');
			expect(html).toContain("Light Core");

			expect(html).toContain('class="bk-sim-actions"');
			expect(html).toContain('data-bk-action="fire"');
			expect(html).toContain("Launch Rocket &amp; Test");

			// Embedded default props contain hidden properties
			expect(html).toContain('data-bk-default-props="');
			expect(html).toContain('&quot;hiddenSeed&quot;:999');
		});

		test("renders actions and presets even when no tunables are specified", () => {
			const block: SimulationBlock = {
				type: "simulation",
				src: "sim.js",
				actions: {
					ping: { label: "Send Ping" },
				},
				presets: {
					p1: { label: "Preset One", props: { val: "abc" } },
				},
			};

			const html = renderSimulationControls(block);
			expect(html).toContain('data-bk-action="ping"');
			expect(html).toContain('data-bk-preset-select');
			expect(html).toContain('value="p1"');
			expect(html).toContain("Preset One");
		});

		test("renders primary controls in compact row and advanced controls inside closed details/summary", () => {
			const block: SimulationBlock = {
				type: "simulation",
				src: "oscillator.js",
				props: {
					damping: 1.5,
					mass: 1.0,
					dampingMode: "viscous",
					showVectors: true,
				},
				tunables: {
					damping: { type: "range", label: "Damping", min: 0, max: 25 },
					mass: { type: "number", label: "Mass", min: 0.5, max: 5.0, advanced: true },
					dampingMode: {
						type: "segmented",
						label: "Damping Mode",
						advanced: true,
						options: [
							{ label: "Viscous", value: "viscous" },
							{ label: "Quadratic", value: "quadratic" },
						],
					},
					showVectors: { type: "boolean", label: "Show Vectors" },
				},
				presets: {
					underdamped: { label: "Underdamped", props: { damping: 1.2 } },
				},
				actions: {
					kick: { label: "Kick" },
				},
			};

			const html = renderSimulationControls(block);

			// Preset select is rendered
			expect(html).toContain("data-bk-preset-select");
			expect(html).toContain("Underdamped");

			// Action button is rendered
			expect(html).toContain('data-bk-action="kick"');

			// Primary controls (damping range, showVectors boolean) rendered outside details
			expect(html).toContain('data-bk-prop="damping"');
			expect(html).toContain('data-bk-prop="showVectors"');

			// Automatic large margin class removed from toggles
			expect(html).not.toContain("bk-sim-toggle--first");

			// Advanced controls inside native details/summary, closed initially (no open attribute)
			expect(html).toContain('<details class="bk-sim-advanced">');
			expect(html).not.toContain('<details class="bk-sim-advanced" open');
			expect(html).toContain('<summary class="bk-sim-advanced-summary">More controls</summary>');
			expect(html).toContain('<div class="bk-sim-advanced-body">');

			// Advanced tunables are inside details
			const detailsPart = html.split('<details class="bk-sim-advanced">')[1];
			expect(detailsPart).toContain('data-bk-prop="mass"');
			expect(detailsPart).toContain('data-bk-prop="dampingMode"');
		});

		test("omits details element when no controls are advanced", () => {
			const block: SimulationBlock = {
				type: "simulation",
				src: "sim.js",
				props: { speed: 5 },
				tunables: {
					speed: { type: "range", label: "Speed" },
				},
			};

			const html = renderSimulationControls(block);
			expect(html).not.toContain("<details");
			expect(html).toContain('data-bk-prop="speed"');
		});

		test("supports collective advancedControls list and unlisted controls remain primary", () => {
			const block: SimulationBlock = {
				type: "simulation",
				src: "oscillator.js",
				props: {
					damping: 1.5,
					mass: 1.0,
					dampingMode: "viscous",
					showTrace: true,
				},
				tunables: {
					damping: { type: "range", label: "Damping", min: 0, max: 25 },
					mass: { type: "number", label: "Mass", min: 0.5, max: 5.0 },
					dampingMode: {
						type: "segmented",
						label: "Damping Mode",
						options: [
							{ label: "Viscous", value: "viscous" },
							{ label: "Dry", value: "dry" },
						],
					},
					showTrace: { type: "boolean", label: "Trace" },
				},
				advancedControls: ["mass", "dampingMode"],
			};

			const html = renderSimulationControls(block);

			// damping and showTrace are unlisted -> primary
			const [primaryHtml, detailsHtml] = html.split('<details class="bk-sim-advanced">');
			expect(detailsHtml).toBeDefined();

			expect(primaryHtml).toContain('data-bk-prop="damping"');
			expect(primaryHtml).toContain('data-bk-prop="showTrace"');
			expect(primaryHtml).not.toContain('data-bk-prop="mass"');
			expect(primaryHtml).not.toContain('data-bk-prop="dampingMode"');

			// mass and dampingMode are listed in advancedControls -> secondary
			expect(detailsHtml).toContain('data-bk-prop="mass"');
			expect(detailsHtml).toContain('data-bk-prop="dampingMode"');
		});

		test("enforces exact precedence: control.advanced ?? advancedControls.includes(key)", () => {
			const block: SimulationBlock = {
				type: "simulation",
				src: "test.js",
				props: {
					a: 1,
					b: 2,
					c: 3,
					d: 4,
				},
				tunables: {
					// a is in advancedControls list, but explicit advanced: false overrides it to primary
					a: { type: "range", label: "A", advanced: false },
					// b is not in list, but explicit advanced: true makes it secondary
					b: { type: "range", label: "B", advanced: true },
					// c has no per-control flag, uses list -> secondary
					c: { type: "range", label: "C" },
					// d has no per-control flag, not in list -> primary
					d: { type: "range", label: "D" },
				},
				advancedControls: ["a", "c"],
			};

			const html = renderSimulationControls(block);
			const [primaryPart, advancedPart] = html.split('<details class="bk-sim-advanced">');

			expect(primaryPart).toContain('data-bk-prop="a"');
			expect(primaryPart).toContain('data-bk-prop="d"');
			expect(primaryPart).not.toContain('data-bk-prop="b"');
			expect(primaryPart).not.toContain('data-bk-prop="c"');

			expect(advancedPart).toContain('data-bk-prop="b"');
			expect(advancedPart).toContain('data-bk-prop="c"');
			expect(advancedPart).not.toContain('data-bk-prop="a"');
			expect(advancedPart).not.toContain('data-bk-prop="d"');
		});

		test("unknown keys in advancedControls do not create controls", () => {
			const block: SimulationBlock = {
				type: "simulation",
				src: "test.js",
				props: {
					actualProp: 10,
				},
				tunables: {
					actualProp: { type: "range", label: "Actual" },
				},
				advancedControls: ["actualProp", "nonExistentProp1", "ghostKey"],
			};

			const html = renderSimulationControls(block);
			expect(html).toContain('data-bk-prop="actualProp"');
			expect(html).not.toContain("nonExistentProp1");
			expect(html).not.toContain("ghostKey");
		});
	});

	describe("Normalization & Config Pass-Through", () => {
		test("normalizeSimulationOptions passes actions, presets, and advancedControls", () => {
			const opts = normalizeSimulationOptions(
				{
					props: { a: 1 },
					actions: { reset: { label: "Reset" } },
					presets: { default: { label: "Default", props: { a: 1 } } },
					advancedControls: ["a"],
				},
				420,
			);
			expect(opts.actions).toEqual({ reset: { label: "Reset" } });
			expect(opts.presets).toEqual({ default: { label: "Default", props: { a: 1 } } });
			expect(opts.advancedControls).toEqual(["a"]);
		});

		test("normalizeWorldOptions passes actions, presets, and advancedControls", () => {
			const opts = normalizeWorldOptions(
				{
					props: { zoom: 1 },
					actions: { snap: { label: "Snap Camera" } },
					presets: { macro: { label: "Macro View", props: { zoom: 5 } } },
					advancedControls: ["zoom"],
				},
				480,
			);
			expect(opts.actions).toEqual({ snap: { label: "Snap Camera" } });
			expect(opts.presets).toEqual({ macro: { label: "Macro View", props: { zoom: 5 } } });
			expect(opts.advancedControls).toEqual(["zoom"]);
		});

		test("steps block renders controls when actions, presets, or advancedControls are specified", () => {
			const stepsBlock: StepsBlock = {
				type: "steps",
				src: "sim.js",
				props: {
					p: 10,
					q: 20,
				},
				tunables: {
					p: { type: "range", label: "P" },
					q: { type: "range", label: "Q" },
				},
				advancedControls: ["q"],
				actions: {
					restart: { label: "Restart Action" },
				},
			};

			const rendered = renderSteps(stepsBlock, 0, { strict: false });
			expect(rendered.html).toContain('data-bk-action="restart"');
			expect(rendered.html).toContain("Restart Action");
			expect(rendered.html).toContain('<details class="bk-sim-advanced">');
			expect(rendered.html).toContain('data-bk-prop="q"');
		});
	});

	describe("Client-side Typed Choices & Preset Synchronization", () => {
		test("bkReadSimProps preserves exact value types for select and radio groups", () => {
			const dom = new JSDOM(`
				<div class="bk-object">
					<div class="bk-sim-controls">
						<select data-bk-prop="selectedNum">
							<option value="10" data-bk-val="10">Ten</option>
							<option value="20" data-bk-val="20" selected>Twenty</option>
						</select>
						<select data-bk-prop="selectedBool">
							<option value="true" data-bk-val="true">Active</option>
							<option value="false" data-bk-val="false" selected>Inactive</option>
						</select>
						<select data-bk-prop="selectedStr">
							<option value="first" data-bk-val="&quot;first&quot;" selected>First</option>
							<option value="second" data-bk-val="&quot;second&quot;">Second</option>
						</select>
						<input type="radio" name="r1" data-bk-prop="radioNum" value="100" data-bk-val="100">
						<input type="radio" name="r1" data-bk-prop="radioNum" value="200" data-bk-val="200" checked>
						<input type="radio" name="r2" data-bk-prop="radioBool" value="true" data-bk-val="true" checked>
						<input type="radio" name="r2" data-bk-prop="radioBool" value="false" data-bk-val="false">
						<input type="checkbox" data-bk-prop="flag" checked>
						<input type="range" data-bk-prop="slider" value="45">
						<input type="text" data-bk-prop="name" value="Newton">
					</div>
				</div>
			`);

			const div = dom.window.document.querySelector(".bk-object");
			const props = bkReadSimProps(div);
			expect(props.selectedNum).toBe(20);
			expect(typeof props.selectedNum).toBe("number");
			expect(props.selectedBool).toBe(false);
			expect(typeof props.selectedBool).toBe("boolean");
			expect(props.selectedStr).toBe("first");
			expect(typeof props.selectedStr).toBe("string");

			expect(props.radioNum).toBe(200);
			expect(typeof props.radioNum).toBe("number");
			expect(props.radioBool).toBe(true);
			expect(typeof props.radioBool).toBe("boolean");

			expect(props.flag).toBe(true);
			expect(props.slider).toBe(45);
			expect(props.name).toBe("Newton");
		});

		test("bkApplyPropsToControls updates select, segmented radio, and slider tracks", () => {
			const dom = new JSDOM(`
				<div class="bk-object">
					<div class="bk-sim-controls">
						<select data-bk-prop="tier">
							<option value="basic" data-bk-val="&quot;basic&quot;" selected>Basic</option>
							<option value="pro" data-bk-val="&quot;pro&quot;">Pro</option>
						</select>
						<input type="radio" name="mode" data-bk-prop="mode" value="easy" data-bk-val="&quot;easy&quot;" checked>
						<input type="radio" name="mode" data-bk-prop="mode" value="hard" data-bk-val="&quot;hard&quot;">
						<label class="bk-sim-range">
							<input type="range" data-bk-prop="zoom" min="0" max="100" value="20">
							<input type="number" class="bk-sim-range-input" data-bk-sync="zoom" value="20">
						</label>
						<input type="checkbox" data-bk-prop="enabled">
					</div>
				</div>
			`);

			const div = dom.window.document.querySelector(".bk-object") as HTMLElement;

			bkApplyPropsToControls(div, {
				tier: "pro",
				mode: "hard",
				zoom: 80,
				enabled: true,
			});

			const select = div.querySelector('select[data-bk-prop="tier"]') as HTMLSelectElement;
			expect(select.value).toBe("pro");

			const radioHard = div.querySelector('input[type="radio"][value="hard"]') as HTMLInputElement;
			const radioEasy = div.querySelector('input[type="radio"][value="easy"]') as HTMLInputElement;
			expect(radioHard.checked).toBe(true);
			expect(radioEasy.checked).toBe(false);

			const range = div.querySelector('input[type="range"]') as HTMLInputElement;
			const sync = div.querySelector('input[data-bk-sync="zoom"]') as HTMLInputElement;
			expect(range.value).toBe("80");
			expect(sync.value).toBe("80");
			expect(range.style.getPropertyValue("--bk-track-fill")).toBe("80%");

			const checkbox = div.querySelector('input[type="checkbox"]') as HTMLInputElement;
			expect(checkbox.checked).toBe(true);
		});

		test("bkGetCurrentProps preserves hidden default props not represented in visible inputs", () => {
			const dom = new JSDOM(`
				<div class="bk-object">
					<div class="bk-sim-controls" data-bk-default-props='{"visibleProp": 5, "hiddenPropA": "secret", "hiddenPropB": 12345}'>
						<input type="range" data-bk-prop="visibleProp" value="10">
					</div>
				</div>
			`);

			const div = dom.window.document.querySelector(".bk-object") as HTMLElement;
			const props = bkGetCurrentProps(div);
			expect(props.visibleProp).toBe(10); // Updated from DOM
			expect(props.hiddenPropA).toBe("secret"); // Preserved from default props
			expect(props.hiddenPropB).toBe(12345); // Preserved from default props
		});
	});

	describe("Interaction Delivery: Actions & Presets", () => {
		test("preset click atomically merges props, updates visible controls, and sends one postMessage", () => {
			const dom = new JSDOM(`
				<div class="bk-object">
					<div class="bk-sim-controls" data-bk-default-props='{"mass": 10, "hiddenSeed": 42}'>
						<button type="button" class="bk-sim-preset-btn" data-bk-preset="heavy" data-bk-preset-props='{"mass": 50}'>Heavy</button>
						<label class="bk-sim-range">
							<input type="range" data-bk-prop="mass" min="0" max="100" value="10">
							<input type="number" class="bk-sim-range-input" data-bk-sync="mass" value="10">
						</label>
					</div>
					<iframe></iframe>
				</div>
			`);

			const sentMessages: any[] = [];
			const iframe = dom.window.document.querySelector("iframe") as HTMLIFrameElement;
			Object.defineProperty(iframe, "contentWindow", {
				value: {
					postMessage: (msg: any) => sentMessages.push(msg),
				},
				configurable: true,
			});

			// Setup document environment for bkWireSimControls
			const oldDoc = (globalThis as any).document;
			(globalThis as any).document = dom.window.document;
			try {
				bkWireSimControls();

				const presetBtn = dom.window.document.querySelector('[data-bk-preset="heavy"]') as HTMLButtonElement;
				presetBtn.click();

				// Verifications
				expect(sentMessages.length).toBe(1);
				expect(sentMessages[0].type).toBe("bk:set-props");
				expect(sentMessages[0].props.mass).toBe(50);
				expect(sentMessages[0].props.hiddenSeed).toBe(42); // Hidden prop preserved!

				// Visible controls updated
				const range = dom.window.document.querySelector('input[type="range"]') as HTMLInputElement;
				const sync = dom.window.document.querySelector('input[data-bk-sync="mass"]') as HTMLInputElement;
				expect(range.value).toBe("50");
				expect(sync.value).toBe("50");
				expect(presetBtn.classList.contains("is-active")).toBe(true);
			} finally {
				(globalThis as any).document = oldDoc;
			}
		});

		test("action click sends bk:action message, repeated clicks work, and props are untouched", () => {
			const dom = new JSDOM(`
				<div class="bk-object">
					<div class="bk-sim-controls" data-bk-default-props='{"gravity": 9.8}'>
						<button type="button" class="bk-sim-action-btn" data-bk-action="fire">Fire</button>
					</div>
					<iframe></iframe>
				</div>
			`);

			const sentMessages: any[] = [];
			const iframe = dom.window.document.querySelector("iframe") as HTMLIFrameElement;
			Object.defineProperty(iframe, "contentWindow", {
				value: {
					postMessage: (msg: any) => sentMessages.push(msg),
				},
				configurable: true,
			});

			const oldDoc = (globalThis as any).document;
			(globalThis as any).document = dom.window.document;
			try {
				bkWireSimControls();

				const actionBtn = dom.window.document.querySelector('[data-bk-action="fire"]') as HTMLButtonElement;

				// First click
				actionBtn.click();
				expect(sentMessages.length).toBe(1);
				expect(sentMessages[0]).toEqual({ type: "bk:action", action: "fire" });

				// Second click (repeated action click)
				actionBtn.click();
				expect(sentMessages.length).toBe(2);
				expect(sentMessages[1]).toEqual({ type: "bk:action", action: "fire" });

				// Third click
				actionBtn.click();
				expect(sentMessages.length).toBe(3);
				expect(sentMessages[2]).toEqual({ type: "bk:action", action: "fire" });

				// No props messages were sent
				expect(sentMessages.every((m) => m.type === "bk:action")).toBe(true);
			} finally {
				(globalThis as any).document = oldDoc;
			}
		});

		test("preset select change applies atomically once, syncs visible and advanced controls, and clears on manual edit", () => {
			const dom = new JSDOM(`
				<div class="bk-object">
					<div class="bk-sim-controls" data-bk-default-props='{"mass": 10, "mode": "easy", "hiddenSeed": 42}'>
						<div class="bk-sim-presets">
							<select class="bk-sim-preset-select" data-bk-preset-select>
								<option value="">Choose preset</option>
								<option value="heavy" data-bk-preset-props='{"mass": 50, "mode": "hard"}'>Heavy</option>
							</select>
						</div>
						<label class="bk-sim-range">
							<input type="range" data-bk-prop="mass" min="0" max="100" value="10">
							<input type="number" class="bk-sim-range-input" data-bk-sync="mass" value="10">
						</label>
						<details class="bk-sim-advanced">
							<summary class="bk-sim-advanced-summary">More controls</summary>
							<div class="bk-sim-advanced-body">
								<input type="text" data-bk-prop="mode" value="easy">
							</div>
						</details>
					</div>
					<iframe></iframe>
				</div>
			`);

			const sentMessages: any[] = [];
			const iframe = dom.window.document.querySelector("iframe") as HTMLIFrameElement;
			Object.defineProperty(iframe, "contentWindow", {
				value: {
					postMessage: (msg: any) => sentMessages.push(msg),
				},
				configurable: true,
			});

			const oldDoc = (globalThis as any).document;
			(globalThis as any).document = dom.window.document;
			try {
				bkWireSimControls();

				const presetSelect = dom.window.document.querySelector("select[data-bk-preset-select]") as HTMLSelectElement;
				const rangeInput = dom.window.document.querySelector('input[type="range"]') as HTMLInputElement;
				const syncInput = dom.window.document.querySelector('input[data-bk-sync="mass"]') as HTMLInputElement;
				const modeInput = dom.window.document.querySelector('input[data-bk-prop="mode"]') as HTMLInputElement;

				// Initially neutral
				expect(presetSelect.value).toBe("");

				// Choose "heavy" preset
				presetSelect.value = "heavy";
				presetSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));

				// Exactly one message sent with atomic merged props (including hidden seed)
				expect(sentMessages.length).toBe(1);
				expect(sentMessages[0].type).toBe("bk:set-props");
				expect(sentMessages[0].props.mass).toBe(50);
				expect(sentMessages[0].props.mode).toBe("hard");
				expect(sentMessages[0].props.hiddenSeed).toBe(42);

				// Visible controls updated, including advanced controls inside details
				expect(rangeInput.value).toBe("50");
				expect(syncInput.value).toBe("50");
				expect(modeInput.value).toBe("hard");
				expect(presetSelect.value).toBe("heavy");

				// Manual adjustment clears selected preset back to neutral "Choose preset"
				rangeInput.value = "75";
				rangeInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));

				expect(presetSelect.value).toBe("");
				expect(sentMessages.length).toBe(2);
				expect(sentMessages[1].props.mass).toBe(75);
				expect(sentMessages[1].props.mode).toBe("hard"); // Preserved previous values
			} finally {
				(globalThis as any).document = oldDoc;
			}
		});
	});

	describe("Iframe Bridge & Full Block Integration", () => {
		test("iframeDoc and stepsIframeDoc bridge bk:action to CustomEvent('bk:action')", async () => {
			const { iframeDoc } = await import("../src/renderer/blocks/iframe.js");
			const { stepsIframeDoc } = await import("../src/renderer/blocks/steps-iframe.js");

			const simDoc = iframeDoc("console.log('hi')", "{}");
			expect(simDoc).toContain("event.data.type === &quot;bk:action&quot;");
			expect(simDoc).toContain("new CustomEvent(&quot;bk:action&quot;, { detail: { action: event.data.action } })");

			const stepsDoc = stepsIframeDoc("console.log('hi')", "{}");
			expect(stepsDoc).toContain('e.data.type === &quot;bk:action&quot;');
			expect(stepsDoc).toContain('new CustomEvent(&quot;bk:action&quot;, { detail: { action: e.data.action } })');
		});

		test("renderSimulation renders complete controls bar with presets, tunables, and actions", () => {
			const block: SimulationBlock = {
				type: "simulation",
				src: "test-sim.js",
				label: "Full Controls Lab",
				props: {
					speed: 1,
					mode: "fast",
					active: true,
					hiddenParam: "secret",
				},
				tunables: {
					speed: { type: "range", label: "Speed", min: 0, max: 10, unit: "m/s" },
					mode: {
						type: "segmented",
						label: "Mode",
						options: [
							{ label: "Slow", value: "slow" },
							{ label: "Fast", value: "fast" },
						],
					},
					active: { type: "boolean", label: "Active" },
				},
				presets: {
					turbo: { label: "Turbo Mode", props: { speed: 10, mode: "fast" } },
				},
				actions: {
					reset: { label: "Reset" },
				},
			};

			const rendered = renderSimulation(block, 0, { contentBase: process.cwd(), strict: false });
			expect(rendered.html).toContain("Full Controls Lab");
			expect(rendered.html).toContain("data-bk-preset-select");
			expect(rendered.html).toContain('value="turbo"');
			expect(rendered.html).toContain('data-bk-action="reset"');
			expect(rendered.html).toContain('class="bk-sim-segmented"');
			expect(rendered.html).toContain('class="bk-sim-range"');
			expect(rendered.html).toContain('<span class="bk-sim-unit">m/s</span>');
			expect(rendered.html).toContain('data-bk-default-props="');
			expect(rendered.html).toContain('&quot;hiddenParam&quot;:&quot;secret&quot;');
		});
	});
});

describe("control contract regressions", () => {
	test("keeps unlisted props hidden and observe simulations noninteractive", () => {
		const block = { type: "simulation", props: { shown: 1, secret: 42 }, tunables: { shown: { type: "number" as const } }, actions: { kick: { label: "Kick" } } };
		expect(renderSimulationControls(block)).not.toContain('data-bk-prop="secret"');
		expect(renderSimulationControls({ ...block, controls: "observe" })).toBe("");
	});
	test("distinguishes numeric and string choices when rendering and applying presets", () => {
		const html = renderSimulationControls({ props: { mode: 1 }, tunables: { mode: { type: "select", options: [{label: "Numeric", value: 1}, {label: "Text", value: "1"}] } } });
		const dom = new JSDOM(`<figure>${html}</figure>`);
		const figure = dom.window.document.querySelector("figure")!;
		expect(bkReadSimProps(figure).mode).toBe(1);
		bkApplyPropsToControls(figure, {mode: "1"});
		expect(bkReadSimProps(figure).mode).toBe("1");
	});
});

test("escapes segmented scope IDs and numeric input attributes", () => {
	const html = renderSimulationControls({
		props: { amount: '\" autofocus data-injected=\"yes', mode: "a" },
		tunables: { amount: { type: "number" }, mode: { type: "segmented", options: [{ label: "A", value: "a" }] } },
	}, '\" data-injected=\"yes');
	const document = new JSDOM(html).window.document;
	expect(document.querySelector("[data-injected]")).toBeNull();
	expect(document.querySelector("[autofocus]")).toBeNull();
	expect(document.querySelector<HTMLInputElement>('[type="number"]')?.getAttribute("value")).toBe('\" autofocus data-injected=\"yes');
});

test("action colors accept named tokens and reject injected markup", () => {
	for (const color of ["accent", "neutral", "red", "green", "amber"]) {
		const html = renderSimulationControls({ actions: { run: { label: "Run", color: color as any } } });
		expect(new JSDOM(html).window.document.querySelector("button")?.dataset.bkColor).toBe(color);
	}
	const html = renderSimulationControls({ actions: { run: { label: "Run", color: '\" onclick=\"bad' as any } } });
	const button = new JSDOM(html).window.document.querySelector("button")!;
	expect(button.dataset.bkColor).toBe("accent");
	expect(button.hasAttribute("onclick")).toBe(false);
});
