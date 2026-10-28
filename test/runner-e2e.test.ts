import { afterAll, beforeAll, expect, test } from "bun:test";
import { $ } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer, { type Browser, type Page } from "puppeteer";

let browser: Browser;
let page: Page;

beforeAll(async () => {
	const htmlPath = join(
		process.cwd(),
		"mr-markdown-documentation",
		"out",
		"showcase.html",
	);

	if (!existsSync(htmlPath)) {
		await $`bun dist/cli.js build mr-markdown-documentation`.quiet();
	}

	browser = await puppeteer.launch({
		headless: true,
		args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security"],
	});
	page = await browser.newPage();

	// Intercept external Wandbox compilation requests to ensure deterministic and fast E2E tests
	await page.setRequestInterception(true);
	page.on("request", async (req) => {
		if (req.url().includes("wandbox.org/api/compile.json")) {
			if (req.method() === "OPTIONS") {
				await req.respond({
					status: 200,
					headers: {
						"Access-Control-Allow-Origin": "*",
						"Access-Control-Allow-Methods": "POST, GET, OPTIONS",
						"Access-Control-Allow-Headers": "*",
					},
				});
				return;
			}
			const postData = req.postData() || "";
			let programOutput = "Sum from compiled C++: 100\n";
			if (postData.includes("233168") || postData.includes("multiples") || postData.includes("Multiples")) {
				programOutput = "Sum: 233168\n";
			}
			// Simulate realistic compilation latency so double-click debounce is tested
			await new Promise((r) => setTimeout(r, 120));
			await req.respond({
				status: 200,
				contentType: "application/json",
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "POST, GET, OPTIONS",
					"Access-Control-Allow-Headers": "*",
				},
				body: JSON.stringify({
					status: "0",
					program_output: programOutput,
				}),
			});
		} else {
			await req.continue();
		}
	});
});

afterAll(async () => {
	if (browser) await browser.close();
});

test("E2E: Interactive Code Runner executes, updates output, resets, and clears", async () => {
	const htmlPath = join(
		process.cwd(),
		"mr-markdown-documentation",
		"out",
		"showcase.html",
	);

	await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "domcontentloaded" });

	// 1. Verify runner component is mounted and syntax highlighted
	await page.waitForSelector(".bk-code-runner");
	const runnersCount = await page.$$eval(
		".bk-code-runner",
		(els) => els.length,
	);
	expect(runnersCount).toBeGreaterThanOrEqual(1);

	// Verify syntax highlighting tokens exist in the highlight layer
	const tokenCount = await page.$$eval(
		".bk-code-runner .bk-runner-highlight .token",
		(els) => els.length,
	);
	expect(tokenCount).toBeGreaterThanOrEqual(1);

	// Verify line numbers exist
	const linesText = await page.$eval(
		".bk-code-runner .bk-runner-lines",
		(el) => el.textContent || "",
	);
	expect(linesText).toContain("1");

	// 2. Click the Run button on the first runner (Fibonacci JS runner)
	const firstRunBtn = await page.waitForSelector(
		".bk-code-runner .bk-run-btn",
	);
	expect(firstRunBtn).not.toBeNull();
	await firstRunBtn!.click();

	// 3. Wait for execution to finish
	await page.waitForSelector(
		".bk-code-runner .bk-runner-status.success",
		{ timeout: 8000 },
	);

	// 4. Verify log output
	const logsText = await page.$eval(
		".bk-code-runner .bk-runner-logs",
		(el) => el.textContent || "",
	);
	expect(logsText).toContain("Fibonacci numbers:");
	expect(logsText).toContain("13");
	expect(logsText).toContain("21");

	// 5. Test Cmd + / line commenting
	await page.focus(".bk-code-runner .bk-runner-editor");
	await page.evaluate(() => {
		const editor = document.querySelector(
			".bk-code-runner .bk-runner-editor",
		) as HTMLTextAreaElement;
		editor.selectionStart = editor.selectionEnd = 0;
		editor.dispatchEvent(
			new KeyboardEvent("keydown", { key: "/", metaKey: true, bubbles: true }),
		);
	});

	const commentedVal = await page.$eval(
		".bk-code-runner .bk-runner-editor",
		(el: any) => el.value,
	);
	expect(commentedVal).toMatch(/^\/\/\s*function fib/);

	// Press Cmd + / again to uncomment
	await page.evaluate(() => {
		const editor = document.querySelector(
			".bk-code-runner .bk-runner-editor",
		) as HTMLTextAreaElement;
		editor.selectionStart = editor.selectionEnd = 0;
		editor.dispatchEvent(
			new KeyboardEvent("keydown", { key: "/", metaKey: true, bubbles: true }),
		);
	});

	const uncommentedVal = await page.$eval(
		".bk-code-runner .bk-runner-editor",
		(el: any) => el.value,
	);
	expect(uncommentedVal).toMatch(/^function fib/);

	// 6. Test Editing code: Change code to compute 7 * 6
	await page.$eval(".bk-code-runner .bk-runner-editor", (el: any) => {
		el.value = "console.log('Result is:', 7 * 6);";
		el.dispatchEvent(new Event("input"));
	});

	// Trigger run
	await firstRunBtn!.click();
	await page.waitForFunction(
		() => {
			const logs = document.querySelector(".bk-code-runner .bk-runner-logs");
			return (
				logs && logs.textContent && logs.textContent.includes("Result is: 42")
			);
		},
		{ timeout: 8000 },
	);

	const updatedLogs = await page.$eval(
		".bk-code-runner .bk-runner-logs",
		(el) => el.textContent || "",
	);
	expect(updatedLogs).toContain("Result is: 42");

	// 7. Test Reset button: should restore Fibonacci code
	const resetBtn = await page.waitForSelector(
		".bk-code-runner .bk-reset-btn",
	);
	expect(resetBtn).not.toBeNull();
	await resetBtn!.click();

	const restoredVal = await page.$eval(
		".bk-code-runner .bk-runner-editor",
		(el: any) => el.value,
	);
	expect(restoredVal).toContain("function fib(n)");

	// 8. Test Clear button: should clear logs
	const clearBtn = await page.waitForSelector(
		".bk-code-runner .bk-clear-btn",
	);
	expect(clearBtn).not.toBeNull();
	await clearBtn!.click();

	const clearedLogs = await page.$eval(
		".bk-code-runner .bk-runner-logs",
		(el) => el.textContent?.trim() || "",
	);
	expect(clearedLogs).toBe("");

	// 9. Verify Challenge Blocks and Hint Toggle
	const challengeRunner = await page.$(
		'.bk-code-runner[data-challenge="true"]',
	);
	expect(challengeRunner).not.toBeNull();

	const hintBtn = await challengeRunner!.$(".bk-hint-btn");
	expect(hintBtn).not.toBeNull();
	await hintBtn!.click();

	const hintDrawerVisible = await challengeRunner!.$eval(
		".bk-runner-hint",
		(el: any) => el.style.display !== "none",
	);
	expect(hintDrawerVisible).toBe(true);

	// 10. Verify Challenge Check Answer Evaluation
	const checkBtn = await challengeRunner!.$(".bk-run-btn");
	expect(checkBtn).not.toBeNull();
	await checkBtn!.click();

	await page.waitForSelector(
		'.bk-code-runner[data-challenge="true"] .bk-challenge-card.success',
		{ timeout: 12000 },
	);

	const successCardText = await page.$eval(
		'.bk-code-runner[data-challenge="true"] .bk-challenge-card.success',
		(el) => el.textContent || "",
	);
	expect(successCardText).toContain("Correct! Challenge Passed");

	// 11. Verify Two-Stage Compiled Language Runner
	const compiledRunner = await page.$(
		'.bk-code-runner[data-mode="two-step"]',
	);
	expect(compiledRunner).not.toBeNull();
	const compileBtn = await compiledRunner!.$(".bk-run-btn");
	expect(compileBtn).not.toBeNull();

	const compileBtnText = await compiledRunner!.$eval(
		".bk-run-btn .bk-run-text",
		(el: any) => el.textContent?.trim(),
	);
	expect(compileBtnText).toBe("Compile");

	// Click compile button (simulating quick double-click: should not abort)
	await compileBtn!.click();
	await compileBtn!.click();

	// Wait for compilation to finish (button switches to Run Binary)
	await page.waitForFunction(
		() => {
			const status = document.querySelector(
				'.bk-code-runner[data-mode="two-step"] .bk-runner-status',
			);
			return status && status.textContent?.includes("Ready");
		},
		{ timeout: 35000 },
	);

	const binaryReadyText = await compiledRunner!.$eval(
		".bk-run-btn .bk-run-text",
		(el: any) => el.textContent?.trim(),
	);
	expect(binaryReadyText).toBe("Run Binary");

	// Click Run Binary
	await compileBtn!.click();

	await page.waitForFunction(
		() => {
			const logs = document.querySelector(
				'.bk-code-runner[data-mode="two-step"] .bk-runner-logs',
			);
			return logs && logs.textContent?.includes("Sum from compiled C++: 100");
		},
		{ timeout: 10000 },
	);

	const cppLogs = await compiledRunner!.$eval(
		".bk-runner-logs",
		(el: any) => el.textContent || "",
	);
	expect(cppLogs).toContain("$ ./a.out");
	expect(cppLogs).toContain("Sum from compiled C++: 100");

	// 12. Verify Compiled Language Challenge (C++ Challenge evaluates with Check Answer)
	const cppChallengeRunner = await page.$(
		'.bk-code-runner[data-challenge="true"][data-lang="cpp"]',
	);
	expect(cppChallengeRunner).not.toBeNull();

	const cppCheckBtn = await cppChallengeRunner!.$(".bk-run-btn");
	expect(cppCheckBtn).not.toBeNull();
	const cppCheckText = await cppChallengeRunner!.$eval(
		".bk-run-btn .bk-run-text",
		(el: any) => el.textContent?.trim(),
	);
	expect(cppCheckText).toBe("Check Answer");

	// Verify goal tag is removed from header
	const hasGoalTag = await cppChallengeRunner!.$eval(
		".bk-runner-header",
		(el: any) => el.innerHTML.includes("bk-runner-target"),
	);
	expect(hasGoalTag).toBe(false);

	// Click Check Answer on C++ challenge
	await cppCheckBtn!.click();

	await page.waitForFunction(
		() => {
			const card = document.querySelector(
				'.bk-code-runner[data-challenge="true"][data-lang="cpp"] .bk-challenge-card.success',
			);
			return card !== null;
		},
		{ timeout: 35000 },
	);

	const cppChallengeSuccess = await cppChallengeRunner!.$eval(
		".bk-challenge-card.success",
		(el: any) => el.textContent || "",
	);
	expect(cppChallengeSuccess).toContain("Correct! Challenge Passed");
}, 60000);

test("E2E: Autocomplete displays popup on typing, allows keyboard navigation, and completes with Tab", async () => {
	const htmlPath = join(
		process.cwd(),
		"mr-markdown-documentation",
		"out",
		"showcase.html",
	);

	await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "domcontentloaded" });
	await page.waitForSelector(".bk-code-runner .bk-runner-editor");

	const editorSelector = ".bk-code-runner .bk-runner-editor";

	// 1. Focus editor and type a prefix 'con'
	await page.focus(editorSelector);
	await page.keyboard.press("End");
	await page.keyboard.press("Enter");
	await page.keyboard.type("con", { delay: 30 });

	// 2. Verify autocomplete popup appears and is visible
	await page.waitForSelector(".bk-autocomplete-popup", { visible: true, timeout: 3000 });

	const popupVisible = await page.$eval(
		".bk-autocomplete-popup",
		(el) => el.style.display !== "none",
	);
	expect(popupVisible).toBe(true);

	// 3. Verify suggestions contain keywords and globals
	const itemLabels = await page.$$eval(
		".bk-autocomplete-item",
		(els) => els.map((el) => el.textContent || ""),
	);
	expect(itemLabels.some((l) => l.includes("const"))).toBe(true);
	expect(itemLabels.some((l) => l.includes("console"))).toBe(true);

	// 4. Press ArrowDown to navigate to the second suggestion
	await page.keyboard.press("ArrowDown");

	const secondActive = await page.$eval(
		".bk-autocomplete-item:nth-child(2)",
		(el) => el.classList.contains("active"),
	);
	expect(secondActive).toBe(true);

	// 5. Press Tab to accept completion
	await page.keyboard.press("Tab");

	// 6. Verify popup is closed
	const isClosed = await page.$eval(
		".bk-autocomplete-popup",
		(el) => el.style.display === "none",
	);
	expect(isClosed).toBe(true);

	// 7. Verify Escape dismisses popup
	await page.keyboard.press("Enter");
	await page.keyboard.type("fun", { delay: 30 });
	await page.waitForFunction(
		() => {
			const popup = document.querySelector(".bk-autocomplete-popup") as HTMLElement;
			return popup && popup.style.display !== "none";
		},
		{ timeout: 3000 },
	);

	await page.keyboard.press("Escape");
	const isDismissed = await page.$eval(
		".bk-autocomplete-popup",
		(el) => el.style.display === "none",
	);
	expect(isDismissed).toBe(true);
}, 30000);

test("E2E: QOL Features - Auto-closing brackets/quotes, skip-over, smart backspace, and brace expansion", async () => {
	const htmlPath = join(
		process.cwd(),
		"mr-markdown-documentation",
		"out",
		"showcase.html",
	);

	await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "domcontentloaded" });
	const editorSelector = ".bk-code-runner .bk-runner-editor";
	await page.waitForSelector(editorSelector);

	// 1. Focus editor and move cursor to the very end
	await page.evaluate((sel) => {
		const el = document.querySelector(sel) as HTMLTextAreaElement;
		el.focus();
		el.selectionStart = el.selectionEnd = el.value.length;
	}, editorSelector);
	await page.keyboard.press("Enter");

	// 2. Type opening bracket '[' -> should auto-close to '[]'
	await page.keyboard.type("[");
	let val = await page.$eval(editorSelector, (el: any) => el.value);
	expect(val.endsWith("[]")).toBe(true);

	// 3. Type inside bracket and closing ']' -> should skip over without duplicate
	await page.keyboard.type("1");
	await page.keyboard.type("]");
	val = await page.$eval(editorSelector, (el: any) => el.value);
	expect(val.endsWith("[1]")).toBe(true);
	expect(val.endsWith("[1]]")).toBe(false);

	// 4. Test quote auto-closing
	await page.keyboard.press("Enter");
	await page.keyboard.type('"');
	val = await page.$eval(editorSelector, (el: any) => el.value);
	expect(val.endsWith('""')).toBe(true);

	// 5. Test Backspace between matching quotes -> deletes both
	await page.keyboard.press("Backspace");
	val = await page.$eval(editorSelector, (el: any) => el.value);
	expect(val.endsWith('""')).toBe(false);

	// 6. Test Enter between braces '{|}' expands with indented newline
	await page.keyboard.type("{");
	val = await page.$eval(editorSelector, (el: any) => el.value);
	expect(val.endsWith("{}")).toBe(true);

	await page.keyboard.press("Enter");
	val = await page.$eval(editorSelector, (el: any) => el.value);
	expect(val).toContain("{\n  ");
}, 30000);
