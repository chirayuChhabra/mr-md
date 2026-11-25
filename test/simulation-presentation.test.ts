import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer";
import { renderSimulation } from "../src/renderer/blocks/simulation.js";

test("built-in simulations keep controls inside the expanded lab", async () => {
	const result = await Bun.build({ entrypoints: ["presentation-harness"], plugins: [{ name: "harness", setup(build) {
 build.onResolve({ filter: /^presentation-harness$/ }, () => ({ path: "presentation-harness", namespace: "harness" }));
 build.onLoad({ filter: /.*/, namespace: "harness" }, () => ({
		contents: `import {bkWireWorkspace} from './src/client/workspace.ts'; import {bkWireSimControls} from './src/client/simulation.ts'; import {bkWireInteractiveFrames} from './src/client/interactive.ts'; bkWireWorkspace(); bkWireSimControls(); bkWireInteractiveFrames();`,
		resolveDir: process.cwd(), loader: "ts",
	})); } }], target: "browser" });
	if (!result.success) throw new Error(result.logs.join("\n"));
	const script = await result.outputs[0].text();
	const simulation = {
		type: "simulation" as const,
		label: "Inline experiment",
		src: `window.bkSetup(function(ctx) {\nctx.fillStyle=window.bkColor('accent');ctx.fillRect(10,10,100,100);\ndocument.body.dataset.speed=String(window.__simProps.speed);\n});`,
		props: { speed: 2 }, tunables: { speed: { label: "Speed", min: 1, max: 5, step: 1 } },
		open: "workspace" as const,
		height: 320,
	};
	const html = renderSimulation(simulation, 0, {}).html;
	const css = readFileSync("src/styles/theme.css", "utf8");
	const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
	try {
		const page = await browser.newPage();
 page.setDefaultTimeout(5000);
		await page.setViewport({ width: 1200, height: 1000 });
		await page.setContent(`<style>${css}</style>${html}`);
		await page.addScriptTag({ content: script });
		await page.waitForSelector('iframe');
		expect(await page.$eval('.bk-sim-inspector', el => getComputedStyle(el).display)).toBe('none');
		expect(await page.$('[aria-label="Play simulation"]')).toBeNull();
		expect(await page.$eval('.bk-sim-preview', el => Math.round(el.getBoundingClientRect().height))).toBe(320);
		expect(await page.$('.bk-object--maximized')).toBeNull();
		await page.locator('button[aria-label="Expand simulation"]').click();
		await page.waitForSelector('.bk-object--maximized');
		const frame = await (await page.$('iframe'))!.contentFrame();
		await frame!.waitForFunction(() => (window as any).__loop === true);
		await page.locator('button[aria-label="Pause simulation"]').click();
		await frame!.waitForFunction(() => (window as any).__loop === false);
		await page.$eval('input[data-bk-prop="speed"]', el => {
			(el as HTMLInputElement).value = '4'; el.dispatchEvent(new Event('input', { bubbles: true }));
		});
		await frame!.waitForFunction(() => (window as any).__simProps.speed === 4);
		await page.locator('button[aria-label="Reset simulation"]').click();
		await frame!.waitForFunction(() => (window as any).__simProps?.speed === 2);
		await page.keyboard.press('Escape');
		await page.waitForFunction(() => !document.querySelector('.bk-object--maximized'));
		expect(await page.$eval('.bk-sim-inspector', el => getComputedStyle(el).display)).toBe('none');
		await page.setViewport({ width: 390, height: 844 });
		await page.setContent(`<style>${css}</style>${html}`);
		await page.addScriptTag({ content: script });
		expect(await page.$('iframe')).toBeNull();
		expect(await page.$eval('.bk-phone-sim-notice', el => getComputedStyle(el).display)).not.toBe('none');
	} finally { await browser.close(); }
}, 30000);

test("standard simulation previews have no implicit fixed height", async () => {
 const { parseLesson } = await import("../src/parser/mdx.js");
 const { LessonBlocks } = await import("../src/builder/LessonBlocks.js");
 const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
 const { tmpdir } = await import("node:os");
 const { join } = await import("node:path");
 const root = mkdtempSync(join(tmpdir(), "mrmd-standard-size-"));
 try {
  writeFileSync(join(root,"sim.js"), "window.bkSetup(function(){});");
  const lesson = parseLesson("# Example\n\n![Simulation](./sim.js)", {contentBase:root},root);
  const block = lesson.blocks.find(block => block.type === "simulation");
  expect(block?.height).toBeUndefined();
  expect(renderSimulation(block!,0,{contentBase:root}).html).not.toContain("--bk-sim-preview-height");
  const builder = new LessonBlocks();
  builder.simulation("window.bkSetup(function(){});");
  expect(builder.blocks[0].height).toBeUndefined();
 } finally {rmSync(root,{recursive:true,force:true});}
});
