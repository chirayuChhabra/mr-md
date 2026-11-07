import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer";
import { renderSimulation } from "../src/renderer/blocks/simulation.js";

const chrome =
	process.env.PUPPETEER_EXECUTABLE_PATH ||
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

test.skipIf(!existsSync(chrome))(
	"measurements integrate rules, badges, all plot renderers, reset, and mobile containment",
	async () => {
		const bundle = await Bun.build({
			entrypoints: ["measurements-test-entry"],
			target: "browser",
			plugins: [
				{
					name: "measurements-test",
					setup(build) {
						build.onResolve({ filter: /^measurements-test-entry$/ }, () => ({
							path: "measurements-test-entry",
							namespace: "measurements-test",
						}));
						build.onLoad(
							{ filter: /.*/, namespace: "measurements-test" },
							() => ({
								loader: "ts",
								resolveDir: process.cwd(),
								contents: `
 import {bkWireTelemetry,bkInitTelemetry,bkResetTelemetry} from './src/client/telemetry.ts';
 import {bkExpandLab,bkSelectInspectorTab} from './src/client/workspace.ts';
 bkWireTelemetry();bkInitTelemetry();bkExpandLab('sim-0');
 Object.assign(window,{bkResetTelemetry,bkSelectInspectorTab});
 `,
							}),
						);
					},
				},
			],
		});
		expect(bundle.success).toBe(true);
		const { html } = renderSimulation(
			{
				type: "simulation",
				src: "window.bkSetup(800,500,()=>{});",
				props: { speed: 1 },
				tunables: { speed: { type: "range", min: 0, max: 2 } },
				telemetry: {
					value: {
						notify: "range-change",
						ranges: [
							{ max: 5, tone: "success", label: "Within target" },
							{ min: 5, tone: "danger", label: "Above target" },
						],
					},
				},
				measurements: {
					badge: "count",
					plots: [
						{ id: "trace", type: "line", x: "time", y: "value" },
						{ id: "points", type: "scatter", x: "time", y: "value" },
						{ id: "bars", type: "bar", data: "bars" },
						{ id: "field", type: "vector-field", data: "field" },
					],
				},
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
			await page.setViewport({ width: 1440, height: 1000 });
			const errors: string[] = [];
			page.on("pageerror", (e) => errors.push(String(e)));
			await page.setContent(
				`<style>${readFileSync("src/styles/theme.css", "utf8")}</style>${html}`,
			);
			await page.addScriptTag({ content: await bundle.outputs[0]!.text() });
			const frame = page.frames()[1]!;
			await frame.waitForFunction(
				() => typeof (window as any).bkTelemetry === "function",
			);
			await frame.evaluate(() =>
				(window as any).bkTelemetry({
					time: 0,
					value: 1,
					bars: [{ x: 1, y: 2 }],
					field: [{ x: 0, y: 0, u: 1, v: 1 }],
				}),
			);
			await page.waitForFunction(
				() =>
					document.querySelector(
						'[data-telemetry-key="value"] .bk-telemetry-num',
					)?.textContent === "1",
			);
			expect(
				await page.$eval(".bk-measurement-tab-badge", (e) =>
					e.hasAttribute("hidden"),
				),
			).toBe(true);
			await frame.evaluate(() =>
				(window as any).bkTelemetry({ time: 1, value: 6 }),
			);
			await page.waitForFunction(
				() =>
					document.querySelector(".bk-measurement-tab-badge")?.textContent ===
					"1",
			);
			await page.locator('button[role="tab"][id$="tab-telemetry"]').click();
			await page.waitForSelector(
				".bk-measurement-plot-item.is-active .bk-measurement-line",
			);
			expect(
				await page.$eval(".bk-measurement-tab-badge", (e) =>
					e.hasAttribute("hidden"),
				),
			).toBe(true);
			expect(
				await page.$eval('[data-telemetry-key="value"]', (e) =>
					e.getAttribute("data-telemetry-tone"),
				),
			).toBe("danger");
			expect(
				await page.$eval(".bk-telemetry-tone-label", (e) => e.textContent),
			).toBe("Above target");
			for (const selector of [
				".bk-measurement-scatter-point",
				".bk-measurement-bar",
				".bk-measurement-vector-shaft",
			]) {
				await page.locator('button[aria-label="Next plot"]').click();
				await page.waitForSelector(
					`.bk-measurement-plot-item.is-active ${selector}`,
				);
			}
			expect(
				await page.$$eval(
					".bk-measurement-plot-item",
					(es) =>
						es.filter((e) => getComputedStyle(e).display !== "none").length,
				),
			).toBe(1);
			await page.setViewport({ width: 390, height: 844 });
			expect(
				await page.$eval(".bk-object", (e) => {
					const r = e.getBoundingClientRect();
					return r.left >= 0 && r.right <= innerWidth;
				}),
			).toBe(true);
			for (const ui of ["standard", "neo", "playful"])
				for (const theme of ["light", "dark"]) {
					await page.evaluate(
						({ ui, theme }) => {
							document.documentElement.dataset.ui = ui;
							document.documentElement.dataset.theme = theme;
						},
						{ ui, theme },
					);
					expect(
						await page.$eval(
							".bk-measurement-plot-item.is-active .bk-measurement-svg",
							(e) => e.getBoundingClientRect().width > 0,
						),
					).toBe(true);
				}
			await page.evaluate(() => (window as any).bkResetTelemetry("sim-0"));
			expect(
				await page.$eval(
					'[data-telemetry-key="value"] .bk-telemetry-num',
					(e) => e.textContent,
				),
			).toBe("—");
			expect(
				await page.$$eval(".bk-measurement-vector-shaft", (es) => es.length),
			).toBe(0);
			expect(errors).toEqual([]);
		} finally {
			await browser.close();
		}
	},
	30000,
);
