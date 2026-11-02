import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "path";
import { LessonBlocks } from "../src/builder/LessonBlocks.js";
import { parseLesson } from "../src/parser/mdx.js";
import { stepsIframeDoc } from "../src/renderer/blocks/steps-iframe.js";
import { renderSteps } from "../src/renderer/blocks/steps.js";
import type { BuildOptions, StepsBlock } from "../src/types.js";

class TestLesson extends LessonBlocks {
	constructor(private base?: string) {
		super();
	}
	protected get contentBase() {
		return this.base;
	}
	getBlocks() {
		return this.blocks;
	}
}

describe("Step-by-Step Simulation Framework", () => {
	let testDir: string;
	let options: BuildOptions;

	beforeEach(async () => {
		testDir = await mkdtemp(path.join(tmpdir(), "mr-md-steps-"));
		options = { contentBase: testDir, strict: true };
	});

	afterEach(async () => {
		if (testDir) {
			await rm(testDir, { recursive: true, force: true }).catch(() => {});
		}
	});

	describe("Parser Detection", () => {
		test("parses standard .js with type: 'steps' as steps block", () => {
			const simPath = path.join(testDir, "orbit.js");
			fs.writeFileSync(simPath, "window.bkSetup(800, 450, () => {});");

			const configPath = path.join(testDir, "orbit.config.json");
			fs.writeFileSync(
				configPath,
				JSON.stringify({
					label: "Orbital Lab",
					caption: "Explore gravity",
					type: "steps",
					steps: [
						{
							id: "step-1",
							title: "Step 1: Enter Orbit",
							instruction: "Reach orbital velocity",
							feedback: "Orbit achieved!",
							hint: "Aim sideways",
						},
					],
				}),
			);

			const md = `
# Lesson Title
![Orbital Lab](./orbit.js)
`;
			const lesson = parseLesson(md, { contentBase: testDir });
			expect(lesson.blocks.length).toBeGreaterThan(0);
			const stepsBlock = lesson.blocks.find(
				(b) => b.type === "steps",
			) as StepsBlock;
			expect(stepsBlock).toBeDefined();
			expect(stepsBlock.label).toBe("Orbital Lab");
			expect(stepsBlock.steps?.length).toBe(1);
			expect(stepsBlock.steps?.[0].title).toBe("Step 1: Enter Orbit");
		});

		test("strictly ignores steps array if type is not 'steps'", () => {
			const simPath = path.join(testDir, "normal.js");
			fs.writeFileSync(simPath, "// normal sim");

			const configPath = path.join(testDir, "normal.config.json");
			fs.writeFileSync(
				configPath,
				JSON.stringify({
					label: "Normal Sandbox",
					steps: [{ title: "Ignored Step without type: steps" }],
				}),
			);

			const md = `
# Normal Sim
![Normal](./normal.js)
`;
			const lesson = parseLesson(md, { contentBase: testDir });
			const simBlock = lesson.blocks.find((b) => b.type === "simulation");
			expect(simBlock).toBeDefined();
			expect(lesson.blocks.find((b) => b.type === "steps")).toBeUndefined();
		});

		test("strictly treats type: 'block' as standard simulation", () => {
			const simPath = path.join(testDir, "block.js");
			fs.writeFileSync(simPath, "// block sim");

			const configPath = path.join(testDir, "block.config.json");
			fs.writeFileSync(
				configPath,
				JSON.stringify({
					label: "Block Sandbox",
					type: "block",
					steps: [{ title: "Ignored" }],
				}),
			);

			const md = `
# Block Sim
![Block](./block.js)
`;
			const lesson = parseLesson(md, { contentBase: testDir });
			const simBlock = lesson.blocks.find((b) => b.type === "simulation");
			expect(simBlock).toBeDefined();
			expect(lesson.blocks.find((b) => b.type === "steps")).toBeUndefined();
		});
	});

	describe("Block Rendering", () => {
		test("renders complete steps chrome with hints, clickable dots, and iframe", () => {
			const simPath = path.join(testDir, "sim.js");
			fs.writeFileSync(simPath, "window.bkSetup(800, 450, () => {});");

			const block: StepsBlock = {
				type: "steps",
				src: "sim.js",
				label: "Space Exploration",
				steps: [
					{
						id: "step-1",
						title: "Step 1: Launch",
						target: "Target: Orbit",
						instruction: "Burn fuel **upward**",
						feedback: "Launch **success**!",
						hint: "Throttle up to 100%",
					},
					{
						id: "step-2",
						title: "Step 2: Transfer",
						instruction: "Align burn",
					},
				],
			};

			const result = renderSteps(block, 0, options);
			expect(result.html).toContain("bk-steps-object");
			expect(result.html).not.toContain("bk-challenge-object");
			expect(result.html).toContain("Space Exploration");
			expect(result.html).toContain("Step 1: Launch");
			expect(result.html).toContain("Target: Orbit");
			expect(result.html).toContain("Burn fuel <strong>upward</strong>");
			expect(result.html).toContain("bk-steps-btn--hint");
			expect(result.html).toContain("bk-steps-hint-popover");
			expect(result.html).toContain("Throttle up to 100%");
			// Without audio or voice declared, stays completely silent and omits audio button
			expect(result.html).not.toContain("bk-steps-btn--audio");

			// Dots must be interactive buttons
			expect(result.html).toContain(
				'<button type="button" class="bk-steps-dot is-active" data-step="0"',
			);
			expect(result.html).toContain(
				'<button type="button" class="bk-steps-dot" data-step="1"',
			);
		});

		test("resolves and copies custom step audio files to out/assets", () => {
			const simPath = path.join(testDir, "audio-sim.js");
			fs.writeFileSync(simPath, "window.bkSetup(800, 450, () => {});");

			const audioPath = path.join(testDir, "voice-step-1.mp3");
			fs.writeFileSync(audioPath, "fake-audio-bytes");

			const outDir = path.join(testDir, "out");
			const block: StepsBlock = {
				type: "steps",
				src: "audio-sim.js",
				label: "Audio Guided Lab",
				steps: [
					{
						id: "step-1",
						title: "Step 1",
						instruction: "Listen and learn",
						audio: "voice-step-1.mp3",
					},
				],
			};

			const result = renderSteps(block, 0, { ...options, outDir });
			expect(result.html).toContain("bk-steps-btn--audio");
			expect(result.html).toContain("assets/voice-step-1-");
			expect(result.html).toContain(".mp3");

			// Confirm asset was copied to assets directory
			const assetsDir = path.join(outDir, "assets");
			expect(fs.existsSync(assetsDir)).toBe(true);
			const copiedFiles = fs.readdirSync(assetsDir);
			expect(copiedFiles.some((f) => f.startsWith("voice-step-1-"))).toBe(true);
		});

		test("renders resilient instruction container even when step 0 has no instruction", () => {
			const simPath = path.join(testDir, "no-instruction-sim.js");
			fs.writeFileSync(simPath, "window.bkSetup(800, 450, () => {});");

			const block: StepsBlock = {
				type: "steps",
				src: "no-instruction-sim.js",
				label: "No Initial Instruction",
				steps: [
					{
						id: "step-1",
						title: "Step 1",
						// No instruction here
					},
					{
						id: "step-2",
						title: "Step 2",
						instruction: "Now do something",
					},
				],
			};

			const result = renderSteps(block, 0, options);
			expect(result.html).toContain("bk-steps-instruction");
			expect(result.html).toContain('style="display:none;"');
			expect(result.html).toContain("bk-steps-instruction-text");
		});

		test("strictly silences audio and strips voice when voice: false or audio: false", () => {
			const simPath = path.join(testDir, "silent-sim.js");
			fs.writeFileSync(simPath, "window.bkSetup(800, 450, () => {});");

			const block: StepsBlock = {
				type: "steps",
				src: "silent-sim.js",
				label: "Silent Lab",
				voice: false,
				audio: false,
				steps: [
					{
						id: "step-1",
						title: "Step 1",
						voice: "This should be silenced",
						audio: "some-audio.mp3",
					},
				],
			};

			const result = renderSteps(block, 0, options);
			expect(result.html).not.toContain("bk-steps-btn--audio");
			expect(result.html).not.toContain("This should be silenced");
		});
	});

	describe("Iframe Sandbox Doc", () => {
		test("injects bkOnStep, bkOnReset, initDraw, and error boundary", () => {
			const doc = stepsIframeDoc("console.log('sim')", "{}");
			expect(doc).toContain("window.bkOnStep");
			expect(doc).toContain("window.bkOnReset");
			expect(doc).toContain("window.bkCompleteStep");
			expect(doc).toContain("bk:steps-ready");
			expect(doc).toContain("initDraw");
			expect(doc).toContain("Simulation Error");
			expect(doc).toContain("unhandledrejection");
			expect(doc).toContain("Simulation Promise Rejection");
		});

		test("injects keyboard forwarding and flexible bkCompleteStep signature", () => {
			const doc = stepsIframeDoc("console.log('sim')", "{}");
			expect(doc).toContain("bk:steps-keydown");
			expect(doc).toContain("ArrowLeft");
			expect(doc).toContain("ArrowRight");
			expect(doc).toContain("voice: voice");
		});

		test("defaults loop to paused until activated and guarantees immediate step rendering", () => {
			const doc = stepsIframeDoc("console.log('sim')", "{}");
			expect(doc).toContain("window.__loop = false;");
			expect(doc).toContain("window.__renderFrame");
			expect(doc).toContain("window.__startLoop");
		});
	});

	describe("Builder API", () => {
		test("supports auto-routing in lab() when type: 'steps'", () => {
			const simPath = path.join(testDir, "flight.js");
			fs.writeFileSync(simPath, "// flight");
			const configPath = path.join(testDir, "flight.config.json");
			fs.writeFileSync(
				configPath,
				JSON.stringify({
					label: "Flight Simulation",
					type: "steps",
					steps: [{ title: "Step 1: Takeoff" }],
				}),
			);

			const lesson = new TestLesson(testDir);
			lesson.lab("flight.js");

			const blocks = lesson.getBlocks();
			expect(blocks.length).toBe(1);
			expect(blocks[0].type).toBe("steps");
			expect((blocks[0] as StepsBlock).label).toBe("Flight Simulation");
		});

		test("direct lesson.steps() builder adds steps block", () => {
			const simPath = path.join(testDir, "custom.js");
			fs.writeFileSync(simPath, "// custom");

			const lesson = new TestLesson(testDir);
			lesson.steps("custom.js", {
				label: "Direct Steps Call",
				steps: [{ title: "Step 1" }],
			});

			const blocks = lesson.getBlocks();
			expect(blocks.length).toBe(1);
			expect(blocks[0].type).toBe("steps");
			expect((blocks[0] as StepsBlock).label).toBe("Direct Steps Call");
		});

		test("routes lab() to standard simulation when type: 'steps' is omitted", () => {
			const simPath = path.join(testDir, "standard.js");
			fs.writeFileSync(simPath, "// standard");
			const configPath = path.join(testDir, "standard.config.json");
			fs.writeFileSync(
				configPath,
				JSON.stringify({
					label: "Standard Sandbox",
					steps: [{ title: "Step 1: Takeoff" }],
				}),
			);

			const lesson = new TestLesson(testDir);
			lesson.lab("standard.js");

			const blocks = lesson.getBlocks();
			expect(blocks.length).toBe(1);
			expect(blocks[0].type).toBe("simulation");
		});
	});
});
