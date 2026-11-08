import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer";
import { renderSteps } from "../src/renderer/blocks/steps.js";

const chrome =
	process.env.PUPPETEER_EXECUTABLE_PATH ||
	await puppeteer.executablePath();

test.skipIf(!existsSync(chrome))(
	"guided trials restore authored defaults and preserve progress when closing",
	async () => {
		const bundle = await Bun.build({
			entrypoints: ["steps-test-entry"],
			target: "browser",
			plugins: [
				{
					name: "steps-test",
					setup(build) {
						build.onResolve({ filter: /^steps-test-entry$/ }, () => ({
							path: "steps-test-entry",
							namespace: "steps-test",
						}));
						build.onLoad({ filter: /.*/, namespace: "steps-test" }, () => ({
							loader: "ts",
							resolveDir: process.cwd(),
							contents: `
import {bkWireMaximizeControls} from './src/client/ui.ts';
import {bkWireInteractiveFrames} from './src/client/interactive.ts';
import {bkWireSteps} from './src/client/steps.ts';
import {bkWireSimControls} from './src/client/simulation.ts';
import {bkWireTelemetry,bkInitTelemetry} from './src/client/telemetry.ts';
bkWireMaximizeControls(); bkWireInteractiveFrames(); bkWireSimControls(); bkWireTelemetry(); bkInitTelemetry(); bkWireSteps();
`,
						}));
					},
				},
			],
		});
		expect(bundle.success).toBe(true);
		const { html } = renderSteps(
			{
				type: "steps",
				label: "Guided defaults",
				voice: false,
				audio: false,
				props: { speed: 40, target: 200 },
				tunables: {
					speed: { type: "range", label: "Speed", min: 20, max: 100, step: 10 },
				},
				steps: [
					{
						title: "Near",
						initialProps: { speed: 40, target: 200, nearOnly: true },
					},
					{ title: "Far", initialProps: { target: 400 } },
				],
				src: `
const sim=window.defineSimulation({props:{speed:40,target:200}});
window.__trial={distance:0,resets:0};
window.bkOnStep(() => { window.__trial.distance=0; });
sim.onReset(() => { window.__trial.distance=0; window.__trial.resets++; });
window.bkSetup(800,450,(ctx) => {
window.__trial.distance+=sim.props.speed*sim.deltaTime();
ctx.fillStyle=window.bkColor('bg');ctx.fillRect(0,0,800,450);
ctx.fillStyle=window.bkColor('text');ctx.fillRect(80+window.__trial.distance,200,20,20);
});`,
			},
			0,
			{},
		);
		const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
			executablePath: chrome,
			headless: true,
		});
		try {
			const page = await browser.newPage();
			await page.setViewport({ width: 1280, height: 900 });
			await page.setContent(
				`<style>${readFileSync("src/styles/theme.css", "utf8")}</style><button id="lesson">Lesson</button>${html}`,
			);
			await page.addScriptTag({ content: await bundle.outputs[0]!.text() });
			const frame = page.frames()[1]!;
			await frame.waitForFunction(
				() => (window as any).__currentStepIndex === 0,
			);
			await page.locator('button[aria-label="Expand step-by-step simulation"]').click();
			expect(await page.$("[data-bk-playback]")).toBeNull();
			await page.locator('button[aria-label="Next step"]').click();
			await frame.waitForFunction(
				() => (window as any).__currentStepIndex === 1,
			);
			expect(
				await frame.evaluate(() => (window as any).__simProps.nearOnly),
			).toBeUndefined();
			expect(await frame.evaluate(() => (window as any).__simProps.speed)).toBe(
				40,
			);
			await page.$eval('[data-bk-prop="speed"]', (el) => {
				(el as HTMLInputElement).value = "90";
				el.dispatchEvent(new Event("input", { bubbles: true }));
			});
			await frame.waitForFunction(
				() => (window as any).__simProps.speed === 90,
			);
			await page.locator(".bk-steps-btn--reset").click();
			await frame.waitForFunction(() => (window as any).__trial.resets === 1);
			expect(await frame.evaluate(() => (window as any).__simProps.speed)).toBe(
				40,
			);
			expect(
				await frame.evaluate(() => (window as any).__simProps.target),
			).toBe(400);
			await frame.evaluate(() =>
				(window as any).bkCompleteStep("Reached the target."),
			);
			await page.waitForSelector('.bk-steps-dot[data-step="1"].is-solved');
			expect(await page.$eval('.bk-steps-announcement', (el) => ({
				role: el.getAttribute('role'),
				text: el.textContent,
			}))).toEqual({ role: 'status', text: 'Steps Completed 🎉. Reached the target.' });
			await page.locator('button[aria-label="Exit expanded view"]').click();
			await frame.waitForFunction(() => (window as any).__loop === false);
			expect(
				await page.$('.bk-steps-dot[data-step="1"].is-solved'),
			).not.toBeNull();
			expect(await page.$eval("#lesson", (el) => el.inert)).toBe(false);
			await page.locator('button[aria-label="Expand step-by-step simulation"]').click();
			expect(
				await frame.evaluate(() => (window as any).__currentStepIndex),
			).toBe(1);
			await page.setViewport({ width: 390, height: 844 });
			await page.screenshot({ path: "/tmp/mr-steps-workspace-mobile.png" });
		} finally {
			await browser.close();
		}
	},
	20000,
);
