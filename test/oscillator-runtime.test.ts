import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import puppeteer, { type Browser } from "puppeteer";
import { iframeDoc } from "../src/renderer/blocks/iframe.js";

const installedChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || (fs.existsSync(installedChrome) ? installedChrome : undefined);
const SIM_JS_PATH = path.resolve(__dirname, "../mr-markdown-documentation/sims/oscillator.js");
const SIM_CONFIG_PATH = path.resolve(__dirname, "../mr-markdown-documentation/sims/oscillator.config.json");
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Damped Oscillator - Real Iframe Browser Runtime Regression", () => {
	let browser: Browser;
	let config: any;
	let bundledJs: string;

	beforeAll(async () => {
		// 1. Read config
		expect(fs.existsSync(SIM_CONFIG_PATH)).toBe(true);
		config = JSON.parse(fs.readFileSync(SIM_CONFIG_PATH, "utf-8"));

		// 2. Compile oscillator.js with Bun's browser target exactly as mr-md's resolveContent does
		expect(fs.existsSync(SIM_JS_PATH)).toBe(true);
		const buildOut = spawnSync(process.execPath, [
			"build",
			"--target=browser",
			SIM_JS_PATH,
		]);
		expect(buildOut.status).toBe(0);
		bundledJs = buildOut.stdout.toString("utf-8");
		expect(bundledJs.length).toBeGreaterThan(100);

		// 3. Launch real Chrome browser instance
		browser = await puppeteer.launch({
			headless: true,
			executablePath: CHROME_PATH,
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
		});
	});

	afterAll(async () => {
		if (browser) {
			await browser.close();
		}
	});

	test("executes bundled demo inside actual iframeDoc without error and renders non-empty canvas", async () => {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on("pageerror", (err) => errors.push(err.message));

		// Generate the real mr-md iframeDoc with realistic default props
		const initialPropsJson = JSON.stringify(config.props);
		const htmlContent = iframeDoc(bundledJs, initialPropsJson, false);

		// Render inside a host page with an iframe
		await page.setContent(`
			<!DOCTYPE html>
			<html>
			<head><style>body { margin:0; padding:0; width:1280px; height:720px; }</style></head>
			<body>
				<iframe id="sim-frame" sandbox="allow-scripts" srcdoc="${htmlContent}" style="width:1280px;height:540px;border:none;"></iframe>
			</body>
			</html>
		`);

		const iframeHandle = await page.waitForSelector("#sim-frame");
		expect(iframeHandle).not.toBeNull();
		const frame = await iframeHandle!.contentFrame();
		expect(frame).not.toBeNull();

		// Wait for canvas to be present
		await frame!.waitForSelector("#c");
		await frame!.evaluate(() => {
			const canvas = document.getElementById("c") as HTMLCanvasElement;
			const context = canvas.getContext("2d")!;
			const original = context.fillText.bind(context);
			(window as any).__drawnText = [];
			context.fillText = ((...args: Parameters<CanvasRenderingContext2D["fillText"]>) => {
				(window as any).__drawnText.push(String(args[0]));
				if ((window as any).__drawnText.length > 200) (window as any).__drawnText.shift();
				original(...args);
			}) as typeof context.fillText;
		});


		// Host sends bk:play to start the simulation animation loop
		await page.evaluate(() => {
			const iframe = document.getElementById("sim-frame") as HTMLIFrameElement;
			iframe.contentWindow!.postMessage({ type: "bk:play" }, "*");
		});

		// Give the animation loop several frames to execute
		await delay(350);

		// 1. Verify NO error element was created inside the iframe
		const hasErrorText = await frame!.evaluate(() => {
			const bodyText = document.body.innerText || "";
			return bodyText.includes("Error:") || bodyText.includes("history.push is not a function");
		});
		expect(hasErrorText).toBe(false);
		expect(errors.length).toBe(0);

		// 2. Verify canvas is active and contains rendered pixels (not blank)
		const canvasNonEmpty = await frame!.evaluate(() => {
			const canvas = document.getElementById("c") as HTMLCanvasElement;
			if (!canvas) return false;
			const ctx = canvas.getContext("2d");
			if (!ctx) return false;
			const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
			const data = imgData.data;
			let nonZeroCount = 0;
			for (let i = 0; i < data.length; i += 4) {
				// Alpha > 0 and non-black
				if (data[i + 3] > 0 && (data[i] > 0 || data[i + 1] > 0 || data[i + 2] > 0)) {
					nonZeroCount++;
				}
			}
			return nonZeroCount > 1000;
		});
		expect(canvasNonEmpty).toBe(true);

		// 3. Verify visual animation state evolves (time progresses and canvas updates)
		const pixelsSampleA = await frame!.evaluate(() => {
			const canvas = document.getElementById("c") as HTMLCanvasElement;
			return canvas.toDataURL();
		});

		await delay(250);

		const pixelsSampleB = await frame!.evaluate(() => {
			const canvas = document.getElementById("c") as HTMLCanvasElement;
			return canvas.toDataURL();
		});

		expect(pixelsSampleA).not.toBe(pixelsSampleB);

		await page.close();
	});

	test("responds visibly to primary damping adjustments and presets", async () => {
		const page = await browser.newPage();
		const htmlContent = iframeDoc(bundledJs, JSON.stringify(config.props), false);

		await page.setContent(`
			<!DOCTYPE html>
			<html><body>
				<iframe id="sim-frame" sandbox="allow-scripts" srcdoc="${htmlContent}" style="width:1280px;height:540px;border:none;"></iframe>
			</body></html>
		`);

		const iframeHandle = await page.waitForSelector("#sim-frame");
		const frame = await iframeHandle!.contentFrame();
		await frame!.waitForSelector("#c");
		await frame!.evaluate(() => {
			const canvas = document.getElementById("c") as HTMLCanvasElement;
			const context = canvas.getContext("2d")!;
			const original = context.fillText.bind(context);
			(window as any).__drawnText = [];
			context.fillText = ((...args: Parameters<CanvasRenderingContext2D["fillText"]>) => {
				(window as any).__drawnText.push(String(args[0]));
				if ((window as any).__drawnText.length > 200) (window as any).__drawnText.shift();
				original(...args);
			}) as typeof context.fillText;
		});


		// Host sends bk:play
		await page.evaluate(() => {
			const iframe = document.getElementById("sim-frame") as HTMLIFrameElement;
			iframe.contentWindow!.postMessage({ type: "bk:play" }, "*");
		});
		await delay(200);

		// 1. Test primary damping slider adjustment: increase damping to 15 N·s/m
		await page.evaluate(() => {
			const iframe = document.getElementById("sim-frame") as HTMLIFrameElement;
			iframe.contentWindow!.postMessage({ type: "bk:set-props", props: { damping: 15.0 } }, "*");
		});
		await delay(200);

		const heavyDampingSnap = await frame!.evaluate(() => {
			const canvas = document.getElementById("c") as HTMLCanvasElement;
			return canvas.toDataURL();
		});

		// 2. Apply Critical Damping preset (medium: water [2.5x], damping: 4.0 -> effective c = 10, m = 1, k = 25 -> zeta = 1.00)
		const criticalPreset = config.presets.critical;
		expect(criticalPreset).toBeDefined();
		expect(criticalPreset.props.medium).toBe("water");
		expect(criticalPreset.props.damping).toBe(4.0);

		await page.evaluate((props) => {
			const iframe = document.getElementById("sim-frame") as HTMLIFrameElement;
			iframe.contentWindow!.postMessage({ type: "bk:set-props", props }, "*");
		}, criticalPreset.props);

		await delay(300);

		expect(await frame!.evaluate(() => (window as any).__drawnText.includes("1.000"))).toBe(true);

		// Verify no errors occurred on preset update
		const errorCheck = await frame!.evaluate(() => {
			return document.body.innerText.includes("Error:");
		});
		expect(errorCheck).toBe(false);

		const criticalSnapshot = await frame!.evaluate(() => {
			const canvas = document.getElementById("c") as HTMLCanvasElement;
			return canvas.toDataURL();
		});

		// 3. Apply Underdamped preset (medium: air, damping: 1.2 -> zeta = 0.12)
		const underdampedPreset = config.presets.underdamped;
		await page.evaluate((props) => {
			const iframe = document.getElementById("sim-frame") as HTMLIFrameElement;
			iframe.contentWindow!.postMessage({ type: "bk:set-props", props }, "*");
		}, underdampedPreset.props);

		await delay(300);

		const underdampedSnapshot = await frame!.evaluate(() => {
			const canvas = document.getElementById("c") as HTMLCanvasElement;
			return canvas.toDataURL();
		});

		// Visual state must reflect changes
		expect(heavyDampingSnap).not.toBe(criticalSnapshot);
		expect(criticalSnapshot).not.toBe(underdampedSnapshot);

		await page.close();
	});

	test("responds to repeated impulses and zero reset actions", async () => {
		const page = await browser.newPage();
		const htmlContent = iframeDoc(bundledJs, JSON.stringify(config.props), false);

		await page.setContent(`
			<!DOCTYPE html>
			<html><body>
				<iframe id="sim-frame" sandbox="allow-scripts" srcdoc="${htmlContent}" style="width:1280px;height:540px;border:none;"></iframe>
			</body></html>
		`);

		const iframeHandle = await page.waitForSelector("#sim-frame");
		const frame = await iframeHandle!.contentFrame();
		await frame!.waitForSelector("#c");
		await frame!.evaluate(() => {
			const canvas = document.getElementById("c") as HTMLCanvasElement;
			const context = canvas.getContext("2d")!;
			const original = context.fillText.bind(context);
			(window as any).__drawnText = [];
			context.fillText = ((...args: Parameters<CanvasRenderingContext2D["fillText"]>) => {
				(window as any).__drawnText.push(String(args[0]));
				if ((window as any).__drawnText.length > 200) (window as any).__drawnText.shift();
				original(...args);
			}) as typeof context.fillText;
		});


		// Host sends bk:play
		await page.evaluate(() => {
			const iframe = document.getElementById("sim-frame") as HTMLIFrameElement;
			iframe.contentWindow!.postMessage({ type: "bk:play" }, "*");
		});
		await delay(200);

		// 1. Host dispatches impulse action
		await page.evaluate(() => {
			const iframe = document.getElementById("sim-frame") as HTMLIFrameElement;
			iframe.contentWindow!.postMessage({ type: "bk:action", action: "impulse" }, "*");
		});
		await delay(120);

		const postImpulse1 = await frame!.evaluate(() => {
			const canvas = document.getElementById("c") as HTMLCanvasElement;
			return canvas.toDataURL();
		});

		// 2. Host dispatches second repeated impulse
		await page.evaluate(() => {
			const iframe = document.getElementById("sim-frame") as HTMLIFrameElement;
			iframe.contentWindow!.postMessage({ type: "bk:action", action: "impulse" }, "*");
		});
		await delay(120);

		const postImpulse2 = await frame!.evaluate(() => {
			const canvas = document.getElementById("c") as HTMLCanvasElement;
			return canvas.toDataURL();
		});

		// Repeated impulses must cause continued state change
		expect(postImpulse1).not.toBe(postImpulse2);

		// 3. Host dispatches zero reset action
		await page.evaluate(() => {
			const iframe = document.getElementById("sim-frame") as HTMLIFrameElement;
			iframe.contentWindow!.postMessage({ type: "bk:action", action: "zero" }, "*");
		});
		await delay(150);

		const postReset = await frame!.evaluate(() => {
			const canvas = document.getElementById("c") as HTMLCanvasElement;
			return canvas.toDataURL();
		});

		expect(postReset).not.toBe(postImpulse2);
		const resetReadout = await frame!.evaluate(() => (window as any).__drawnText.slice(-35));
		expect(resetReadout).toContain("+0.000 m");
		expect(resetReadout).toContain("+0.000 m/s");

		// Ensure no iframe errors throughout
		const hasError = await frame!.evaluate(() => document.body.innerText.includes("Error:"));
		expect(hasError).toBe(false);

		await page.close();
	});

	test("renders without runtime errors across all UI modes (standard, neo, playful)", async () => {
		const page = await browser.newPage();
		const htmlContent = iframeDoc(bundledJs, JSON.stringify(config.props), false);

		await page.setContent(`
			<!DOCTYPE html>
			<html><body>
				<iframe id="sim-frame" sandbox="allow-scripts" srcdoc="${htmlContent}" style="width:1280px;height:540px;border:none;"></iframe>
			</body></html>
		`);

		const iframeHandle = await page.waitForSelector("#sim-frame");
		const frame = await iframeHandle!.contentFrame();
		await frame!.waitForSelector("#c");
		await frame!.evaluate(() => {
			const canvas = document.getElementById("c") as HTMLCanvasElement;
			const context = canvas.getContext("2d")!;
			const original = context.fillText.bind(context);
			(window as any).__drawnText = [];
			context.fillText = ((...args: Parameters<CanvasRenderingContext2D["fillText"]>) => {
				(window as any).__drawnText.push(String(args[0]));
				if ((window as any).__drawnText.length > 200) (window as any).__drawnText.shift();
				original(...args);
			}) as typeof context.fillText;
		});


		const uiModes = ["standard", "neo", "playful"];
		for (const mode of uiModes) {
			// Sync theme state with target UI mode
			await page.evaluate((uiMode) => {
				const iframe = document.getElementById("sim-frame") as HTMLIFrameElement;
				iframe.contentWindow!.postMessage({
					type: "bk:theme-sync",
					state: {
						theme: "dark",
						palette: "ink",
						ui: uiMode,
						colors: {
							bg: "#0a0d14",
							paper: "#121722",
							line: "rgba(255,255,255,0.12)",
							"line-strong": "rgba(255,255,255,0.28)",
							text: "#f1f5f9",
							"text-light": "#94a3b8",
							accent: "#38bdf8",
							"accent-soft": "rgba(56,189,248,0.2)",
						},
					},
				}, "*");
			}, mode);

			await delay(100);

			const isClean = await frame!.evaluate(() => {
				const hasErr = document.body.innerText.includes("Error:");
				const canvas = document.getElementById("c") as HTMLCanvasElement;
				return !hasErr && canvas && canvas.width > 0 && canvas.height > 0;
			});
			expect(isClean).toBe(true);
		}

		await page.close();
	});

	test("enforces compact controls contract and honest physics parameters", () => {
		// Only damping is primary tunable
		expect(config.tunables.damping).toBeDefined();
		expect(config.tunables.damping.advanced).toBeUndefined();

		// Collective advancedControls lists all secondary tunables
		expect(config.advancedControls).toEqual([
			"dampingMode",
			"medium",
			"stiffness",
			"mass",
			"showTrace",
			"showPhase",
		]);

		// Redundant per-control advanced flags removed
		expect(config.tunables.dampingMode.advanced).toBeUndefined();
		expect(config.tunables.medium.advanced).toBeUndefined();
		expect(config.tunables.stiffness.advanced).toBeUndefined();
		expect(config.tunables.mass.advanced).toBeUndefined();
		expect(config.tunables.showTrace.advanced).toBeUndefined();
		expect(config.tunables.showPhase.advanced).toBeUndefined();

		// runLabel tunable removed
		expect(config.tunables.runLabel).toBeUndefined();

		// Presets target mathematically exact critical damping
		// Critical damping condition: c_crit = 2 * sqrt(k * m) = 2 * sqrt(25 * 1) = 10 N·s/m
		// In critical preset: medium = water (factor 2.5), damping = 4.0 -> effective c = 10.0 N·s/m
		const crit = config.presets.critical;
		const mediumMult = crit.props.medium === "water" ? 2.5 : 1.0;
		const effectiveC = crit.props.damping * mediumMult;
		const expectedCcrit = 2 * Math.sqrt(crit.props.stiffness * crit.props.mass);
		expect(effectiveC).toBe(expectedCcrit);
	});
});
