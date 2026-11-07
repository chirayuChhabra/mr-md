import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer";
import { renderSimulation } from "../src/renderer/blocks/simulation.js";

const chrome =
	process.env.PUPPETEER_EXECUTABLE_PATH ||
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

test.skipIf(!existsSync(chrome))(
	"simulation preview expands explicitly and returns to a paused thumbnail",
	async () => {
		const bundle = await Bun.build({
			entrypoints: ["preview-test-entry"],
			plugins: [
				{
					name: "preview-test",
					setup(build) {
						build.onResolve({ filter: /^preview-test-entry$/ }, () => ({
							path: "preview-test-entry",
							namespace: "preview-test",
						}));
						build.onLoad({ filter: /.*/, namespace: "preview-test" }, () => ({
							contents: `import { bkWireMaximizeControls } from './src/client/ui.ts';
import { bkWireInteractiveFrames } from './src/client/interactive.ts';
import { bkWireSimControls } from './src/client/simulation.ts';
import { bkWireTelemetry, bkInitTelemetry } from './src/client/telemetry.ts';
bkWireMaximizeControls(); bkWireInteractiveFrames(); bkWireSimControls(); bkWireTelemetry(); bkInitTelemetry();`,
							resolveDir: process.cwd(),
							loader: "ts",
						}));
					},
				},
			],
			target: "browser",
		});
		expect(bundle.success).toBe(true);
		const { html } = renderSimulation(
			{
				type: "simulation",
				label: "Preview lab",
				src: `
const sim = window.defineSimulation({props:{speed:1}});
window.__testState = {time:0, resets:0, draws:0};
sim.onReset(() => { window.__testState.time=0; window.__testState.resets++; });
window.bkSetup(800,500,(ctx) => {
window.__testState.time += sim.props.speed * sim.deltaTime();
window.__testState.draws++;
sim.publishTelemetry({time:window.__testState.time});
ctx.fillStyle=window.bkColor('bg'); ctx.fillRect(0,0,800,500);
ctx.fillStyle=window.bkColor('text'); ctx.fillRect(300,180,200,140);
});`,
				telemetry: { time: { label: "Elapsed time", precision: 2 } },
				props: { speed: 1 },
				tunables: { speed: { type: "range", label: "Speed", min: 0, max: 5 } },
			},
			0,
			{},
		);
		const browser = await puppeteer.launch({
			executablePath: chrome,
			headless: true,
		});
		try {
			const page = await browser.newPage();
			await page.setViewport({ width: 1280, height: 900 });
			await page.setContent(
				`<style>${readFileSync("src/styles/theme.css", "utf8")}</style><header id="bk-topbar"><a href="#lesson" id="breadcrumb">Lesson breadcrumb</a></header><button id="lesson-button">Lesson action</button>${html}`,
			);
			await page.addScriptTag({ content: await bundle.outputs[0]!.text() });
			const preview = page
				.locator('button[aria-label="Expand simulation"]')
				.setTimeout(4000);
			const isRunning = () =>
				page.frames()[1]!.evaluate(() => Boolean((window as any).__loop));
			await page.waitForFunction(
				() => !!document.querySelector("iframe")?.contentWindow,
			);
			expect(
				await page.$eval(
					".bk-sim-inspector",
					(el) => getComputedStyle(el).display,
				),
			).toBe("none");
			await page.$eval('[aria-label="Expand simulation"]', (el) =>
				(el as HTMLElement).focus(),
			);
			expect(await page.$(".bk-object--maximized")).toBeNull();
			expect(await isRunning()).toBe(false);
			await page.keyboard.press("Enter");
			await page.waitForSelector(".bk-object--maximized", { timeout: 4000 });
			await page
				.frames()[1]!
				.waitForFunction(() => (window as any).__loop === true);
			expect(
				await page.$eval(
					".bk-sim-inspector",
					(el) => getComputedStyle(el).display,
				),
			).not.toBe("none");
			await page.$eval('[data-bk-prop="speed"]', (el) => {
				(el as HTMLInputElement).value = "3";
				el.dispatchEvent(new Event("input", { bubbles: true }));
			});
			expect(await page.$eval("#lesson-button", (el) => el.inert)).toBe(true);
			await page.focus("#breadcrumb");
			await page.keyboard.down("Shift");
			await page.keyboard.press("Tab");
			await page.keyboard.up("Shift");
			const last = await page.evaluate(() => document.activeElement?.outerHTML);
			expect(await page.$eval('input[type="number"][data-bk-sync="speed"]', el => el === document.activeElement)).toBe(true);
			expect(await page.evaluate(() => Boolean(document.activeElement?.closest(".bk-object--maximized")))).toBe(true);
			await page.keyboard.press("Tab");
			expect(await page.$eval("#breadcrumb", el => el === document.activeElement)).toBe(true);
			await page.keyboard.down("Shift");
			await page.keyboard.press("Tab");
			await page.keyboard.up("Shift");
			expect(await page.evaluate(() => document.activeElement?.outerHTML)).toBe(last);

			await page.locator('button[aria-label="Pause simulation"]').click();
			await page
				.frames()[1]!
				.waitForFunction(() => (window as any).__loop === false);
			const pausedTime = await page
				.frames()[1]!
				.evaluate(() => (window as any).__testState.time);
			await page.$eval('[data-bk-prop="speed"]', (el) => {
				(el as HTMLInputElement).value = "4";
				el.dispatchEvent(new Event("input", { bubbles: true }));
			});
			// Changing simulation controls while paused resumes playback consistently
			expect(await isRunning()).toBe(true);
			await page.locator('button[aria-label="Pause simulation"]').click();
			await page
				.frames()[1]!
				.waitForFunction(() => (window as any).__loop === false);
			expect(await isRunning()).toBe(false);
			await page.locator("button[data-bk-reset-simulation]").click();
			await page
				.frames()[1]!
				.waitForFunction(() => (window as any).__testState.resets === 1);
			expect(await isRunning()).toBe(false);
			expect(
				await page
					.frames()[1]!
					.evaluate(() => (window as any).__testState.time),
			).toBe(0);
			expect(pausedTime).toBeGreaterThanOrEqual(0);
			expect(
				await page.$eval(
					'[data-bk-prop="speed"]',
					(el) => (el as HTMLInputElement).value,
				),
			).toBe("1");
			await page.$eval('[data-bk-prop="speed"]', (el) => {
				(el as HTMLInputElement).value = "3";
				el.dispatchEvent(new Event("input", { bubbles: true }));
			});
			await page.frames()[1]!.evaluate(() => {
				document.body.tabIndex = 0;
				document.body.focus();
			});
			await page.keyboard.press("Escape");
			await page.waitForFunction(
				() => !document.querySelector(".bk-object--maximized"),
			);
			expect(await page.$eval("#lesson-button", (el) => el.inert)).toBe(false);
			expect(await page.$eval("#breadcrumb", el => el.parentElement?.id)).toBe("bk-topbar");
			expect(await page.$eval("#bk-topbar", el => el.parentElement === document.body)).toBe(true);
			await page
				.frames()[1]!
				.waitForFunction(() => (window as any).__loop === false);
			expect(
				await page.$eval(
					'[aria-label="Expand simulation"]',
					(el) => el === document.activeElement,
				),
			).toBe(true);
			expect(
				await page.$eval(
					".bk-sim-inspector",
					(el) => getComputedStyle(el).display,
				),
			).toBe("none");
			await page.screenshot({
				path: "/tmp/mr-simulation-preview.png",
				timeout: 3000,
			});
			await preview.click();
			await page.waitForSelector(".bk-object--maximized", { timeout: 4000 });
			expect(
				await page.$eval(
					'[data-bk-prop="speed"]',
					(el) => (el as HTMLInputElement).value,
				),
			).toBe("3");
			await page.screenshot({ path: "/tmp/mr-simulation-expanded.png" });
			await page.keyboard.press("Escape");
			await page.setViewport({ width: 390, height: 844 });
			await preview.click();
			await page.waitForSelector(".bk-object--maximized", { timeout: 4000 });
			await page.screenshot({ path: "/tmp/mr-simulation-mobile.png" });
		} finally {
			await browser.close();
		}
	},
	20000,
);
