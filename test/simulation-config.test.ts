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

test("validates measurement rules and preserves optional fields", () => {
	const item = { states: [{ when: { op: "gt", value: 2 }, tone: "warning" }], notifications: [{ id: "hot", when: { op: "eq", value: true }, message: "Hot", once: false, cooldown: 2 }], graph: true, scene: "view", changeThreshold: 0 };
	expect(validateSimulationConfig({ telemetry: { temperature: item } }).telemetry?.temperature).toEqual(item);
	for (const invalid of [
		{ states: [{ when: { op: "gt", value: "2" }, tone: "warning" }] },
		{ changeThreshold: -1 },
		{ notifications: [{ id: "a", when: { op: "eq", value: 1 }, message: "x", cooldown: -1 }] },
		{ notifications: [{ id: "a", when: { op: "eq", value: 1 }, message: "x" }, { id: "a", when: { op: "eq", value: 2 }, message: "y" }] },
	]) expect(() => validateSimulationConfig({ telemetry: { temperature: invalid } })).toThrow(SimulationConfigError);
});

test("supports concise timeline config with capture default and top-level normalization", () => {
	// Concise boolean at root level
	const rootBoolean = validateSimulationConfig({ timeline: true });
	expect(rootBoolean.timeline).toBe(true);
	expect(rootBoolean.measurements?.timeline).toBe(true);

	// Concise object with capture at root level
	const rootObject = validateSimulationConfig({ timeline: { capture: true } });
	expect(rootObject.timeline).toEqual({ capture: true });
	expect(rootObject.measurements?.timeline).toEqual({ capture: true });

	// Explicit measurements.timeline
	const nestedBoolean = validateSimulationConfig({ measurements: { timeline: true } });
	expect(nestedBoolean.measurements?.timeline).toBe(true);

	const nestedObject = validateSimulationConfig({
		measurements: {
			timeline: { start: true, present: true, controls: true, capture: true },
		},
	});
	expect(nestedObject.measurements?.timeline).toEqual({
		start: true,
		present: true,
		controls: true,
		capture: true,
	});

	// Preserves existing measurements while normalizing root timeline
	const withExistingMeasurements = validateSimulationConfig({
		timeline: true,
		measurements: { initialTab: "timeline" },
	});
	expect(withExistingMeasurements.measurements?.timeline).toBe(true);
	expect(withExistingMeasurements.measurements?.initialTab).toBe("timeline");

	// Invalid timeline configurations throw SimulationConfigError
	for (const invalid of [
		{ timeline: "active" },
		{ timeline: { capture: "yes" } },
		{ measurements: { timeline: 42 } },
		{ measurements: { timeline: { start: "no" } } },
	]) {
		expect(() => validateSimulationConfig(invalid as any)).toThrow(SimulationConfigError);
	}
});
