import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileProject } from "../src/compiler.js";
import { configuredLessons, lessonSettings, projectSettings, validateMrmdConfig } from "../src/config.js";

const directories: string[] = [];
afterEach(() => {
	for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

test("each implementation section accepts its own settings", () => {
	const config = validateMrmdConfig({
		theme: { engine: "./theme.ts", settings: { custom: "value" } },
		content: { engine: "./content.ts", lessons: ["second.md", "first.md"] },
		testing: { engine: "@example/testing", settings: { endpoint: "/answers", scoring: "remote" } },
		simulation: { engine: "./simulation.ts", settings: { bridge: "v2" } },
		code: { engine: "./code.ts", settings: { languages: ["python"] } },
	});
	expect(configuredLessons(config)).toEqual(["second.md", "first.md"]);
	expect(config.testing?.settings?.scoring).toBe("remote");
});

test("engine settings never enter browser presentation data", () => {
	const settings = projectSettings(validateMrmdConfig({
		theme: { engine: "./custom-theme.ts", settings: { privateValue: "server-value" }, accent: "#123456" },
		content: { engine: "./content.ts", settings: { privateValue: "server-value" } },
		testing: { engine: "./testing.ts", settings: { privateValue: "server-value" } },
	}));
	expect(settings).toEqual({ theme: { accent: "#123456" } });
	expect(JSON.stringify(settings)).not.toContain("server-value");
});

test("default implementations map their validated settings to presentation", () => {
	expect(projectSettings(validateMrmdConfig({
		theme: { settings: { accent: "#123456", mode: "dark" } },
		testing: { settings: { retry: true, explanations: false } },
	}))).toEqual({ theme: { accent: "#123456", mode: "dark" }, learning: { retry: true, explanations: false } });
	expect(() => projectSettings(validateMrmdConfig({ theme: { settings: { accent: "red;script" } } }))).toThrow("theme.settings.accent");
	expect(() => projectSettings(validateMrmdConfig({ testing: { settings: { arbitrary: true } } }))).toThrow("testing.settings");
});

test("simulation settings and ambiguous order are rejected at their boundaries", () => {
	expect(() => validateMrmdConfig({ simulation: { height: 500 } })).toThrow();
	expect(() => validateMrmdConfig({ content: { lessons: ["../outside.md"] } })).toThrow();
	expect(() => validateMrmdConfig({ content: { lessons: ["first.md", "first.md"] } })).toThrow("content.lessons.1");
	expect(() => validateMrmdConfig({ content: { lessons: ["first.md"] }, lessons: ["second.md"] })).toThrow("remove the duplicate");
});

test("content lesson order drives compiled chapter navigation", () => {
	const directory = mkdtempSync(join(tmpdir(), "mrmd-engine-config-"));
	directories.push(directory);
	writeFileSync(join(directory, "mrmd.config.json"), JSON.stringify({ content: { lessons: ["second.md", "first.md"] } }));
	writeFileSync(join(directory, "first.md"), "# First");
	writeFileSync(join(directory, "second.md"), "# Second");
	const document = compileProject(directory);
	expect(document.sourceFiles).toEqual(["second.md", "first.md"]);
	expect(document.chapter.lessons[0].meta.nextSlug).toBe("first");
	expect(document.chapter.lessons[1].meta.prevSlug).toBe("second");
});


test("theme section owns layout and interface settings", () => {
	expect(projectSettings(validateMrmdConfig({ theme: { settings: {
		accent: "#123456", layout: "wide", ui: "standard", density: "compact", tone: "minimal",
	} } }))).toEqual({ theme: { accent: "#123456" }, layout: "wide", ui: "standard", density: "compact", tone: "minimal" });
});

test("default implementations reject settings they cannot apply", () => {
	for (const section of ["content", "simulation", "code"]) {
		expect(() => validateMrmdConfig({ [section]: { settings: { unsupported: true } } })).toThrow(`${section}.settings`);
		expect(() => validateMrmdConfig({ [section]: { settings: {} } })).not.toThrow();
	}
});

test("lesson section settings inherit chapter appearance and quiz options", () => {
	const config = validateMrmdConfig({
		theme: { settings: { accent: "#123456", layout: "wide" } },
		testing: { settings: { retry: true, explanations: true } },
		content: { lessons: ["one.md", {
			file: "two.md",
			theme: { settings: { layout: "narrow" } },
			testing: { settings: { explanations: false } },
		}] },
	});
	expect(lessonSettings(config, "two.md")).toEqual({
		theme: { accent: "#123456" }, layout: "narrow",
		learning: { retry: true, explanations: false },
	});
	expect(lessonSettings(config, "one.md").layout).toBe("wide");
});
