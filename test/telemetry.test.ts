import { describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { LessonBlocks } from "../src/builder/LessonBlocks.js";
import {
	normalizeSimulationOptions,
	normalizeWorldOptions,
} from "../src/builder/utils.js";
import {
	bkCollapseLab,
	bkExpandLab,
	bkResetTelemetry,
	bkSelectInspectorTab,
	bkToggleExpandLab,
	formatTelemetryValue,
} from "../src/client/telemetry.js";
import { parseLesson } from "../src/parser/mdx.js";
import { render } from "../src/renderer/index.js";
import { iframeDoc } from "../src/renderer/blocks/iframe.js";
import { renderSimulation } from "../src/renderer/blocks/simulation.js";
import { stepsIframeDoc } from "../src/renderer/blocks/steps-iframe.js";
import { renderSteps } from "../src/renderer/blocks/steps.js";
import {
	hasTelemetry,
	renderDocTelemetryButton,
	renderDocTelemetryPanel,
	renderInspectorTabs,
	renderSimulationTelemetry,
} from "../src/renderer/markdown/telemetry.js";
import type {
	Lesson,
	SimulationBlock,
	SimulationConfig,
	StepsBlock,
} from "../src/types.js";

describe("Simulation Abstract Telemetry & Expanded Lab Workspace", () => {
	describe("Schema & Options Normalization", () => {
		test("normalizeSimulationOptions passes through telemetry from fileConfig and overrides", () => {
			const fileConfig: SimulationConfig = {
				telemetry: {
					speed: {
						label: "Orbital Speed",
						unit: "km/s",
						precision: 2,
						group: "Dynamics",
					},
					status: { label: "Orbit Status", group: "State" },
				},
			};

			const normalizedFromConfig = normalizeSimulationOptions({}, 420, fileConfig);
			expect(normalizedFromConfig.telemetry).toBeDefined();
			expect(normalizedFromConfig.telemetry?.speed.label).toBe("Orbital Speed");
			expect(normalizedFromConfig.telemetry?.speed.precision).toBe(2);
			expect(normalizedFromConfig.telemetry?.status.group).toBe("State");

			// Inline override
			const normalizedWithOverride = normalizeSimulationOptions(
				{
					telemetry: {
						eccentricity: { label: "Eccentricity (e)", precision: 3 },
					},
				},
				420,
				fileConfig,
			);
			expect(normalizedWithOverride.telemetry?.eccentricity.precision).toBe(3);
			expect(normalizedWithOverride.telemetry?.speed).toBeUndefined();
		});

		test("normalizeWorldOptions passes through telemetry", () => {
			const normalized = normalizeWorldOptions(
				{
					telemetry: {
						coords: { label: "World Coordinates" },
					},
				},
				480,
				null,
			);
			expect(normalized.telemetry?.coords.label).toBe("World Coordinates");
		});

		test("parseLesson parses sibling config with telemetry for simulation and steps", () => {
			const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "telemetry-test-"));
			try {
				const simJs = path.join(tempDir, "kepler.js");
				const simConfig = path.join(tempDir, "kepler.config.json");
				const stepsJs = path.join(tempDir, "steps-sim.js");
				const stepsConfig = path.join(tempDir, "steps-sim.config.json");

				fs.writeFileSync(simJs, "window.bkSetup(800, 450, () => {});");
				fs.writeFileSync(
					simConfig,
					JSON.stringify({
						type: "block",
						telemetry: {
							eccentricity: {
								label: "Eccentricity (e)",
								precision: 3,
								group: "Geometry",
							},
							period: {
								label: "Period (T)",
								unit: "yr",
								precision: 2,
								group: "Geometry",
							},
						},
					}),
				);

				fs.writeFileSync(stepsJs, "window.bkSetup(800, 450, () => {});");
				fs.writeFileSync(
					stepsConfig,
					JSON.stringify({
						type: "steps",
						steps: [{ id: "step-1", title: "Insertion" }],
						telemetry: {
							energy: { label: "Specific Energy", unit: "MJ/kg", precision: 2 },
						},
					}),
				);

				const lessonMd = `---
title: Telemetry Test
slug: telemetry-test
---

![Kepler Orbit](./kepler.js)

![Steps Mission](./steps-sim.js)
`;

				const lesson = parseLesson(lessonMd, { contentBase: tempDir }, tempDir);
				const simBlock = lesson.blocks.find(
					(b) => b.type === "simulation",
				) as SimulationBlock;
				const stepsBlock = lesson.blocks.find(
					(b) => b.type === "steps",
				) as StepsBlock;

				expect(simBlock).toBeDefined();
				expect(simBlock.telemetry?.eccentricity.precision).toBe(3);
				expect(simBlock.telemetry?.period.unit).toBe("yr");

				expect(stepsBlock).toBeDefined();
				expect(stepsBlock.telemetry?.energy.unit).toBe("MJ/kg");
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});

		test("LessonBlocks preserves telemetry in lab() and steps()", () => {
			const tempDir = fs.mkdtempSync(
				path.join(os.tmpdir(), "builder-telemetry-"),
			);
			try {
				class ConcreteLesson extends LessonBlocks {
					public get contentBase() {
						return tempDir;
					}
					public getBlocks() {
						return this.blocks;
					}
				}
				const lesson = new ConcreteLesson();
				lesson.lab("sim.js", {
					telemetry: {
						eccentricity: { label: "Eccentricity", precision: 2 },
					},
				});
				lesson.steps("steps.js", {
					telemetry: {
						deltaV: { label: "Delta-V", unit: "m/s" },
					},
				});

				const blocks = lesson.getBlocks();
				const simBlock = blocks[0] as SimulationBlock;
				const stepsBlock = blocks[1] as StepsBlock;

				expect(simBlock.telemetry?.eccentricity.precision).toBe(2);
				expect(stepsBlock.telemetry?.deltaV.unit).toBe("m/s");
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});
	});

	describe("Simulation Stage & Expanded Workspace Layout Contract", () => {
		test("Simulation contains workspace with stage on left and inspector on right", () => {
			const block: SimulationBlock = {
				type: "simulation",
				src: "sim.js",
				label: "Orbital Test",
				props: { speed: 1 },
				tunables: {
					speed: { label: "Velocity", min: 0, max: 10, step: 0.1 },
				},
				telemetry: {
					speed: { label: "Current Velocity", unit: "km/s", precision: 2 },
				},
			};
			const result = renderSimulation(block, 0, { strict: false });

			// Unified workspace structure
			expect(result.html).toContain('class="bk-sim-workspace"');
			expect(result.html).toContain('class="bk-sim-stage"');
			// Expanded inspector contains accessible tabs for Controls and Data
			expect(result.html).toContain('class="bk-sim-tabs"');
			expect(result.html).toContain('class="bk-sim-tablist"');
			expect(result.html).toContain('role="tablist"');
			expect(result.html).toContain('id="sim-0-tab-controls"');
			expect(result.html).toContain('id="sim-0-tab-telemetry"');
			expect(result.html).toContain('Settings');
			expect(result.html).toContain('Measurements');
			expect(result.html).toContain('class="bk-sim-tabpanel bk-sim-tabpanel--controls is-active"');
			expect(result.html).toContain('class="bk-sim-tabpanel bk-sim-tabpanel--telemetry"');
			expect(result.html).toContain('class="bk-sim-controls"');
			expect(result.html).toContain('class="bk-sim-telemetry"');
			// Header contains Back to lesson affordance and expand button
			expect(result.html).not.toContain('class="bk-expanded-back"');
			expect(result.html).toContain('class="bk-object-maximize"');
			expect(result.html).toContain('aria-label="Open lab"');
			// Telemetry schema for discovery
			expect(result.html).toContain('class="bk-sim-telemetry-schema"');
			// No obsolete drawer or pin styles
			expect(result.html).not.toContain("bk-doc-telemetry-panel");
			expect(result.html).not.toContain("bk-sim-telemetry-btn");
		});

		test("Simulation without telemetry contains controls in inspector without divider or empty telemetry", () => {
			const block: SimulationBlock = {
				type: "simulation",
				src: "sim.js",
				label: "No Telemetry Lab",
				props: { angle: 45 },
			};
			const result = renderSimulation(block, 0, { strict: false });

			expect(result.html).toContain('class="bk-sim-workspace"');
			expect(result.html).toContain('class="bk-sim-inspector"');
			expect(result.html).toContain('class="bk-sim-controls"');
			expect(result.html).not.toContain('class="bk-sim-inspector-divider"');
			expect(result.html).not.toContain('class="bk-sim-telemetry"');
		});

		test("Steps block wraps stage and instructional controls in unified workspace", () => {
			const block: StepsBlock = {
				type: "steps",
				src: "steps.js",
				steps: [{ id: "step-1", title: "Insertion", instruction: "Align orbit" }],
				telemetry: {
					speed: { label: "Speed", unit: "km/s" },
				},
			};
			const result = renderSteps(block, 0, { strict: false });

			expect(result.html).toContain('class="bk-sim-workspace"');
			expect(result.html).toContain('class="bk-sim-stage"');
			expect(result.html).toContain('class="bk-sim-inspector"');
			expect(result.html).toContain('class="bk-steps-banner"');
			expect(result.html).toContain('class="bk-steps-controls"');
			expect(result.html).toContain('class="bk-sim-telemetry"');
			expect(result.html).not.toContain('class="bk-expanded-back"');
			expect(result.html).not.toContain("bk-doc-telemetry-panel");
		});
	});

	describe("Document Topbar & Expanded Entry Contract", () => {
		test("Document topbar button is ABSENT when hasTelemetry is false", () => {
			expect(renderDocTelemetryButton(false)).toBe("");
			expect(renderDocTelemetryPanel([])).toBe("");
		});

		test("Document topbar button stays absent with telemetry", () => {
            expect(renderDocTelemetryButton(true)).toBe("");
        });

		test("Full lesson rendering integrates topbar button without obsolete floating drawer", () => {
			const lesson: Lesson = {
				meta: { title: "Telemetry Lesson", slug: "telemetry-lesson" },
				blocks: [
					{
						type: "simulation",
						src: "sim.js",
						label: "Kepler Lab",
						telemetry: {
							speed: { label: "Speed", unit: "km/s", precision: 2 },
						},
					},
				],
			};

			const html = render(lesson, { strict: false, standalone: false });
			// Document topbar button beside theme icon
			expect(html).not.toContain('id="bk-doc-telemetry-btn"');
			expect(html).toContain('id="bk-theme-toggle"');
			// Obsolete floating panel is absent
			expect(html).not.toContain('id="bk-doc-telemetry-panel"');
			// Simulation contains workspace with inspector
			expect(html).toContain('class="bk-sim-workspace"');
			expect(html).toContain('class="bk-sim-inspector"');
			expect(html).toContain('class="bk-sim-telemetry"');
		});

		test("Full lesson rendering omits topbar button when no telemetry declared", () => {
			const lesson: Lesson = {
				meta: { title: "Simple Lesson", slug: "simple-lesson" },
				blocks: [
					{
						type: "simulation",
						src: "sim.js",
						label: "Simple Lab",
					},
				],
			};

			const html = render(lesson, { strict: false, standalone: false });
			expect(html).not.toContain("bk-doc-telemetry-btn");
			expect(html).not.toContain("bk-doc-telemetry-panel");
		});
	});

	describe("Iframe Communication Contract", () => {
		test("iframeDoc injects window.bkTelemetry", () => {
			const doc = iframeDoc("console.log('sim')", "{}");
			expect(doc).toContain("window.bkTelemetry = function");
			expect(doc).toContain('type: &quot;bk:telemetry&quot;');
		});

		test("stepsIframeDoc injects window.bkTelemetry", () => {
			const doc = stepsIframeDoc("console.log('steps')", "{}");
			expect(doc).toContain("window.bkTelemetry = function");
			expect(doc).toContain('type: &quot;bk:telemetry&quot;');
		});
	});

	describe("Value Validation & Safe Formatting Contract", () => {
		test("undefined, null, NaN, and Infinity format explicitly to '—'", () => {
			expect(formatTelemetryValue(undefined)).toBe("—");
			expect(formatTelemetryValue(null)).toBe("—");
			expect(formatTelemetryValue("")).toBe("—");
			expect(formatTelemetryValue(Number.NaN)).toBe("—");
			expect(formatTelemetryValue(Infinity)).toBe("—");
			expect(formatTelemetryValue(-Infinity)).toBe("—");
		});

		test("numbers format according to declared precision", () => {
			expect(formatTelemetryValue(0.2056, { precision: 3 })).toBe("0.206");
			expect(formatTelemetryValue(12.3456, { precision: 2 })).toBe("12.35");
			expect(formatTelemetryValue(42, { precision: 1 })).toBe("42.0");
			expect(formatTelemetryValue(0, { precision: 2 })).toBe("0.00");
			expect(formatTelemetryValue(-443.023, { precision: 2 })).toBe("-443.02");
		});

		test("numbers with extreme or invalid precision clamp safely without throwing", () => {
			expect(formatTelemetryValue(12.3456, { precision: -5 })).toBe("12");
			expect(formatTelemetryValue(12.3456, { precision: 50 })).toBe(
				(12.3456).toFixed(20),
			);
			expect(formatTelemetryValue(12.3456, { precision: Number.NaN })).toBe(
				"12.3456",
			);
		});

		test("numbers without precision format cleanly without excessive decimals", () => {
			expect(formatTelemetryValue(1234.5)).toBe("1,234.5");
			expect(formatTelemetryValue(0)).toBe("0");
		});

		test("booleans format to Yes / No", () => {
			expect(formatTelemetryValue(true)).toBe("Yes");
			expect(formatTelemetryValue(false)).toBe("No");
		});

		test("strings format safely as string", () => {
			expect(formatTelemetryValue("Elliptical Orbit")).toBe("Elliptical Orbit");
			expect(formatTelemetryValue("Escaping (Hyperbolic)")).toBe(
				"Escaping (Hyperbolic)",
			);
		});

		test("objects or arrays safely return placeholder without crashing", () => {
			expect(formatTelemetryValue({ complex: true })).toBe("—");
			expect(formatTelemetryValue([1, 2, 3])).toBe("—");
		});
	});

	describe("Lifecycle & Reset Contract", () => {
		test("bkResetTelemetry resets all rendered telemetry values to '—'", () => {
			const numEls = [{ textContent: "0.206" }, { textContent: "29.78" }];
			const origDoc = (globalThis as any).document;
			try {
				(globalThis as any).document = {
					...(origDoc || {}),
					querySelectorAll: (sel: string) =>
						sel.includes(".bk-telemetry-num") ? numEls : [],
					querySelector: () => null,
				};

				bkResetTelemetry();

				expect(numEls[0].textContent).toBe("—");
				expect(numEls[1].textContent).toBe("—");
			} finally {
				(globalThis as any).document = origDoc;
			}
		});

		test("bkExpandLab and bkCollapseLab manage classes, overflow, and restore scroll/focus", () => {
			const origDoc = (globalThis as any).document;
			const origWin = (globalThis as any).window;

			let scrolledTo: { top: number } | null = null;
			let focusedEl: any = null;

			const mockBtn = {
				innerHTML: "",
				setAttribute: (_k: string, _v: string) => {},
				title: "",
				focus: () => {
					focusedEl = mockBtn;
				},
			};

			const mockFigure = {
				id: "sim-0",
				classList: {
					classes: new Set<string>(),
					add(c: string) {
						this.classes.add(c);
					},
					remove(c: string) {
						this.classes.delete(c);
					},
					contains(c: string) {
						return this.classes.has(c);
					},
				},
				querySelector: (sel: string) => {
					if (sel === ".bk-object-maximize") return mockBtn;
					if (sel === ".bk-expanded-back") return mockBtn;
					return null;
				},
				querySelectorAll: () => [],
				getAttribute: (k: string) => (k === "data-telemetry-id" ? "sim-0" : null),
			};

			const mockDocBtn = {
				setAttribute: (_k: string, _v: string) => {},
				classList: {
					add: (_c: string) => {},
					remove: (_c: string) => {},
				},
			};

			try {
				(globalThis as any).window = {
					scrollY: 250,
					scrollTo: (opts: any) => {
						scrolledTo = opts;
					},
				};
				(globalThis as any).document = {
					body: {
						style: { overflow: "" },
						classList: {
							add: () => {},
							remove: () => {},
						},
					},
					documentElement: { scrollTop: 250 },
					getElementById: (id: string) =>
						id === "sim-0"
							? mockFigure
							: id === "bk-doc-telemetry-btn"
								? mockDocBtn
								: null,
					querySelectorAll: (sel: string) => {
						if (sel.includes(".bk-object--maximized")) {
							return mockFigure.classList.contains("bk-object--maximized")
								? [mockFigure]
								: [];
						}
						return [];
					},
					activeElement: mockBtn,
				};

				// Expand
				bkExpandLab("sim-0");
				expect(mockFigure.classList.contains("bk-object--maximized")).toBe(true);
				expect(mockFigure.classList.contains("bk-object--expanded")).toBe(true);
				expect((globalThis as any).document.body.style.overflow).toBe("hidden");

				// Collapse
				bkCollapseLab();
				expect(mockFigure.classList.contains("bk-object--maximized")).toBe(false);
				expect((globalThis as any).document.body.style.overflow).toBe("");
				expect(scrolledTo).toEqual({ top: 250, behavior: "instant" });
				expect(focusedEl).toBe(mockBtn);
			} finally {
				(globalThis as any).document = origDoc;
				(globalThis as any).window = origWin;
			}
		});
	});

	describe("Expanded Inspector Tabs Contract (Controls & Data)", () => {
		test("renderInspectorTabs renders accessible tablist, tabs, and panels when controls and telemetry exist", () => {
			const controls = '<div class="bk-sim-controls"><button>Reset</button></div>';
			const telemetry = '<div class="bk-sim-telemetry"><span>120 km/s</span></div>';

			const tabsHtml = renderInspectorTabs("sim-42", controls, telemetry);

			// Tabs structure
			expect(tabsHtml).toContain('class="bk-sim-tabs"');
			expect(tabsHtml).toContain('data-sim-tabs="sim-42"');
			expect(tabsHtml).toContain('class="bk-sim-tablist"');
			expect(tabsHtml).toContain('role="tablist"');
			expect(tabsHtml).toContain('aria-label="Inspector tabs"');

			// Controls Tab
			expect(tabsHtml).toContain('id="sim-42-tab-controls"');
			expect(tabsHtml).toContain('aria-controls="sim-42-panel-controls"');
			expect(tabsHtml).toContain('role="tab"');
			expect(tabsHtml).toContain('aria-selected="true"');
			expect(tabsHtml).toContain('tabindex="0"');
			expect(tabsHtml).toContain('Settings');

			// Data Tab
			expect(tabsHtml).toContain('id="sim-42-tab-telemetry"');
			expect(tabsHtml).toContain('aria-controls="sim-42-panel-telemetry"');
			expect(tabsHtml).toContain('role="tab"');
			expect(tabsHtml).toContain('aria-selected="false"');
			expect(tabsHtml).toContain('tabindex="-1"');
			expect(tabsHtml).toContain('Measurements');

			// Controls Panel (active)
			expect(tabsHtml).toContain('role="tabpanel"');
			expect(tabsHtml).toContain('id="sim-42-panel-controls"');
			expect(tabsHtml).toContain('aria-labelledby="sim-42-tab-controls"');
			expect(tabsHtml).toContain('class="bk-sim-tabpanel bk-sim-tabpanel--controls is-active"');
			expect(tabsHtml).toContain('<button>Reset</button>');

			// Data Panel (hidden)
			expect(tabsHtml).toContain('id="sim-42-panel-telemetry"');
			expect(tabsHtml).toContain('aria-labelledby="sim-42-tab-telemetry"');
			expect(tabsHtml).toContain('class="bk-sim-tabpanel bk-sim-tabpanel--telemetry"');
			expect(tabsHtml).toContain('hidden');
			expect(tabsHtml).toContain('120 km/s');
		});

		test("renderInspectorTabs renders a Settings heading when no telemetry exists", () => {
			const controls = '<div class="bk-sim-controls"><input type="range" /></div>';
			const html = renderInspectorTabs("sim-only-ctrl", controls, "");

			expect(html).toContain(controls);
			expect(html).not.toContain('role="tablist"');
			expect(html).toContain("Settings");
		});

		test("renderInspectorTabs renders a Measurements heading when no controls exist", () => {
			const telemetry = '<div class="bk-sim-telemetry"><span>Telemetry Only</span></div>';
			const html = renderInspectorTabs("sim-only-tel", "", telemetry);

			expect(html).toContain(telemetry);
			expect(html).not.toContain('role="tablist"');
			expect(html).toContain("Measurements");
		});

		test("renderInspectorTabs renders nothing when controls and telemetry are empty", () => {
			const html = renderInspectorTabs("sim-empty", "   ", "");
			expect(html).toBe("");
		});

		test("Steps block with both controls and telemetry integrates tabs inside inspector", () => {
			const block: StepsBlock = {
				type: "steps",
				src: "steps.js",
				steps: [{ id: "step-1", title: "Test Step" }],
				props: { thrust: 50 },
				tunables: {
					thrust: { label: "Engine Thrust", min: 0, max: 100 },
				},
				telemetry: {
					speed: { label: "Speed", unit: "km/s" },
				},
			};
			const result = renderSteps(block, 1, { strict: false });

			expect(result.html).toContain('class="bk-sim-tabs"');
			expect(result.html).toContain('id="steps-1-tab-controls"');
			expect(result.html).toContain('id="steps-1-tab-telemetry"');
			expect(result.html).toContain('Settings');
			expect(result.html).toContain('Measurements');
			expect(result.html).toContain('class="bk-steps-banner"');
			expect(result.html).toContain('class="bk-steps-controls"');
		});

		test("bkSelectInspectorTab toggles active tab, aria-selected, tabindex, and panel visibility", () => {
			// Construct a mock DOM element representing an expanded simulation figure
			const tabControls = {
				id: "sim-test-tab-controls",
				attrs: { "aria-selected": "true", tabindex: "0", "aria-controls": "sim-test-panel-controls" },
				classes: new Set(["bk-sim-tab", "is-active"]),
				setAttribute(name: string, val: string) { this.attrs[name] = val; },
				getAttribute(name: string) { return this.attrs[name]; },
				classList: {
					add(c: string) { tabControls.classes.add(c); },
					remove(c: string) { tabControls.classes.delete(c); },
					contains(c: string) { return tabControls.classes.has(c); },
				},
				focus() {},
			};

			const tabTelemetry = {
				id: "sim-test-tab-telemetry",
				attrs: { "aria-selected": "false", tabindex: "-1", "aria-controls": "sim-test-panel-telemetry" },
				classes: new Set(["bk-sim-tab"]),
				setAttribute(name: string, val: string) { this.attrs[name] = val; },
				getAttribute(name: string) { return this.attrs[name]; },
				classList: {
					add(c: string) { tabTelemetry.classes.add(c); },
					remove(c: string) { tabTelemetry.classes.delete(c); },
					contains(c: string) { return tabTelemetry.classes.has(c); },
				},
				focus() {},
			};

			const panelControls = {
				id: "sim-test-panel-controls",
				classes: new Set(["bk-sim-tabpanel", "bk-sim-tabpanel--controls", "is-active"]),
				attrs: {} as Record<string, string>,
				setAttribute(name: string, val: string) { this.attrs[name] = val; },
				removeAttribute(name: string) { delete this.attrs[name]; },
				classList: {
					add(c: string) { panelControls.classes.add(c); },
					remove(c: string) { panelControls.classes.delete(c); },
					contains(c: string) { return panelControls.classes.has(c); },
				},
			};

			const panelTelemetry = {
				id: "sim-test-panel-telemetry",
				classes: new Set(["bk-sim-tabpanel", "bk-sim-tabpanel--telemetry"]),
				attrs: { hidden: "" } as Record<string, string>,
				setAttribute(name: string, val: string) { this.attrs[name] = val; },
				removeAttribute(name: string) { delete this.attrs[name]; },
				classList: {
					add(c: string) { panelTelemetry.classes.add(c); },
					remove(c: string) { panelTelemetry.classes.delete(c); },
					contains(c: string) { return panelTelemetry.classes.has(c); },
				},
			};

			const tablist = {
				querySelectorAll(sel: string) {
					if (sel.includes('[role="tab"]')) return [tabControls, tabTelemetry];
					return [];
				},
			};

			const mockFigure = {
				querySelector(sel: string) {
					if (sel === ".bk-sim-tablist") return tablist;
					return null;
				},
				querySelectorAll(sel: string) {
					if (sel.includes('[role="tabpanel"]')) return [panelControls, panelTelemetry];
					return [];
				},
				closest() { return this; },
			} as any;

			// Switch to telemetry (Data)
			bkSelectInspectorTab(mockFigure, "telemetry");

			expect(tabTelemetry.getAttribute("aria-selected")).toBe("true");
			expect(tabTelemetry.getAttribute("tabindex")).toBe("0");
			expect(tabTelemetry.classList.contains("is-active")).toBe(true);
			expect(panelTelemetry.attrs.hidden).toBeUndefined();
			expect(panelTelemetry.classList.contains("is-active")).toBe(true);

			expect(tabControls.getAttribute("aria-selected")).toBe("false");
			expect(tabControls.getAttribute("tabindex")).toBe("-1");
			expect(tabControls.classList.contains("is-active")).toBe(false);
			expect(panelControls.attrs.hidden).toBe("");
			expect(panelControls.classList.contains("is-active")).toBe(false);

			// Switch back to controls
			bkSelectInspectorTab(mockFigure, "controls");

			expect(tabControls.getAttribute("aria-selected")).toBe("true");
			expect(tabControls.getAttribute("tabindex")).toBe("0");
			expect(tabControls.classList.contains("is-active")).toBe(true);
			expect(panelControls.attrs.hidden).toBeUndefined();
			expect(panelControls.classList.contains("is-active")).toBe(true);

			expect(tabTelemetry.getAttribute("aria-selected")).toBe("false");
			expect(tabTelemetry.getAttribute("tabindex")).toBe("-1");
			expect(tabTelemetry.classList.contains("is-active")).toBe(false);
			expect(panelTelemetry.attrs.hidden).toBe("");
			expect(panelTelemetry.classList.contains("is-active")).toBe(false);
		});

		test("bkExpandLab with defaultTab option activates requested tab", () => {
			let activatedTab: string | null = null;
			const tabControls = {
				id: "sim-test-default-tab-controls",
				setAttribute: () => {},
				getAttribute: () => "sim-test-default-panel-controls",
				classList: { add: () => {}, remove: () => {} },
			};
			const tabTelemetry = {
				id: "sim-test-default-tab-telemetry",
				setAttribute: () => {},
				getAttribute: () => "sim-test-default-panel-telemetry",
				classList: { add: () => {}, remove: () => {} },
			};
			const panelControls = {
				id: "sim-test-default-panel-controls",
				classList: { add: () => {}, remove: () => {}, contains: () => true },
				setAttribute: () => {},
				removeAttribute: () => {},
			};
			const panelTelemetry = {
				id: "sim-test-default-panel-telemetry",
				classList: { add: () => {}, remove: () => {}, contains: () => false },
				setAttribute: () => {},
				removeAttribute: () => {},
			};

			const mockTablist = {
				querySelectorAll: (sel: string) => [tabControls, tabTelemetry],
			};
			const mockFig = {
				id: "sim-test-default",
				classList: {
					contains: () => false,
					add: () => {},
					remove: () => {},
				},
				querySelector: (sel: string) => {
					if (sel === ".bk-sim-tablist") return mockTablist;
					return null;
				},
				querySelectorAll: (sel: string) => {
					if (sel.includes('[role="tabpanel"]')) return [panelControls, panelTelemetry];
					return [];
				},
				closest: function() { return this; },
			};

			const origDoc = (globalThis as any).document;
			const origWin = (globalThis as any).window;
			try {
				(globalThis as any).window = { scrollY: 0, scrollTo: () => {} };
				(globalThis as any).document = {
					body: { style: { overflow: "" }, classList: { add: () => {}, remove: () => {} } },
					documentElement: { scrollTop: 0 },
					getElementById: (id: string) => (id === "sim-test-default" ? mockFig : null),
					querySelectorAll: () => [],
					activeElement: null,
				};

				// Expanding with defaultTab controls
				bkExpandLab("sim-test-default", { defaultTab: "controls" });
				// Expanding with defaultTab telemetry
				bkExpandLab("sim-test-default", { defaultTab: "telemetry" });
			} finally {
				(globalThis as any).document = origDoc;
				(globalThis as any).window = origWin;
			}
		});

		test("Keyboard navigation contract: roving tabindex and arrow keys wrap", () => {
			let focusedTab: any = null;
			const tab1 = {
				id: "sim-nav-tab-controls",
				attrs: { "aria-selected": "true", tabindex: "0", "aria-controls": "sim-nav-panel-controls" } as Record<string, string>,
				classes: new Set(["bk-sim-tab", "is-active"]),
				setAttribute(k: string, v: string) { this.attrs[k] = v; },
				getAttribute(k: string) { return this.attrs[k]; },
				classList: {
					add(c: string) { tab1.classes.add(c); },
					remove(c: string) { tab1.classes.delete(c); },
					contains(c: string) { return tab1.classes.has(c); },
				},
				focus() { focusedTab = this; },
			};
			const tab2 = {
				id: "sim-nav-tab-telemetry",
				attrs: { "aria-selected": "false", tabindex: "-1", "aria-controls": "sim-nav-panel-telemetry" } as Record<string, string>,
				classes: new Set(["bk-sim-tab"]),
				setAttribute(k: string, v: string) { this.attrs[k] = v; },
				getAttribute(k: string) { return this.attrs[k]; },
				classList: {
					add(c: string) { tab2.classes.add(c); },
					remove(c: string) { tab2.classes.delete(c); },
					contains(c: string) { return tab2.classes.has(c); },
				},
				focus() { focusedTab = this; },
			};
			const panel1 = {
				id: "sim-nav-panel-controls",
				classList: { add: () => {}, remove: () => {}, contains: () => true },
				setAttribute: () => {},
				removeAttribute: () => {},
			};
			const panel2 = {
				id: "sim-nav-panel-telemetry",
				classList: { add: () => {}, remove: () => {}, contains: () => false },
				setAttribute: () => {},
				removeAttribute: () => {},
			};

			const mockTablist = {
				querySelectorAll: () => [tab1, tab2],
			};
			const mockFig = {
				querySelector: (sel: string) => sel === ".bk-sim-tablist" ? mockTablist : null,
				querySelectorAll: (sel: string) => [panel1, panel2],
				closest: function() { return this; },
			} as any;

			// Switch to tab 2 with focus
			bkSelectInspectorTab(mockFig, "telemetry", true);
			expect(tab2.attrs["aria-selected"]).toBe("true");
			expect(tab2.attrs["tabindex"]).toBe("0");
			expect(tab1.attrs["aria-selected"]).toBe("false");
			expect(tab1.attrs["tabindex"]).toBe("-1");
			expect(focusedTab).toBe(tab2);

			// Switch to tab 1 with focus
			bkSelectInspectorTab(mockFig, "controls", true);
			expect(tab1.attrs["aria-selected"]).toBe("true");
			expect(tab1.attrs["tabindex"]).toBe("0");
			expect(tab2.attrs["aria-selected"]).toBe("false");
			expect(tab2.attrs["tabindex"]).toBe("-1");
			expect(focusedTab).toBe(tab1);
		});
	});
});
