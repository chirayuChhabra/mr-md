import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer";
import { renderMedia } from "../src/renderer/blocks/media.js";
import { isPhoneDevice, isTouchDevice } from "../src/client/cm-editor.js";

const chrome =
	process.env.PUPPETEER_EXECUTABLE_PATH ||
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

describe("Mobile & Touch Code / Media Experience", () => {
	test("renderMedia generates video with playsinline, webkit-playsinline and preload", () => {
		const result = renderMedia(
			{
				type: "media",
				kind: "video",
				src: "intro.mp4",
				poster: "poster.jpg",
				controls: true,
			},
			0,
			{ base: "/", strict: false } as any,
		);

		expect(result.html).toContain("playsinline");
		expect(result.html).toContain("webkit-playsinline");
		expect(result.html).toContain('preload="metadata"');
	});

	test("mobile-code.css defines 16px font on coarse pointer and suppresses phone maximize", () => {
		const css = readFileSync("src/styles/mobile-code.css", "utf8");

		// Touch font size (16px prevents iOS Safari autozoom)
		expect(css).toContain("pointer: coarse");
		expect(css).toContain("font-size: 16px !important");

		// Phone policy matching
		expect(css).toContain(
			"@media (max-width: 767px), (max-height: 500px) and (pointer: coarse)",
		);

		// Suppress expanded / maximize buttons on phones
		expect(css).toContain(".bk-object-maximize");
		expect(css).toContain("display: none !important");

		// Inline media sizing
		expect(css).toContain(".bk-media img");
		expect(css).toContain("object-fit: contain");
	});

	test.skipIf(!existsSync(chrome))(
		"Puppeteer headless: mobile viewport renders code runner inline and suppresses maximize",
		async () => {
			const browser = await puppeteer.launch({
				executablePath: chrome,
				headless: true,
				args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
			});

			try {
				const page = await browser.newPage();
				// Mobile phone viewport: 390x844 (iPhone 14)
				await page.setViewport({
					width: 390,
					height: 844,
					isMobile: true,
					hasTouch: true,
				});

				const mobileCss = readFileSync("src/styles/mobile-code.css", "utf8");
				const themeCss = readFileSync("src/styles/theme.css", "utf8");

				await page.setContent(`
					<!DOCTYPE html>
					<html>
					<head>
						<meta name="viewport" content="width=device-width, initial-scale=1.0">
						<style>${themeCss}</style>
						<style>${mobileCss}</style>
					</head>
					<body>
						<figure class="bk-object">
							<div class="bk-object-header">
								<span class="bk-object-kicker">code</span>
								<div class="bk-object-actions">
									<button type="button" class="bk-object-maximize">Maximize</button>
								</div>
							</div>
							<div class="bk-code-runner" data-lang="javascript" data-editable="true">
								<div class="bk-runner-header">
									<div class="bk-runner-header-left">
										<span class="bk-runner-lang">JS</span>
										<span class="bk-runner-title">Inline Demo</span>
									</div>
									<div class="bk-runner-header-actions">
										<button type="button" class="bk-run-btn">Run</button>
										<button type="button" class="bk-reset-btn">Reset</button>
										<button type="button" class="bk-copy-btn">Copy</button>
									</div>
								</div>
								<div class="bk-runner-editor-wrapper">
									<textarea class="bk-runner-editor">console.log("hello mobile");</textarea>
								</div>
								<div class="bk-runner-output" style="display: none;">
									<div class="bk-runner-output-header">
										<button type="button" class="bk-clear-btn">Clear</button>
									</div>
									<div class="bk-runner-logs"></div>
								</div>
							</div>
						</figure>
					</body>
					</html>
				`);

				// 1. Verify maximize button is hidden via CSS on mobile phone viewport
				const maximizeDisplay = await page.$eval(
					".bk-object-maximize",
					(el) => window.getComputedStyle(el).display,
				);
				expect(maximizeDisplay).toBe("none");

				// 2. Verify editor font-size is 16px on touch
				const editorFontSize = await page.$eval(
					".bk-runner-editor",
					(el) => window.getComputedStyle(el).fontSize,
				);
				expect(editorFontSize).toBe("16px");

				// 3. Verify Run button meets touch target height
				const runBtnHeight = await page.$eval(
					".bk-run-btn",
					(el) => el.getBoundingClientRect().height,
				);
				expect(runBtnHeight).toBeGreaterThanOrEqual(34);
			} finally {
				await browser.close();
			}
		},
	);
});
