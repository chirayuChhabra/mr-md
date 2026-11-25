import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import puppeteer from "puppeteer";
import { render } from "../src/renderer/index.js";

test("configuration flows through CLI, navigation, quizzes, phone views, and live reload", async () => {
	const directory = mkdtempSync(join(tmpdir(), "mrmd-browser-"));
	const config = {
		lessons: ["first.md", { file: "second.md", theme: { accent: "#abcdef" }, density: "compact" }],
		theme: { mode: "dark", accent: "#123456" }, layout: "wide", learning: { retry: true },
	};
	const configPath = join(directory, "mrmd.config.json");
	writeFileSync(configPath, JSON.stringify(config));
	writeFileSync(join(directory, "first.md"), '# First\n\n![Question](./quiz.json)');
	writeFileSync(join(directory, "second.md"), '# Second\n\nInherited layout, overridden accent.');
	writeFileSync(join(directory, "quiz.json"), JSON.stringify({ questions: [{ q: "Choose yes", options: ["Yes", "No"], answer: 0, explanation: "Yes is correct." }] }));
	const child = spawn(process.execPath, [resolve("dist/cli.js"), "dev", directory], {
		env: { ...process.env, PORT: "0", INIT_CWD: "", npm_config_local_prefix: "" },
		stdio: ["ignore", "pipe", "pipe"],
	});
	let output = "";
	child.stdout!.on("data", (chunk) => { output += chunk.toString(); });
	child.stderr!.on("data", (chunk) => { output += chunk.toString(); });
	const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
	try {
		const deadline = Date.now() + 15000;
		while (!output.match(/http:\/\/localhost:\d+/)) {
			if (child.exitCode !== null || Date.now() > deadline) throw new Error(output);
			await new Promise((resolve) => setTimeout(resolve, 30));
		}
		const url = output.match(/http:\/\/localhost:\d+/)![0];
		const page = await browser.newPage();
		await page.setRequestInterception(true);
		page.on("request", request => { if (request.url().startsWith(url)) void request.continue(); else void request.abort(); });
		page.setDefaultTimeout(7000);
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(String(error)));
		await page.setViewport({ width: 1440, height: 1000 });
		await page.goto(`${url}/first.html`, { waitUntil: "networkidle0" });
		expect(await page.$eval("html", (el) => el.getAttribute("data-theme"))).toBe("dark");
		expect(await page.$eval(".bk-shell", (el) => getComputedStyle(el).getPropertyValue("--accent").trim())).toBe("#123456");
		await page.locator('xpath///button[normalize-space(.)="No"]').click();
		await page.locator('xpath///button[normalize-space(.)="Try again"]').click();
		expect(await page.$eval(".bk-opt", (el) => (el as HTMLButtonElement).disabled)).toBe(false);
		await page.locator('xpath///button[normalize-space(.)="Yes"]').click();
		expect(await page.$eval(".bk-explanation", (el) => (el as HTMLElement).hidden)).toBe(false);
		await page.locator('xpath///a[contains(normalize-space(.),"Next Lesson")]').click();
		await page.waitForFunction(() => location.pathname.endsWith("second.html") && document.querySelector("h1")?.textContent === "Second");
		expect(await page.$eval(".bk-shell", (el) => getComputedStyle(el).getPropertyValue("--accent").trim())).toBe("#abcdef");
		expect(await page.$eval("body", (el) => el.classList.contains("bk-density-compact"))).toBe(true);
		await page.locator('xpath///a[contains(normalize-space(.),"Previous Lesson")]').click();
		await page.waitForFunction(() => location.pathname.endsWith("first.html") && document.querySelector("h1")?.textContent === "First");
		expect(await page.$eval(".bk-shell", (el) => getComputedStyle(el).getPropertyValue("--accent").trim())).toBe("#123456");
		expect(await page.$eval("body", (el) => el.classList.contains("bk-density-compact"))).toBe(false);
		const reloaded = page.waitForNavigation({ waitUntil: "networkidle0" });
		writeFileSync(configPath, JSON.stringify({ ...config, theme: { ...config.theme, accent: "#654321" } }));
		await reloaded;
		expect(await page.$eval(".bk-shell", (el) => getComputedStyle(el).getPropertyValue("--accent").trim())).toBe("#654321");
		await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
		await page.goto(`${url}/second.html`, { waitUntil: "networkidle0" });
		expect(await page.$eval(".bk-shell", (el) => getComputedStyle(el).getPropertyValue("--accent").trim())).toBe("#abcdef");
		expect(await page.$eval("html", (el) => el.scrollWidth <= innerWidth + 1)).toBe(true);
		expect(errors).toEqual([]);
	} finally {
		await browser.close();
		child.kill("SIGTERM");
		await new Promise<void>((resolve) => { if (child.exitCode !== null) resolve(); else child.once("exit", () => resolve()); });
		rmSync(directory, { recursive: true, force: true });
	}
}, 60000);

test("legacy layout presets survive browser initialization", async () => {
	const html = render({ meta: { title: "Legacy", slug: "legacy" }, blocks: [] }, { preset: { density: "compact", tone: "studio" } });
	const server = Bun.serve({ port: 0, fetch: () => new Response(html, { headers: { "Content-Type": "text/html" } }) });
	const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
	try {
		const page = await browser.newPage();
		await page.setRequestInterception(true);
		page.on("request", request => { if (request.url().startsWith(server.url.origin)) void request.continue(); else void request.abort(); });
		await page.goto(server.url.href, { waitUntil: "networkidle0" });
		expect(await page.$eval("body", element => element.classList.contains("bk-density-compact"))).toBe(true);
		expect(await page.$eval("body", element => element.classList.contains("bk-tone-studio"))).toBe(true);
	} finally { await browser.close(); server.stop(true); }
});
