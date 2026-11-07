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
