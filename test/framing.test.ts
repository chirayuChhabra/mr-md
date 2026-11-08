import { describe, expect, test } from "bun:test";
import * as fs from "fs";
import puppeteer, { type Browser } from "puppeteer";
import { iframeDoc } from "../src/renderer/blocks/iframe.js";
import { stepsIframeDoc } from "../src/renderer/blocks/steps-iframe.js";

const installedChrome = await puppeteer.executablePath();
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || (fs.existsSync(installedChrome) ? installedChrome : undefined);

describe("Canvas Framing & Viewport Runtime Contract", () => {
	describe("Code Generation & Bridge Injection", () => {
		test("iframeDoc generates containment, bleed framing, and pointer mapping", () => {
			const doc = iframeDoc("console.log('sim');", "{}", false);

			expect(doc).toContain("window.bkFitCanvas");
			expect(doc).toContain("window.bkCanvasPoint");
			expect(doc).toContain("window.bkSetup");
			expect(doc).toContain("Math.min(scaleX, scaleY)");
			expect(doc).toContain("document.body.style.backgroundColor = background");
			expect(doc).toContain("isBleed");
			expect(doc).toContain("bkSyncBackground");
			expect(doc).toContain("__bkFraming");
		});

		test("stepsIframeDoc generates framing modes and pointer mapping", () => {
			const doc = stepsIframeDoc("console.log('steps');", "{}");

			expect(doc).toContain("window.bkFitCanvas");
			expect(doc).toContain("window.bkCanvasPoint");
			expect(doc).toContain("window.bkSetup");
			expect(doc).toContain("isBleed");
			expect(doc).toContain("bkSyncBackground");
			expect(doc).toContain("__bkFraming");
		});

		test("synchronizes background immediately on load to eliminate white letterbox flash", () => {
			const doc = iframeDoc("", "{}", false);
			expect(doc).toContain("bkSyncBackground()");
			expect(doc).toContain("document.documentElement.style.backgroundColor = bg");
			expect(doc).toContain("document.body.style.backgroundColor = bg");
		});
	});

	describe("Mathematical Framing Calculations (Unit Test)", () => {
		// Mock helper replicating iframe's bkFitCanvas
		function runFit(winW: number, winH: number, reqW: number, reqH: number, dpr: number, isBleed: boolean) {
			const scaleX = winW / reqW;
			const scaleY = winH / reqH;
			const scale = Math.min(scaleX, scaleY);

			if (isBleed) {
				const diagramW = reqW * scale;
				const diagramH = reqH * scale;
				const offsetX = (winW - diagramW) / 2;
				const offsetY = (winH - diagramH) / 2;
				const viewportW = scale > 0 ? winW / scale : reqW;
				const viewportH = scale > 0 ? winH / scale : reqH;
				const originX = scale > 0 ? -offsetX / scale : 0;
				const originY = scale > 0 ? -offsetY / scale : 0;

				return {
					physW: Math.round(winW * dpr),
					physH: Math.round(winH * dpr),
					scale: dpr,
					fitScale: scale,
					offsetX,
					offsetY,
					viewportW,
					viewportH,
					originX,
					originY,
					framing: "bleed",
				};
			}

			const cssScale = Math.min(scaleX, scaleY);
			return {
				physW: Math.round(reqW * dpr),
				physH: Math.round(reqH * dpr),
				scale: dpr,
				cssScale,
				framing: "contain",
				offsetX: 0,
				offsetY: 0,
			};
		}

		test("Default contain mode preserves fixed canvas size with uniform CSS scale", () => {
			// e.g. 1280x720 canvas in a 1200x900 expanded window
			const fit = runFit(1200, 900, 1280, 720, 2, false);
			expect(fit.framing).toBe("contain");
			expect(fit.physW).toBe(1280 * 2);
			expect(fit.physH).toBe(720 * 2);
			expect(fit.cssScale).toBeCloseTo(1200 / 1280, 4); // 0.9375
		});

		test("Bleed mode sizes canvas to full window and centers diagram with zero stretching", () => {
			// Window: 1200x900 (taller than 16:9 1280x720)
			const fit = runFit(1200, 900, 1280, 720, 2, true);
			expect(fit.framing).toBe("bleed");
			expect(fit.physW).toBe(1200 * 2); // Fills physical window
			expect(fit.physH).toBe(900 * 2);
			expect(fit.fitScale).toBeCloseTo(1200 / 1280, 4); // 0.9375

			// In horizontal direction, fits window exactly (offsetX = 0)
			expect(fit.offsetX).toBeCloseTo(0, 4);

			// In vertical direction, centered with letterbox space absorbed into viewport
			// diagramH = 720 * 0.9375 = 675. Remaining space = 900 - 675 = 225. Offset = 112.5.
			expect(fit.offsetY).toBeCloseTo(112.5, 4);

			// Viewport in logical coords
			expect(fit.viewportW).toBeCloseTo(1280, 4);
			expect(fit.viewportH).toBeCloseTo(960, 4); // 900 / 0.9375 = 960
			expect(fit.originX).toBeCloseTo(0, 4);
			expect(fit.originY).toBeCloseTo(-120, 4); // -112.5 / 0.9375 = -120

			// Whole diagram [0..1280] x [0..720] is strictly within visible bounds [-120..840]
			expect(fit.originY).toBeLessThanOrEqual(0);
			expect(fit.originY + fit.viewportH).toBeGreaterThanOrEqual(720);
		});

		test("Bleed mode in ultra-wide window centers diagram horizontally without cropping", () => {
			// Window: 1920x600 (wider than 16:9 1280x720)
			const fit = runFit(1920, 600, 1280, 720, 1, true);
			expect(fit.fitScale).toBeCloseTo(600 / 720, 4); // 0.8333
			expect(fit.offsetY).toBeCloseTo(0, 4);
			// diagramW = 1280 * (600/720) = 1066.67. Remaining space = 1920 - 1066.67 = 853.33. Offset = 426.67.
			expect(fit.offsetX).toBeCloseTo((1920 - 1280 * (600 / 720)) / 2, 2);

			// Diagram [0..1280] x [0..720] fits completely vertically and horizontally
			expect(fit.originX).toBeLessThanOrEqual(0);
			expect(fit.originX + fit.viewportW).toBeGreaterThanOrEqual(1280);
		});

		test("Pointer mapping in bleed mode maps window center to exact logical center", () => {
			const winW = 1200;
			const winH = 900;
			const reqW = 1280;
			const reqH = 720;
			const fit = runFit(winW, winH, reqW, reqH, 1, true);

			function mapPoint(clientX: number, clientY: number) {
				return {
					x: (clientX - fit.offsetX) / fit.fitScale,
					y: (clientY - fit.offsetY) / fit.fitScale,
				};
			}

			// Center of window
			const centerPt = mapPoint(winW / 2, winH / 2);
			expect(centerPt.x).toBeCloseTo(reqW / 2, 4); // 640
			expect(centerPt.y).toBeCloseTo(reqH / 2, 4); // 360

			// Top-left of diagram
			const tlPt = mapPoint(fit.offsetX, fit.offsetY);
			expect(tlPt.x).toBeCloseTo(0, 4);
			expect(tlPt.y).toBeCloseTo(0, 4);

			// Bottom-right of diagram
			const brPt = mapPoint(fit.offsetX + reqW * fit.fitScale, fit.offsetY + reqH * fit.fitScale);
			expect(brPt.x).toBeCloseTo(reqW, 4);
			expect(brPt.y).toBeCloseTo(reqH, 4);

			// Top-most edge of window (y = 0)
			const topEdgePt = mapPoint(winW / 2, 0);
			expect(topEdgePt.y).toBeCloseTo(fit.originY, 4); // Smooth negative logical coord
		});
	});

	if (CHROME_PATH) {
		describe("Browser Runtime Framing Integration", () => {
			let browser: Browser;

			test("renders bleed-framed simulation in real browser with zero distortion", async () => {
				browser = await puppeteer.launch({
					headless: true,
					executablePath: CHROME_PATH,
					args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
				});

				const page = await browser.newPage();
				await page.setViewport({ width: 1400, height: 900 });

				const simCode = `
					window.__simDrawn = false;
					window.bkSetup(1280, 720, function(ctx, w, h, frame) {
						window.__simDrawn = true;
						window.__frameInfo = frame;
					}, { framing: "bleed" });
				`;
				const htmlContent = iframeDoc(simCode, "{}", false);

				await page.setContent(`
					<!DOCTYPE html>
					<html><body>
						<iframe id="test-frame" srcdoc="${htmlContent}" style="width:1200px;height:900px;border:none;"></iframe>
					</body></html>
				`);

				await page.waitForFunction(() => {
					const iframe = document.getElementById("test-frame") as HTMLIFrameElement;
					return (iframe?.contentWindow as any)?.__simDrawn === true;
				}, { timeout: 5000 });

				const result = await page.evaluate(() => {
					const iframe = document.getElementById("test-frame") as HTMLIFrameElement;
					const win = iframe.contentWindow as any;
					const canvas = win.document.getElementById("c") as HTMLCanvasElement;
					const fit = win.bkFitCanvas(canvas, 1280, 720, { framing: "bleed" });

					// Test pointer mapping on canvas
					const centerPt = win.bkCanvasPoint({ clientX: 600, clientY: 450 }, canvas);

					return {
						canvasStyleWidth: canvas.style.width,
						canvasStyleHeight: canvas.style.height,
						canvasTransform: canvas.style.transform,
						framing: fit.framing,
						centerX: centerPt.x,
						centerY: centerPt.y,
						frameInfo: win.__frameInfo,
					};
				});

				expect(result.canvasStyleWidth).toBe("100%");
				expect(result.canvasStyleHeight).toBe("100%");
				expect(result.canvasTransform).toBe("none");
				expect(result.framing).toBe("bleed");
				// In 1200x900 viewport with 1280x720 diagram, (600, 450) is the center
				expect(result.centerX).toBeCloseTo(640, 1);
				expect(result.centerY).toBeCloseTo(360, 1);
				expect(result.frameInfo.width).toBe(1280);
				expect(result.frameInfo.height).toBe(720);

				await browser.close();
			});

			test("preserves explicit contain framing", async () => {
				browser = await puppeteer.launch({
					headless: true,
					executablePath: CHROME_PATH,
					args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
				});

				const page = await browser.newPage();
				await page.setViewport({ width: 1400, height: 900 });

				const simCode = `
					window.__simDrawn = false;
					window.bkSetup(800, 500, { framing: "contain" }, function(ctx, w, h) {
						window.__simDrawn = true;
						window.__simW = w;
						window.__simH = h;
					});
				`;
				const htmlContent = iframeDoc(simCode, "{}", false);

				await page.setContent(`
					<!DOCTYPE html>
					<html><body>
						<iframe id="test-frame" srcdoc="${htmlContent}" style="width:1200px;height:900px;border:none;"></iframe>
					</body></html>
				`);

				await page.waitForFunction(() => {
					const iframe = document.getElementById("test-frame") as HTMLIFrameElement;
					return (iframe?.contentWindow as any)?.__simDrawn === true;
				}, { timeout: 5000 });

				const result = await page.evaluate(() => {
					const iframe = document.getElementById("test-frame") as HTMLIFrameElement;
					const win = iframe.contentWindow as any;
					const canvas = win.document.getElementById("c") as HTMLCanvasElement;

					return {
						canvasStyleWidth: canvas.style.width,
						canvasStyleHeight: canvas.style.height,
						canvasTransform: canvas.style.transform,
						w: win.__simW,
						h: win.__simH,
						bodyBg: win.document.body.style.backgroundColor,
					};
				});

				expect(result.canvasStyleWidth).toBe("800px");
				expect(result.canvasStyleHeight).toBe("500px");
				expect(result.canvasTransform).toContain("scale(");
				expect(result.w).toBe(800);
				expect(result.h).toBe(500);
				// Body background is synchronized rather than empty/white
				expect(result.bodyBg).toBeTruthy();

				await browser.close();
			});
		});
	}
});
