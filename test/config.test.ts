import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	configToBuildOptions,
	discoverMarkdownFiles,
	ensureConfig,
	loadConfig,
	saveConfig,
} from "../src/config.js";
import type { MrmdConfig } from "../src/types.js";

describe("Config Engine", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = join(
			tmpdir(),
			`mr-md-config-test-${Math.random().toString(36).substring(7)}`,
		);
		await mkdir(tempDir, { recursive: true });
	});

	afterEach(async () => {
		if (tempDir) {
			await rm(tempDir, { recursive: true, force: true }).catch(() => {});
		}
	});

	test("loadConfig returns null when mrmd.config.json does not exist", () => {
		const config = loadConfig(tempDir);
		expect(config).toBeNull();
	});

	test("loadConfig parses and validates valid mrmd.config.json", async () => {
		const sampleConfig: MrmdConfig = {
			title: "Test Course",
			description: "A course description",
			author: "Tester",
			theme: "dark",
			palette: "ember",
			ui: "neo",
			lessons: ["01-intro.md", "02-advanced.md"],
			customPalettes: {
				cyberpunk: {
					name: "Cyberpunk",
					accent: "#00ff88",
					light: { bg: "#f0fff4" },
					dark: { bg: "#0a0f0c" },
				},
			},
		};

		await writeFile(
			join(tempDir, "mrmd.config.json"),
			JSON.stringify(sampleConfig, null, 2),
		);

		const loaded = loadConfig(tempDir);
		expect(loaded).not.toBeNull();
		expect(loaded?.title).toBe("Test Course");
		expect(loaded?.palette).toBe("ember");
		expect(loaded?.ui).toBe("neo");
		expect(loaded?.customPalettes?.cyberpunk?.accent).toBe("#00ff88");
	});

	test("saveConfig writes formatted JSON to mrmd.config.json", async () => {
		const config: MrmdConfig = {
			title: "Saved Title",
			palette: "lava",
			lessons: ["a.md", "b.md"],
		};

		saveConfig(tempDir, config);
		const filePath = join(tempDir, "mrmd.config.json");
		expect(existsSync(filePath)).toBe(true);

		const content = await readFile(filePath, "utf-8");
		expect(content).toContain('"title": "Saved Title"');
		expect(content).toContain('"palette": "lava"');
	});

	test("discoverMarkdownFiles finds and sorts .md files", async () => {
		await writeFile(join(tempDir, "02-second.md"), "# Second");
		await writeFile(join(tempDir, "01-first.md"), "# First");
		await writeFile(join(tempDir, "other.txt"), "Ignore me");

		const files = discoverMarkdownFiles(tempDir);
		expect(files).toEqual(["01-first.md", "02-second.md"]);
	});

	test("ensureConfig auto-discovers files and creates mrmd.config.json if missing", async () => {
		await writeFile(join(tempDir, "intro.md"), "# Intro");
		await writeFile(join(tempDir, "setup.md"), "# Setup");

		const config = ensureConfig(tempDir);
		expect(config.lessons).toEqual(["intro.md", "setup.md"]);
		expect(existsSync(join(tempDir, "mrmd.config.json"))).toBe(true);
	});

	test("configToBuildOptions extracts appearance and metadata settings", () => {
		const config: MrmdConfig = {
			title: "Quantum Physics",
			author: "Dr. Feynman",
			theme: "dark",
			palette: "neon",
			ui: "playful",
			font: "Inter, sans-serif",
			customPalettes: {
				neon: {
					accent: "#ff00ff",
				},
			},
		};

		const opts = configToBuildOptions(config);
		expect(opts.theme).toBe("dark");
		expect(opts.palette).toBe("neon");
		expect(opts.ui).toBe("playful");
		expect(opts.font).toBe("Inter, sans-serif");
		expect(opts.customPalettes?.neon?.accent).toBe("#ff00ff");
		expect(opts.author).toBe("Dr. Feynman");
		expect(opts.courseTitle).toBe("Quantum Physics");
	});

	test("generateChapterContent includes title, description, and author", async () => {
		const { generateChapterContent } = await import("../src/cli/chapter.js");
		const config: MrmdConfig = {
			title: "Electronics 101",
			description: "Learn circuits: from scratch",
			author: "Ada Lovelace",
			lessons: ["intro.md"],
		};
		await writeFile(join(tempDir, "intro.md"), "# Intro");
		saveConfig(tempDir, config);

		const chapterMd = generateChapterContent(tempDir);
		expect(chapterMd).toContain('title: "Electronics 101"');
		expect(chapterMd).toContain('description: "Learn circuits: from scratch"');
		expect(chapterMd).toContain('author: "Ada Lovelace"');
		expect(chapterMd).toContain("- [Intro](./intro.md)");
	});
});
