import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("one source edit rebuilds once and generated assets never trigger another build", async () => {
	const dir = mkdtempSync(join(tmpdir(), "mr-md-watch-"));
	const source = join(dir, "lesson.md");
	writeFileSync(source, "---\ntitle: Lesson\nindex: 1\n---\nHello\n");
	const child = spawn(process.execPath, [resolve("dist/cli.js"), "dev", dir], {
		env: { ...process.env, PORT: "0" },
		stdio: ["ignore", "pipe", "pipe"],
	});
	let output = "";
	child.stdout!.on("data", (chunk) => {
		output += chunk.toString();
	});
	child.stderr!.on("data", (chunk) => {
		output += chunk.toString();
	});
	async function waitFor(check: () => boolean) {
		const end = Date.now() + 10000;
		while (!check()) {
			if (child.exitCode !== null || Date.now() > end)
				throw new Error(output || "Dev server did not respond");
			await pause(25);
		}
	}
	try {
		await waitFor(() => output.includes("Watching"));
		output = "";
		writeFileSync(source, "---\ntitle: Lesson\nindex: 1\n---\nChanged\n");
		await waitFor(() => output.includes("Build successful"));
		const built = statSync(join(dir, "out/index.html")).mtimeMs;
		await pause(1200);
		expect(output.match(/Build successful/g)?.length).toBe(1);
		expect(statSync(join(dir, "out/index.html")).mtimeMs).toBe(built);
		output = "";
		writeFileSync(join(dir, "out/assets/theme.css"), "/* generated change */");
		await pause(600);
		expect(output).not.toContain("Rebuilding");
		writeFileSync(join(dir, "lesson.css"), "body { color: red; }");
		await waitFor(() => output.includes("Build successful"));
		await pause(800);
		expect(output.match(/Build successful/g)?.length).toBe(1);
	} finally {
		child.kill("SIGTERM");
		await new Promise<void>((resolve) => {
			if (child.exitCode !== null) resolve();
			else child.once("exit", () => resolve());
		});
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);
