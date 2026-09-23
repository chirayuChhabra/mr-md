import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "@11ty/gray-matter";
import { logger } from "./logger.js";

import pkg from "../../package.json" with { type: "json" };

export const SIMULATION_SKILL_NAME = "mr-md-simulations";

// For local testing, allow override. Otherwise, strictly pin to the exact git tag 
// that matches this npm package version (e.g., v4.0.0-beta.1) to guarantee sync.
const gitRef = process.env.MR_MD_SKILL_REF || `v${pkg.version}`;
export const SIMULATION_SKILL_SOURCE = `chirayuChhabra/mr-md#${gitRef}`;

const HELP = `Usage: mr-md skill <command>

Commands:
  install    Install the skill globally into selected coding agents
  update     Update the globally installed skill
  status     Show installation, version, source, and target agents
  version    Alias for status
  remove     Remove the globally installed skill

Examples:
  bunx mr-md skill install
  bunx mr-md skill status
  bunx mr-md skill update`;

type ManagedAction = "install" | "update" | "remove";

export interface InstalledSkill {
	name: string;
	path: string;
	scope: string;
	agents?: string[];
	source?: string | null;
	sourceUrl?: string | null;
	sourceType?: string | null;
}

export function buildSkillsCliArgs(
	action: ManagedAction,
	extraArgs: string[] = [],
): string[] {
	switch (action) {
		case "install":
			return [
				"x",
				"skills",
				"add",
				SIMULATION_SKILL_SOURCE,
				"--skill",
				SIMULATION_SKILL_NAME,
				"--global",
				...extraArgs,
			];
		case "update":
			return [
				"x",
				"skills",
				"update",
				SIMULATION_SKILL_NAME,
				"--global",
				...extraArgs,
			];
		case "remove":
			return [
				"x",
				"skills",
				"remove",
				SIMULATION_SKILL_NAME,
				"--global",
				...extraArgs,
			];
	}
}

export async function readSkillVersion(
	skillPath: string,
): Promise<string | null> {
	try {
		const manifest = await readFile(join(skillPath, "SKILL.md"), "utf8");
		const data = matter(manifest).data as {
			metadata?: { version?: unknown };
		};
		return typeof data.metadata?.version === "string"
			? data.metadata.version
			: null;
	} catch {
		return null;
	}
}

function printableCommand(args: string[]): string {
	return ["bun", ...args].join(" ");
}

async function runSkillsCli(
	args: string[],
	options: { capture?: boolean } = {},
): Promise<string> {
	const capture = options.capture ?? false;
	const child = spawn(process.execPath, args, {
		stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit",
	});

	let stdout = "";
	let stderr = "";
	if (capture) {
		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr?.on("data", (chunk: string) => {
			stderr += chunk;
		});
	}

	const exitCode = await new Promise<number>((resolve, reject) => {
		child.once("error", reject);
		child.once("close", (code) => resolve(code ?? 1));
	});

	if (exitCode !== 0) {
		throw new Error(
			stderr.trim() ||
				`Skills CLI exited with code ${exitCode}: ${printableCommand(args)}`,
		);
	}
	return stdout;
}

async function showStatus(): Promise<void> {
	const output = await runSkillsCli(
		["x", "skills", "list", "--global", "--json"],
		{ capture: true },
	);
	let installed: InstalledSkill[];
	try {
		installed = JSON.parse(output) as InstalledSkill[];
	} catch {
		throw new Error("The Skills CLI returned an unreadable status response.");
	}

	const skill = installed.find((entry) => entry.name === SIMULATION_SKILL_NAME);
	if (!skill) {
		logger.info(
			`${SIMULATION_SKILL_NAME} is not installed globally.\nRun: bunx mr-md skill install`,
		);
		return;
	}

	const version = await readSkillVersion(skill.path);
	const agents = skill.agents?.length ? skill.agents.join(", ") : "Unknown";
	const source = skill.source ?? skill.sourceUrl ?? "Unknown";
	logger.info(
		[
			`${SIMULATION_SKILL_NAME}${version ? ` v${version}` : ""}`,
			`Scope: ${skill.scope}`,
			`Agents: ${agents}`,
			`Source: ${source}`,
			`Path: ${skill.path}`,
		].join("\n"),
	);
}

export async function runSkill(args: string[]): Promise<void> {
	const action = args[0];
	const extraArgs = args.slice(1);

	if (!action || action === "--help" || action === "-h" || action === "help") {
		logger.info(HELP);
		return;
	}

	if (action === "status" || action === "version") {
		await showStatus();
		return;
	}

	if (action !== "install" && action !== "update" && action !== "remove") {
		throw new Error(`Unknown skill command: ${action}\n\n${HELP}`);
	}

	const command = buildSkillsCliArgs(action, extraArgs);
	const verbs: Record<ManagedAction, string> = {
		install: "Installing",
		update: "Updating",
		remove: "Removing",
	};
	logger.info(
		`${verbs[action]} ${SIMULATION_SKILL_NAME} through the Agent Skills CLI.\nRunning: ${printableCommand(command)}`,
	);
	await runSkillsCli(command);
}
