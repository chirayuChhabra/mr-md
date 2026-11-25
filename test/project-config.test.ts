import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileProject, buildProject } from "../src/compiler.js";
import { MrmdConfigError, lessonSettings, validateMrmdConfig } from "../src/config.js";

const directories: string[] = [];
function fixture(config: unknown = {}) {
	const directory = mkdtempSync(join(tmpdir(), "mrmd-config-"));
	directories.push(directory);
	writeFileSync(join(directory, "mrmd.config.json"), JSON.stringify(config));
	writeFileSync(join(directory, "first.md"), "# First lesson\n\nA paragraph.");
	writeFileSync(join(directory, "second.md"), "# Second lesson\n\nAnother paragraph.");
	return directory;
}
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("project configuration", () => {
	test("validates chapter settings separately from simulation settings", () => {
		expect(() => validateMrmdConfig({ simulations: { open: "inline" } })).toThrow(MrmdConfigError);
		expect(() => validateMrmdConfig({ lessons: [{ file: "first.md", simulations: { height: 320 } }] })).toThrow(MrmdConfigError);
	});
	test("reads each simulation's presentation from its companion config", () => {
		const directory = fixture({ lessons: ["first.md"], theme: { accent: "#123456" } });
		writeFileSync(join(directory, "first.md"), "# First\n\n![First](./one.js)\n\n![Second](./two.js)");
		for (const file of ["one", "two"]) writeFileSync(join(directory, `${file}.js`), "window.bkSetup(function(ctx) { ctx.clearRect(0, 0, 800, 450); });");
		writeFileSync(join(directory, "one.config.json"), JSON.stringify({ open: "workspace", height: 320, controls: "observe" }));
		writeFileSync(join(directory, "two.config.json"), JSON.stringify({ open: "workspace", height: 480 }));
		const blocks = compileProject(directory).chapter.lessons[0].blocks.filter(block => block.type === "simulation");
		expect(blocks[0]).toMatchObject({ open: "workspace", height: 320, controls: "observe" });
		expect(blocks[1]).toMatchObject({ open: "workspace", height: 480 });
	});
	test("validates paths, duplicate entries, unknown keys, and unsafe style values", () => {
		for (const value of [
			{ lessons: ["../outside.md"] }, { lessons: ["first.md", "first.md"] },
			{ theme: { accent: "red;}</style><script>" } }, { theme: { font: "Inter; color: red" } },
			{ themes: {} }, { simulations: { open: "unknown" } },
		]) expect(() => validateMrmdConfig(value)).toThrow(MrmdConfigError);
	});
	test("resolves nested defaults and preserves the source configuration", () => {
		const config = validateMrmdConfig({ theme: { accent: "#123456", font: "Inter" }, lessons: ["first.md", { file: "second.md", theme: { font: "Georgia" } }] });
		expect(lessonSettings(config, "second.md").theme).toEqual({ accent: "#123456", font: "Georgia" });
		expect(lessonSettings(config, "first.md").theme?.font).toBe("Inter");
		expect(config.theme?.font).toBe("Inter");
	});
	test("compiles configured lesson order and wires navigation", () => {
		const directory = fixture({ lessons: ["second.md", "first.md"] });
		const document = compileProject(directory);
		expect(document.version).toBe(1);
		expect(document.chapter.lessons.map((lesson) => lesson.meta.title)).toEqual(["Second lesson", "First lesson"]);
		expect(document.chapter.lessons[0].meta.nextSlug).toBe("first");
		expect(document.chapter.lessons[1].meta.prevSlug).toBe("second");
	});
	test("discovers lessons from their filenames", () => {
		expect(compileProject(fixture()).chapter.lessons).toHaveLength(2);
	});
	test("configuration order wins over legacy indexes and omits unlisted drafts", () => {
		const directory = fixture({ lessons: ["second.md", "first.md"] });
		writeFileSync(join(directory, "draft.md"), "# Draft");
		writeFileSync(join(directory, "first.md"), "---\nindex: 1\n---\n# First");
		writeFileSync(join(directory, "second.md"), "---\nindex: 2\n---\n# Second");
		expect(compileProject(directory).sourceFiles).toEqual(["second.md", "first.md"]);
	});
	test("retains legacy ordering for quoted numeric indexes", () => {
		const directory = fixture();
		writeFileSync(join(directory, "first.md"), '---\nindex: "2"\n---\n# First');
		writeFileSync(join(directory, "second.md"), '---\nindex: "1"\n---\n# Second');
		expect(compileProject(directory).sourceFiles).toEqual(["second.md", "first.md"]);
	});
	test("rejects output collisions instead of overwriting the chapter or another lesson", () => {
		const directory = fixture();
		writeFileSync(join(directory, "first.md"), "---\nslug: index\n---\n# First");
		expect(() => compileProject(directory)).toThrow("reserved lesson slug");
	});
	test("rejects missing files, malformed JSON, and symlinks outside the chapter", () => {
		const directory = fixture({ lessons: ["missing.md"] });
		expect(() => compileProject(directory)).toThrow("Lesson not found");
		writeFileSync(join(directory, "mrmd.config.json"), "{");
		expect(() => compileProject(directory)).toThrow(MrmdConfigError);
		const other = fixture();
		symlinkSync(join(other, "first.md"), join(directory, "outside.md"));
		writeFileSync(join(directory, "mrmd.config.json"), JSON.stringify({ lessons: ["outside.md"] }));
		expect(() => compileProject(directory)).toThrow("inside the chapter");
	});
	test("builds ordered chapter HTML with project settings and lesson overrides", () => {
		const directory = fixture({ theme: { mode: "dark", accent: "#123456", font: "Inter" }, layout: "wide", lessons: ["second.md", { file: "first.md", theme: { accent: "#abcdef" } }] });
		buildProject(directory);
		const overview = readFileSync(join(directory, "out/index.html"), "utf8");
		expect(overview.indexOf("Second lesson")).toBeLessThan(overview.indexOf("First lesson"));
		const first = readFileSync(join(directory, "out/first.html"), "utf8");
		const second = readFileSync(join(directory, "out/second.html"), "utf8");
		expect(first).toContain("#abcdef");
		expect(second).toContain("#123456");
		expect(first).toContain('data-bk-width="wide"');
		expect(first).toContain('data-bk-theme-default="dark"');
	});
});
