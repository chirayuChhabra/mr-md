import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProject } from "../src/compiler.js";

test("lesson plugin settings inherit raw chapter values before schema transforms", () => {
	const root = mkdtempSync(join(tmpdir(), "mrmd-lesson-engine-"));
	try {
		writeFileSync(join(root, "mrmd.config.json"), JSON.stringify({
			content: {
				engine: "./content.cjs",
				settings: { label: "Chapter", count: "2" },
				lessons: [
					{ file: "first.md", content: { settings: { label: "First" } } },
					"second.md",
				],
			},
		}));
		writeFileSync(join(root, "content.cjs"), `
			module.exports = {
				schema: { parse({ label, count }) {
					if (typeof count !== "string") throw new Error("Expected raw count");
					return { label, count: Number(count) };
				} },
				render({ settings }) {
					return { html: "<p>" + settings.label + " x" + settings.count + "</p>" };
				}
			};
		`);
		for (const name of ["first", "second"])
			writeFileSync(join(root, name + ".md"), "# " + name + "\n\nA paragraph.");
		buildProject(root);
		expect(readFileSync(join(root, "out/first.html"), "utf8")).toContain("First x2");
		expect(readFileSync(join(root, "out/second.html"), "utf8")).toContain("Chapter x2");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
