import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LessonBlocks } from "../src/builder/LessonBlocks.js";
import { parseLesson } from "../src/parser/mdx.js";
import {
	readSimulationConfig,
	simulationConfigJsonSchema,
	SimulationConfigError,
	validateSimulationConfig,
} from "../src/simulation-config.js";

test("validates defaults, typed choices, range bounds and advanced names with field diagnostics", () => {
	const config = {
		props: { speed: 9, enabled: "yes", choice: "1" },
		tunables: {
			speed: { type: "range", min: 0, max: 5 },
			enabled: { type: "boolean" },
			choice: { type: "select", options: [{ label: "One", value: 1 }] },
			missing: { type: "text" },
		},
		advancedControls: ["typo"],
	};
	try {
		validateSimulationConfig(config, "orbits.config.json");
		throw new Error("Expected validation failure");
	} catch (error) {
		expect(error).toBeInstanceOf(SimulationConfigError);
		const failure = error as SimulationConfigError;
		expect(failure.code).toBe("INVALID_SIMULATION_CONFIG");
		expect(failure.message).toContain("orbits.config.json");
		expect(failure.issues.map((issue) => issue.field)).toEqual([
			"tunables.speed",
			"tunables.enabled",
			"tunables.choice",
			"tunables.missing",
			"advancedControls",
		]);
	}
});

test("accepts world and guided configs and checks per-step initial values", () => {
	expect(
		validateSimulationConfig({
			type: "world",
			props: { mode: false },
			tunables: {
				mode: { type: "segmented", options: [{ label: "Off", value: false }] },
			},
		}).type,
	).toBe("world");
	expect(() =>
		validateSimulationConfig({
			type: "steps",
			props: { speed: 1 },
			steps: [
				{
					initialProps: { speed: 4 },
					tunables: { speed: { type: "range", max: 3 } },
				},
			],
		}),
	).toThrow("steps.0.tunables.speed");
});

test("schema supports editor completion without runtime-only refinements", () => {
	expect(simulationConfigJsonSchema.properties).toHaveProperty("tunables");
	expect(simulationConfigJsonSchema.properties).toHaveProperty("$schema");
	expect(JSON.stringify(simulationConfigJsonSchema)).toContain("segmented");
});

test("invalid sibling JSON is reported by both Markdown and builder entry points", async () => {
	const dir = mkdtempSync(join(tmpdir(), "mr-config-"));
	class Blocks extends LessonBlocks {
		protected get contentBase() {
			return dir;
		}
	}
	try {
		writeFileSync(
			join(dir, "sample.js"),
			"window.bkSetup(800, 500, () => {});",
		);
		writeFileSync(
			join(dir, "sample.config.json"),
			JSON.stringify({ type: "block", tunables: { speed: { type: "range" } } }),
		);
		writeFileSync(
			join(dir, "lesson.md"),
			"# Validation\n\n![Sample](./sample.js)\n",
		);
		expect(() => new Blocks().simulation("sample.js")).toThrow(
			"sample.config.json",
		);
		expect(() =>
			parseLesson(
				"# Validation\n\n![Sample](./sample.js)\n",
				{ contentBase: dir },
				dir,
			),
		).toThrow("Missing default in props.speed");
		writeFileSync(join(dir, "sample.config.json"), "{");
		expect(() => readSimulationConfig(join(dir, "sample.config.json"))).toThrow(
			SimulationConfigError,
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("inline builder options are validated after merging defaults", () => {
	class Blocks extends LessonBlocks {
		protected get contentBase() {
			return undefined;
		}
	}
	expect(() =>
		new Blocks().simulation("inline.js", {
			props: { speed: 10 },
			tunables: { speed: { type: "range", max: 5 } },
		}),
	).toThrow("Default 10 exceeds maximum 5");
});

test("validates measurements config, plot bounds, unique ids, and bindings", () => {
	// Valid measurements
	const config = validateSimulationConfig({
		props: {},
		measurements: {
			badge: "count",
			plots: [
				{
					id: "p1",
					title: "Line Plot",
					type: "line",
					x: "t",
					y: "val",
					xMin: 0,
					xMax: 10,
					yMin: -5,
					yMax: 5,
					maxPoints: 300,
					sampleMs: 16,
				},
				{
					id: "p2",
					type: "bar",
					data: "histogram",
				},
				{
					id: "p3",
					type: "vector-field",
					data: "flow",
				},
			],
		},
	});
	expect(config.measurements?.badge).toBe("count");
	expect(config.measurements?.plots?.length).toBe(3);

	// Duplicate plot ID
	expect(() =>
		validateSimulationConfig({
			measurements: {
				plots: [
					{ id: "duplicate-id", type: "line", y: "a" },
					{ id: "duplicate-id", type: "scatter", y: "b" },
				],
			},
		}),
	).toThrow("Duplicate plot id");

	// Invalid xMin >= xMax
	expect(() =>
		validateSimulationConfig({
			measurements: {
				plots: [{ id: "bad-bounds", type: "line", y: "a", xMin: 10, xMax: 5 }],
			},
		}),
	).toThrow("xMin (10) must be strictly less than xMax (5)");

	// Invalid yMin >= yMax
	expect(() =>
		validateSimulationConfig({
			measurements: {
				plots: [{ id: "bad-y", type: "line", y: "a", yMin: 20, yMax: 20 }],
			},
		}),
	).toThrow("yMin (20) must be strictly less than yMax (20)");

	// Missing data binding on vector-field
	expect(() =>
		validateSimulationConfig({
			measurements: {
				plots: [{ id: "vf-bad", type: "vector-field" }],
			},
		}),
	).toThrow("vector-field plot requires a data dataset binding");

	// Telemetry range rule: min >= max
	expect(() =>
		validateSimulationConfig({
			telemetry: {
				rpm: {
					ranges: [{ min: 5000, max: 4000, tone: "danger" }],
				},
			},
		}),
	).toThrow("Minimum 5000 must be strictly less than maximum 4000");

	// Schema contains measurements
	expect(simulationConfigJsonSchema.properties).toHaveProperty("measurements");
});
