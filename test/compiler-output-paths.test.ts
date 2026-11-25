import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileProject } from "../src/compiler.js";

for (const slugs of [
	["./index"],
	["INDEX"],
	["guide", "./guide"],
	["guide", "draft/../guide"],
	["Café", "Cafe\u0301"],
]) {
	test(`rejects equivalent chapter output paths: ${slugs.join(", ")}`, () => {
		const root = mkdtempSync(join(tmpdir(), "mrmd-output-paths-"));
		try {
			for (const [index, slug] of slugs.entries()) {
				writeFileSync(join(root, `${index}.md`), `---\nslug: ${JSON.stringify(slug)}\n---\n# Lesson\n`);
			}
			expect(() => compileProject(root)).toThrow("Duplicate or reserved lesson slug");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
}
