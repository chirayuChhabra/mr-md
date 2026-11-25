import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import puppeteer from "puppeteer";

function testingModule(result: string): string {
	const js = `document.querySelector('[data-test-engine]').addEventListener('click', () => { document.querySelector('output').textContent = ${JSON.stringify(result)}; });`;
	return `module.exports = {
  render({ settings }) {
    return {
      html: '<button data-test-engine type="button" aria-label="' + settings.label + '">' + settings.label + '</button><output aria-label="Test result"></output>',
      css: '[data-test-engine] { border-top: 7px solid rgb(12, 34, 56); }',
      js: ${JSON.stringify(js)}
    };
  }
};`;
}

test("configured testing engines keep behavior across desktop and mobile navigation and reload edits", async () => {
	const directory = mkdtempSync(join(tmpdir(), "mrmd-engines-browser-"));
	const config = {
		content: { lessons: ["first.md", "second.md"] },
		testing: { engine: "./testing.cjs", settings: { label: "Check knowledge" } },
	};
	const configPath = join(directory, "mrmd.config.json");
	const modulePath = join(directory, "testing.cjs");
	writeFileSync(configPath, JSON.stringify(config));
	writeFileSync(modulePath, testingModule("Original engine result"));
	for (const title of ["First", "Second"]) {
		writeFileSync(join(directory, `${title.toLowerCase()}.md`), `# ${title}\n\n![Question](./quiz.json)`);
	}
	writeFileSync(join(directory, "quiz.json"), JSON.stringify({ questions: [{ q: "Choose yes", options: ["Yes", "No"], answer: 0 }] }));
	const child = spawn(process.execPath, [resolve("dist/cli.js"), "dev", directory], {
		env: { ...process.env, PORT: "0", INIT_CWD: "", npm_config_local_prefix: "" },
		stdio: ["ignore", "pipe", "pipe"],
	});
	let output = "";
	child.stdout!.on("data", chunk => { output += chunk.toString(); });
	child.stderr!.on("data", chunk => { output += chunk.toString(); });
	const browser = await puppeteer.launch({
		headless: true,
		args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
	});
	try {
		const deadline = Date.now() + 15000;
		while (!output.match(/http:\/\/localhost:\d+/)) {
			if (child.exitCode !== null || Date.now() > deadline) throw new Error(output);
			await new Promise(resolve => setTimeout(resolve, 30));
		}
		const url = output.match(/http:\/\/localhost:\d+/)![0];
		const page = await browser.newPage();
		page.setDefaultTimeout(7000);
		await page.setRequestInterception(true);
		page.on("request", request => {
			if (request.url().startsWith(url)) void request.continue();
			else void request.abort();
		});
		const errors: string[] = [];
		page.on("pageerror", error => errors.push(String(error)));
		const checkButton = async (label: string, result: string) => {
			await page.locator(`button[aria-label="${label}"]`).click();
			await page.waitForFunction(expected => document.querySelector('output[aria-label="Test result"]')?.textContent === expected, {}, result);
			expect(await page.$eval(`button[aria-label="${label}"]`, element => getComputedStyle(element).borderTopWidth)).toBe("7px");
		};
		for (const viewport of [
			{ width: 1440, height: 1000, isMobile: false, hasTouch: false },
			{ width: 390, height: 844, isMobile: true, hasTouch: true },
		]) {
			await page.setViewport(viewport);
			await page.goto(`${url}/first.html`, { waitUntil: "networkidle0" });
			await checkButton("Check knowledge", "Original engine result");
			await page.evaluate(() => { (window as unknown as Record<string, unknown>).navigationSentinel = true; });
			await Promise.all([
				page.waitForNavigation({ waitUntil: "networkidle0" }),
				page.locator('xpath///a[contains(normalize-space(.),"Next Lesson")]').click(),
			]);
			expect(new URL(page.url()).pathname).toBe("/second.html");
			expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).navigationSentinel)).toBeUndefined();
			await checkButton("Check knowledge", "Original engine result");
			await Promise.all([
				page.waitForNavigation({ waitUntil: "networkidle0" }),
				page.locator('xpath///a[contains(normalize-space(.),"Previous Lesson")]').click(),
			]);
			await checkButton("Check knowledge", "Original engine result");
		}
		const configReload = page.waitForNavigation({ waitUntil: "networkidle0" });
		writeFileSync(configPath, JSON.stringify({ ...config, testing: { ...config.testing, settings: { label: "Submit response" } } }));
		await configReload;
		await checkButton("Submit response", "Original engine result");
		const moduleReload = page.waitForNavigation({ waitUntil: "networkidle0" });
		writeFileSync(modulePath, testingModule("Updated engine result"));
		await moduleReload;
		await checkButton("Submit response", "Updated engine result");
		expect(errors).toEqual([]);
	} finally {
		await browser.close();
		child.kill("SIGTERM");
		await new Promise<void>(resolve => { if (child.exitCode !== null) resolve(); else child.once("exit", () => resolve()); });
		rmSync(directory, { recursive: true, force: true });
	}
}, 60000);
