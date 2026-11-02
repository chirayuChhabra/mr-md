import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	buildSkillsCliArgs,
	readSkillVersion,
	runSkill,
	SIMULATION_SKILL_NAME,
	SIMULATION_SKILL_SOURCE,
} from "../src/cli/skill.js";

describe("skill CLI", () => {
	test("rejects obsolete management commands", async () => {
		for (const action of ["update", "remove", "version"]) {
			await expect(runSkill([action])).rejects.toThrow(`Unknown skill command: ${action}`);
		}
	});
	test("builds the global install command", () => {
		expect(buildSkillsCliArgs("install")).toEqual([
			"x",
			"skills",
			"add",
			SIMULATION_SKILL_SOURCE,
			"--skill",
			SIMULATION_SKILL_NAME,
			"--global",
		]);
	});


	test("forwards Agent Skills CLI options", () => {
		expect(buildSkillsCliArgs("install", ["--agent", "codex", "--yes"])).toEqual([
			"x",
			"skills",
			"add",
			SIMULATION_SKILL_SOURCE,
			"--skill",
			SIMULATION_SKILL_NAME,
			"--global",
			"--agent",
			"codex",
			"--yes",
		]);
	});

	test("reads the installed skill metadata version", async () => {
		const directory = await mkdtemp(join(tmpdir(), "mr-md-skill-test-"));
		try {
			await writeFile(
				join(directory, "SKILL.md"),
				`---
name: mr-md-simulations
description: Test skill.
metadata:
  version: "1.3.0"
---
`,
			);
			expect(await readSkillVersion(directory)).toBe("1.3.0");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
