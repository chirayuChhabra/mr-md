import { expect, test, describe } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer";
import { renderSimulation } from "../src/renderer/blocks/simulation.js";
import { renderSteps } from "../src/renderer/blocks/steps.js";
import { renderWorld } from "../src/renderer/blocks/world.js";

const chrome =
	process.env.PUPPETEER_EXECUTABLE_PATH ||
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

describe("Mobile/Tablet Simulation Policy & Structure", () => {
	test("renderSimulation renders .bk-phone-sim-notice and template/slot for deferred iframe loading", () => {
		const block = {
			type: "simulation" as const,
			label: "Wave Interference Lab",
			caption: "Observe interference patterns produced by two coherent sources.",
			src: "console.log('sim');",
			props: { frequency: 440 },
		};
		const result = renderSimulation(block, 0, { strict: false });

		expect(result.html).toContain("bk-phone-sim-notice");
		expect(result.html).toContain("Open this simulation on a larger screen");
		expect(result.html).toContain("Continue on a tablet or desktop to interact with it.");
		expect(result.html).toContain("Wave Interference Lab");
		expect(result.html).toContain("Observe interference patterns");

		// Wrapped in template to prevent eager execution on phones
		expect(result.html).toContain("bk-sim-frame-template");
		expect(result.html).toContain("bk-sim-frame-slot");
	});

	test("renderSteps renders .bk-phone-sim-notice and template/slot for deferred iframe loading", () => {
		const block = {
			type: "steps" as const,
			label: "Orbital Mechanics",
			caption: "Follow guided trial steps to achieve stable orbit.",
			src: "console.log('steps');",
			steps: [
				{
					id: "step-1",
					title: "Launch Phase",
					instruction: "Throttle up to 100%",
				},
			],
		};
		const result = renderSteps(block, 0, { strict: false });

		expect(result.html).toContain("bk-phone-sim-notice");
		expect(result.html).toContain("Open this simulation on a larger screen");
		expect(result.html).toContain("Continue on a tablet or desktop to interact with it.");
		expect(result.html).toContain("Orbital Mechanics");
		expect(result.html).toContain("Follow guided trial steps");

		expect(result.html).toContain("bk-steps-frame-template");
		expect(result.html).toContain("bk-steps-frame-slot");
	});

	test("renderWorld renders .bk-phone-sim-notice and template/slot for deferred iframe loading", () => {
		const block = {
			type: "world" as const,
			label: "Cosmic Horizon",
			caption: "Explorable 3D celestial environment.",
			src: "console.log('world');",
			portal: "minimal" as const,
		};
		const result = renderWorld(block, 0, { strict: false });

		expect(result.html).toContain("bk-phone-sim-notice");
		expect(result.html).toContain("Open this simulation on a larger screen");
		expect(result.html).toContain("Continue on a tablet or desktop to interact with it.");
		expect(result.html).toContain("Cosmic Horizon");
		expect(result.html).toContain("Explorable 3D celestial environment");

		expect(result.html).toContain("bk-world-frame-template");
		expect(result.html).toContain("bk-world-frame-slot");
	});
});

test.skipIf(!existsSync(chrome))(
	"Phone and Tablet device behavior: guards, mounting, and resize transitions",
	async () => {
		const bundle = await Bun.build({
			entrypoints: ["mobile-tablet-fixture"],
			target: "browser",
			plugins: [
				{
					name: "fixture",
					setup(build) {
						build.onResolve({ filter: /^mobile-tablet-fixture$/ }, () => ({
							path: "mobile-tablet-fixture",
							namespace: "fixture",
						}));
						build.onResolve({ filter: /device/ }, () => ({
							path: "mock-device",
							namespace: "mock-device",
						}));
						build.onLoad({ filter: /.*/, namespace: "mock-device" }, () => ({
							loader: "ts",
							contents: `
export function bkIsPhone() {
	return window.matchMedia("(max-width: 767px), (max-height: 500px) and (pointer: coarse)").matches;
}
`,
						}));
						build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
							loader: "ts",
							resolveDir: process.cwd(),
							contents: `
import { bkInitSimControls, bkWireSimControls } from './src/client/simulation.ts';
import { bkInitSteps, bkWireSteps } from './src/client/steps.ts';
import { bkInitWorldPortals, bkWireWorldPortals, bkEnterWorld } from './src/client/world.ts';
import { bkWireWorkspace, bkExpandLab, bkCollapseLab } from './src/client/workspace.ts';
import { bkInitInteractiveFrames, bkWireInteractiveFrames } from './src/client/interactive.ts';
import { bkIsPhone } from './src/client/device.js';

window.bkIsPhone = bkIsPhone;
window.bkExpandLab = bkExpandLab;
window.bkCollapseLab = bkCollapseLab;
window.bkEnterWorld = bkEnterWorld;

bkWireWorkspace();
bkWireSimControls();
bkWireSteps();
bkWireWorldPortals();
bkWireInteractiveFrames();
bkInitSimControls();
bkInitSteps();
bkInitWorldPortals();
bkInitInteractiveFrames();
`,
						}));
					},
				},
			],
		});

		expect(bundle.success).toBe(true);

		const simBlock = renderSimulation(
			{
				type: "simulation",
				label: "Kinetic Lab",
				src: `const sim = window.defineSimulation({ props: { speed: 1 } });
window.bkSetup(800, 500, (ctx) => {
	ctx.fillStyle = "#fff";
	ctx.fillRect(0, 0, 800, 500);
});`,
				props: { speed: 1 },
			},
			0,
			{},
		);

		const stepsBlock = renderSteps(
			{
				type: "steps",
				label: "Guided Steps",
				voice: false,
				audio: false,
				src: `window.bkSetup(800, 500, (ctx) => {});`,
				steps: [{ id: "step-1", title: "Step 1", instruction: "First step" }],
			},
			1,
			{},
		);

		const worldBlock = renderWorld(
			{
				type: "world",
				label: "Deep Space",
				src: `window.bkSetup(800, 500, (ctx) => {});`,
				portal: "minimal",
			},
			2,
			{},
		);

		const html = `
<!DOCTYPE html>
<html>
<head>
<style>${readFileSync("src/styles/theme.css", "utf8")}</style>
</head>
<body>
<header id="bk-topbar"><span class="bk-topbar-breadcrumbs">Lesson</span></header>
${simBlock.html}
${stepsBlock.html}
${worldBlock.html}
</body>
</html>
`;

		const browser = await puppeteer.launch({
			executablePath: chrome,
			headless: true,
			args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
		});

		try {
			const page = await browser.newPage();

			// 1. Phone Viewport (width: 390, height: 844)
			await page.setViewport({ width: 390, height: 844 });
			await page.setContent(html);
			await page.addScriptTag({ content: await bundle.outputs[0]!.text() });

			// Check phone policy
			const isPhoneInitial = await page.evaluate(() => (window as any).bkIsPhone());
			expect(isPhoneInitial).toBe(true);

			// On phone, notice card is in DOM
			const notices = await page.$$(".bk-phone-sim-notice");
			expect(notices.length).toBe(3);

			// On phone, NO iframe should be mounted in slot
			const mountedIframesPhone = await page.evaluate(() => {
				return document.querySelectorAll(".bk-sim-frame-slot iframe, .bk-steps-frame-slot iframe, .bk-world-frame-slot iframe").length;
			});
			expect(mountedIframesPhone).toBe(0);

			// On phone, maximizing / expanding is strictly guarded
			await page.evaluate(() => {
				const fig = document.querySelector("#sim-0");
				(window as any).bkExpandLab(fig);
			});
			expect(await page.$(".bk-object--maximized")).toBeNull();

			// On phone, world entrance is strictly guarded
			await page.evaluate(() => {
				const worldFig = document.querySelector("#world-2");
				(window as any).bkEnterWorld(worldFig);
			});
			expect(await page.$(".bk-world-fullscreen.bk-world--active")).toBeNull();

			// 2. Transition Phone -> Tablet (width: 820, height: 1180)
			await page.setViewport({ width: 820, height: 1180 });
			await page.evaluate(() => window.dispatchEvent(new Event("resize")));

			// Wait for tablet hydration
			await page.waitForFunction(() => {
				return document.querySelectorAll(".bk-sim-frame-slot iframe, .bk-steps-frame-slot iframe").length >= 2;
			});

			const isPhoneTablet = await page.evaluate(() => (window as any).bkIsPhone());
			expect(isPhoneTablet).toBe(false);

			// On tablet, expanding is allowed
			await page.evaluate(() => {
				const fig = document.querySelector("#sim-0");
				(window as any).bkExpandLab(fig);
			});
			await page.waitForSelector(".bk-object--maximized");
			expect(await page.$(".bk-object--maximized")).not.toBeNull();

			// 3. Transition Tablet -> Phone while maximized (resizing back to 390x844)
			await page.setViewport({ width: 390, height: 844 });
			await page.evaluate(() => window.dispatchEvent(new Event("resize")));

			// Maximized workspace MUST collapse on phone
			await page.waitForFunction(() => !document.querySelector(".bk-object--maximized"));
			expect(await page.$(".bk-object--maximized")).toBeNull();

			// Iframes unmount on phone
			const mountedIframesAfterPhoneResize = await page.evaluate(() => {
				return document.querySelectorAll(".bk-sim-frame-slot iframe, .bk-steps-frame-slot iframe, .bk-world-frame-slot iframe").length;
			});
			expect(mountedIframesAfterPhoneResize).toBe(0);
		} finally {
			await browser.close();
		}
	},
	25000,
);
