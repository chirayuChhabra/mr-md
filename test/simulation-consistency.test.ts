import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer";
import { renderSimulation } from "../src/renderer/blocks/simulation.js";
import { renderSteps } from "../src/renderer/blocks/steps.js";

const chrome =
	process.env.PUPPETEER_EXECUTABLE_PATH ||
	await puppeteer.executablePath();

test.skipIf(!existsSync(chrome))(
	"simulation consistency: both block and steps hide inline controls, expand consistently with matching playback toolbar, and have NO selector above view",
	async () => {
		const bundle = await Bun.build({
			entrypoints: ["consistency-test-entry"],
			target: "browser",
			plugins: [
				{
					name: "consistency-test",
					setup(build) {
						build.onResolve({ filter: /^consistency-test-entry$/ }, () => ({
							path: "consistency-test-entry",
							namespace: "consistency-test",
						}));
						build.onLoad({ filter: /.*/, namespace: "consistency-test" }, () => ({
							loader: "ts",
							resolveDir: process.cwd(),
							contents: `
import { bkWireMaximizeControls } from './src/client/ui.ts';
import { bkWireInteractiveFrames } from './src/client/interactive.ts';
import { bkWireSimControls } from './src/client/simulation.ts';
import { bkWireSteps } from './src/client/steps.ts';
import { bkWireTelemetry, bkInitTelemetry } from './src/client/telemetry.ts';

bkWireMaximizeControls();
bkWireInteractiveFrames();
bkWireSimControls();
bkWireTelemetry();
bkInitTelemetry();
bkWireSteps();
`,
						}));
					},
				},
			],
		});
		expect(bundle.success).toBe(true);

		// Render block simulation with controls and telemetry
		const blockSim = renderSimulation(
			{
				type: "simulation",
				label: "Block Kinetic Energy Lab",
				props: { velocity: 10, mass: 2 },
				tunables: {
					velocity: { type: "range", label: "Velocity (v)", min: 0, max: 50, step: 1, unit: "m/s" },
					mass: { type: "range", label: "Mass (m)", min: 1, max: 10, step: 1, unit: "kg" },
				},
				telemetry: {
					ke: { label: "Kinetic Energy", unit: "J", precision: 1 },
				},
				src: `
const sim = window.defineSimulation({ props: { velocity: 10, mass: 2 } });
window.__testState = { loopCount: 0, resets: 0 };
sim.onReset(() => { window.__testState.resets++; });
window.bkSetup(800, 450, (ctx) => {
  window.__testState.loopCount++;
  const ke = 0.5 * sim.props.mass * sim.props.velocity * sim.props.velocity;
  sim.publishTelemetry({ ke });
  ctx.fillStyle = window.bkColor('bg');
  ctx.fillRect(0, 0, 800, 450);
});
`,
			},
			0,
			{},
		);

		// Render steps simulation with steps and controls
		const stepsSim = renderSteps(
			{
				type: "steps",
				label: "Guided Wave Mechanics",
				voice: false,
				audio: false,
				props: { frequency: 2 },
				tunables: {
					frequency: { type: "range", label: "Frequency (f)", min: 1, max: 10, step: 0.5, unit: "Hz" },
				},
				steps: [
					{
						id: "step-1",
						title: "Fundamental Mode",
						instruction: "Observe the fundamental standing wave.",
						initialProps: { frequency: 2 },
					},
					{
						id: "step-2",
						title: "First Harmonic",
						instruction: "Increase frequency to 4 Hz.",
						initialProps: { frequency: 4 },
					},
				],
				src: `
const sim = window.defineSimulation({ props: { frequency: 2 } });
window.__stepsTestState = { resets: 0 };
sim.onReset(() => { window.__stepsTestState.resets++; });
window.bkSetup(800, 450, (ctx) => {
  ctx.fillStyle = window.bkColor('bg');
  ctx.fillRect(0, 0, 800, 450);
});
`,
			},
			1,
			{},
		);

		const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>${readFileSync("src/styles/theme.css", "utf8")}</style>
</head>
<body>
  <div id="lesson-flow">
    <h1>Physics Lab Session</h1>
    <p>Exploring both block experiments and guided sequential steps.</p>
    <div id="block-container">${blockSim.html}</div>
    <div id="steps-container">${stepsSim.html}</div>
  </div>
</body>
</html>
`;

		const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
			executablePath: chrome,
			headless: true,
		});

		try {
			const page = await browser.newPage();
			await page.setViewport({ width: 1280, height: 900 });
			await page.setContent(htmlContent);
			await page.addScriptTag({ content: await bundle.outputs[0]!.text() });

			// Wait for iframes to load
			await page.waitForFunction(
				() => document.querySelectorAll("iframe").length >= 2,
			);

			// ─── 1. INLINE PREVIEW CHECKS: BOTH HIDE INLINE INSPECTOR & CONTROLS ───
			const blockFigure = "#sim-0";
			const stepsFigure = "#steps-1";

			// Block inline inspection
			const blockInspectorDisplay = await page.$eval(
				`${blockFigure} .bk-sim-inspector`,
				(el) => getComputedStyle(el).display,
			);
			expect(blockInspectorDisplay).toBe("none");

			const blockControls = await page.$eval(
				`${blockFigure} .bk-sim-controls`,
				(el) => getComputedStyle(el).display,
			);
			expect(blockControls).toBe("none");

			// Steps inline inspection
			const stepsInspectorDisplay = await page.$eval(
				`${stepsFigure} .bk-sim-inspector`,
				(el) => getComputedStyle(el).display,
			);
			expect(stepsInspectorDisplay).toBe("none");

			const stepsControlsDisplay = await page.$eval(
				`${stepsFigure} .bk-steps-controls`,
				(el) => getComputedStyle(el).display,
			);
			expect(stepsControlsDisplay).toBe("none");

			const stepsBannerDisplay = await page.$eval(
				`${stepsFigure} .bk-steps-banner`,
				(el) => getComputedStyle(el).display,
			);
			expect(stepsBannerDisplay).toBe("none");

			// Both have "Open lab" entry button in their headers
			expect(await page.$(`${blockFigure} [data-bk-lab-entry]`)).not.toBeNull();
			expect(await page.$(`${stepsFigure} [data-bk-lab-entry]`)).not.toBeNull();

			// Both have overlays with pointer cursor
			const blockOverlayCursor = await page.$eval(
				`${blockFigure} .bk-embed-overlay`,
				(el) => getComputedStyle(el).cursor,
			);
			expect(blockOverlayCursor).toBe("pointer");

			const stepsOverlayCursor = await page.$eval(
				`${stepsFigure} .bk-embed-overlay`,
				(el) => getComputedStyle(el).cursor,
			);
			expect(stepsOverlayCursor).toBe("pointer");

			// Neither has simulation selector displayed inline
			const inlinePickerBlock = await page.$eval(
				`${blockFigure} .bk-expanded-sim-picker`,
				(el) => getComputedStyle(el).display,
			);
			expect(inlinePickerBlock).toBe("none");

			const inlinePickerSteps = await page.$eval(
				`${stepsFigure} .bk-expanded-sim-picker`,
				(el) => getComputedStyle(el).display,
			);
			expect(inlinePickerSteps).toBe("none");

			// Visual snapshots of inline state
			await page.screenshot({ path: "/tmp/mr-consistency-block-inline.png" });

			await page.$eval(`${stepsFigure}`, (el) => el.scrollIntoView());
			await page.screenshot({ path: "/tmp/mr-consistency-steps-inline.png" });

			// Scroll back to top
			await page.evaluate(() => window.scrollTo(0, 0));

			// ─── 2. EXPAND BLOCK SIMULATION ───
			await page.locator(`${blockFigure} [data-bk-expand-preview]`).click();
			await page.waitForSelector(`${blockFigure}.bk-object--maximized`);

			// In expanded mode, block inspector is visible
			const expandedBlockInspector = await page.$eval(
				`${blockFigure} .bk-sim-inspector`,
				(el) => getComputedStyle(el).display,
			);
			expect(expandedBlockInspector).not.toBe("none");

			// NO simulation selector above view (even with multiple simulations on the page!)
			const blockPickerExpanded = await page.$eval(
				`${blockFigure} .bk-expanded-sim-picker`,
				(el) => getComputedStyle(el).display,
			);
			expect(blockPickerExpanded).toBe("none");

			// Playback belongs to the stage in both presentation types.
			expect(await page.$(`${blockFigure} .bk-sim-stage .bk-steps-controls`)).not.toBeNull();
			expect(await page.$(`${blockFigure} .bk-object-actions [data-bk-playback]`)).toBeNull();
			const playbackToolbar = await page.$(`${blockFigure} .bk-sim-playback`);
			expect(playbackToolbar).not.toBeNull();

			const playbackBtn = await page.$(`${blockFigure} button[data-bk-playback]`);
			expect(playbackBtn).not.toBeNull();
			const resetBtn = await page.$(`${blockFigure} button[data-bk-reset-simulation]`);
			expect(resetBtn).not.toBeNull();

			// Verify playback buttons match step toolbar button dimensions and styles
			const playbackBtnHeight = await page.$eval(
				`${blockFigure} button[data-bk-playback]`,
				(el) => getComputedStyle(el).height,
			);
			expect(playbackBtnHeight).toBe("48px");

			const playbackBtnRadius = await page.$eval(
				`${blockFigure} button[data-bk-playback]`,
				(el) => getComputedStyle(el).borderRadius,
			);
			expect(playbackBtnRadius).toBe("50%");

			const resetBtnHeight = await page.$eval(
				`${blockFigure} button[data-bk-reset-simulation]`,
				(el) => getComputedStyle(el).height,
			);
			expect(resetBtnHeight).toBe("40px");

			// Verify theme adaptations (Neo: sharp 0px corners, Playful: pill 99px corners)
			await page.evaluate(() => { document.documentElement.dataset.ui = "neo"; });
			await page.waitForFunction(() => getComputedStyle(document.querySelector("[data-bk-playback]")!).borderRadius === "0px");
			expect(
				await page.$eval(
					`${blockFigure} button[data-bk-playback]`,
					(el) => getComputedStyle(el).borderRadius,
				),
			).toBe("0px");

			await page.evaluate(() => { document.documentElement.dataset.ui = "playful"; });
			await page.waitForFunction(() => parseInt(getComputedStyle(document.querySelector("[data-bk-playback]")!).borderRadius, 10) >= 16);
			expect(
				await page.$eval(
					`${blockFigure} button[data-bk-playback]`,
					(el) => parseInt(getComputedStyle(el).borderRadius, 10),
				),
			).toBeGreaterThanOrEqual(16);

			await page.evaluate(() => { delete document.documentElement.dataset.ui; });

			// Test playback interaction (pause / resume)
			const initialPlayingText = await page.$eval(
				`${blockFigure} button[data-bk-playback]`,
				(el) => el.textContent?.trim(),
			);
			expect(initialPlayingText).toBe("Pause");

			await page.locator(`${blockFigure} button[data-bk-playback]`).click();
			const pausedText = await page.$eval(
				`${blockFigure} button[data-bk-playback]`,
				(el) => el.textContent?.trim(),
			);
			expect(pausedText).toBe("Resume");

			// Test reset interaction
			await page.locator(`${blockFigure} button[data-bk-reset-simulation]`).click();

			// Screenshot of expanded block simulation
			await page.screenshot({ path: "/tmp/mr-consistency-block-expanded.png" });

			// Exit block expanded view via Escape
			await page.keyboard.press("Escape");
			await page.waitForFunction(
				() => !document.querySelector(".bk-object--maximized"),
			);
			expect(
				await page.$eval(
					`${blockFigure} .bk-sim-inspector`,
					(el) => getComputedStyle(el).display,
				),
			).toBe("none");

			// ─── 3. EXPAND STEPS SIMULATION ───
			await page.locator(`${stepsFigure} [data-bk-expand-preview]`).click();
			await page.waitForSelector(`${stepsFigure}.bk-object--maximized`);

			const stepPlaybackHeight = await page.$eval(`${stepsFigure} .bk-steps-btn--play`, el => getComputedStyle(el).height);
			expect(stepPlaybackHeight).toBe(playbackBtnHeight);
			for (const selector of [stepsFigure]) {
				const offset = await page.$eval(selector, el => {
					const stage = el.querySelector(".bk-sim-stage")!.getBoundingClientRect();
					const transport = el.querySelector(".bk-steps-nav")!.getBoundingClientRect();
					return Math.abs(stage.x + stage.width / 2 - transport.x - transport.width / 2);
				});
				expect(offset).toBeLessThan(1);
			}

			// In expanded mode, steps inspector is visible
			const expandedStepsInspector = await page.$eval(
				`${stepsFigure} .bk-sim-inspector`,
				(el) => getComputedStyle(el).display,
			);
			expect(expandedStepsInspector).not.toBe("none");

			// Steps banner is visible
			const stepsBannerDisplayExpanded = await page.$eval(
				`${stepsFigure} .bk-steps-banner`,
				(el) => getComputedStyle(el).display,
			);
			expect(stepsBannerDisplayExpanded).not.toBe("none");

			// Steps toolbar controls are visible
			const stepsControlsExpanded = await page.$eval(
				`${stepsFigure} .bk-steps-controls`,
				(el) => getComputedStyle(el).display,
			);
			expect(stepsControlsExpanded).not.toBe("none");

			// NO simulation selector above view in steps either
			const stepsPickerExpanded = await page.$eval(
				`${stepsFigure} .bk-expanded-sim-picker`,
				(el) => getComputedStyle(el).display,
			);
			expect(stepsPickerExpanded).toBe("none");

			// Steps play and reset buttons exist with matching dimensions
			const stepsPlayBtn = await page.$(`${stepsFigure} .bk-steps-btn--play`);
			expect(stepsPlayBtn).not.toBeNull();
			const stepsResetBtn = await page.$(`${stepsFigure} .bk-steps-btn--reset`);
			expect(stepsResetBtn).not.toBeNull();

			const stepsResetHeight = await page.$eval(
				`${stepsFigure} .bk-steps-btn--reset`,
				(el) => getComputedStyle(el).height,
			);
			expect(stepsResetHeight).toBe(resetBtnHeight);

			await page.locator(`${stepsFigure} .bk-steps-btn--play`).click();
			expect(await page.$eval(`${stepsFigure}`, el => (el as HTMLElement).dataset.bkPlaybackState)).toBe("paused");
			expect(await page.$eval(`${stepsFigure} .bk-sim-preview`, el => el.classList.contains("is-interactive"))).toBe(true);
			expect(await page.$eval(`${stepsFigure} .bk-embed-overlay`, el => getComputedStyle(el).pointerEvents)).toBe("none");
			await page.locator(`${stepsFigure} .bk-steps-btn--play`).click();
			expect(await page.$eval(`${stepsFigure}`, el => (el as HTMLElement).dataset.bkPlaybackState)).toBe("playing");

			// Screenshot of expanded steps simulation
			await page.screenshot({ path: "/tmp/mr-consistency-steps-expanded.png" });

			// Test mobile viewport consistency
			await page.setViewport({ width: 390, height: 844 });
			await page.screenshot({ path: "/tmp/mr-consistency-mobile.png" });

			// Exit steps expanded view
			await page.keyboard.press("Escape");
			await page.waitForFunction(
				() => !document.querySelector(".bk-object--maximized"),
			);

			// Both return to compact previews with no inline inspector
			expect(
				await page.$eval(
					`${blockFigure} .bk-sim-inspector`,
					(el) => getComputedStyle(el).display,
				),
			).toBe("none");
			expect(
				await page.$eval(
					`${stepsFigure} .bk-sim-inspector`,
					(el) => getComputedStyle(el).display,
				),
			).toBe("none");
		} finally {
			await browser.close();
		}
	},
	30000,
);
