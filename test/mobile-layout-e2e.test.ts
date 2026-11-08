import { afterAll, beforeAll, expect, test } from "bun:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer, { type Browser } from "puppeteer";

let browser: Browser;
const lesson = (name: string) => pathToFileURL(resolve("mr-markdown-documentation/out", `${name}.html`)).href;

beforeAll(async () => {
 browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
});
afterAll(async () => { await browser?.close(); });

for (const [width, height] of [[320, 740], [390, 844], [844, 390]]) {
 test(`phone ${width}×${height} replaces every simulation with a notice`, async () => {
  const page = await browser.newPage();
  try {
   await page.setViewport({ width, height, isMobile: true, hasTouch: true });
   await page.goto(lesson("creating-simulations"), { waitUntil: "domcontentloaded" });
   await page.waitForFunction(() => document.documentElement.dataset.isPhone === "true");
   expect(await page.$$(".bk-object iframe")).toHaveLength(0);
   expect(await page.$$(".bk-phone-sim-notice")).toHaveLength(5);
   expect(await page.evaluate(() => [...document.querySelectorAll(".bk-phone-sim-notice")].every(el => el.getBoundingClientRect().height > 0))).toBe(true);
   expect(await page.evaluate(() => [...document.querySelectorAll(".bk-sim-workspace, .bk-world-portal, .bk-pixel-gateway")].every(el => el.getBoundingClientRect().height === 0))).toBe(true);
   expect(await page.$eval(".bk-main", el => el.scrollWidth <= el.clientWidth)).toBe(true);
  } finally { await page.close(); }
 });
}

for (const [width, height] of [[768, 1024], [820, 1180], [1180, 820]]) {
 test(`tablet ${width}×${height} keeps expanded canvas and controls within the viewport`, async () => {
  const page = await browser.newPage();
  try {
   await page.setViewport({ width, height, isMobile: true, hasTouch: true });
   await page.goto(lesson("creating-simulations"), { waitUntil: "domcontentloaded" });
   await page.waitForSelector(".bk-sim-preview iframe");
   await page.locator('button[aria-label="Expand simulation"]').click();
   await page.waitForSelector(".bk-object--maximized");
   expect(await page.evaluate(() => [...document.querySelectorAll(".bk-object--maximized .bk-sim-stage, .bk-object--maximized .bk-sim-inspector")].every(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1;
   }))).toBe(true);
   await page.locator('button[aria-label="Exit expanded view"]').click();
   expect(await page.$(".bk-object--maximized")).toBeNull();
  } finally { await page.close(); }
 });
}

test("phone code editing, execution, and keyboard drawer dismissal work inline", async () => {
 const page = await browser.newPage();
 try {
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(lesson("coding"), { waitUntil: "domcontentloaded" });
  await page.waitForSelector('.cm-content[contenteditable="true"]');
  await page.locator('.bk-code-runner .cm-content[contenteditable="true"]').fill('console.log("Mobile edit works");');
  await page.locator(".bk-code-runner .bk-run-btn").click();
  await page.waitForFunction(() => document.querySelector(".bk-code-runner .bk-runner-logs")?.textContent?.includes("Mobile edit works"));
  expect(await page.$(".bk-object--maximized")).toBeNull();
  expect(await page.$eval(".bk-sidebar", el => (el as HTMLElement).inert)).toBe(true);
  await page.locator("#bk-topbar-sidebar-toggle").click();
  expect(await page.$eval("#bk-topbar-sidebar-toggle", el => el.getAttribute("aria-expanded"))).toBe("true");
  await page.keyboard.press("Escape");
  expect(await page.$eval("#bk-topbar-sidebar-toggle", el => el === document.activeElement)).toBe(true);
  expect(await page.$eval(".bk-sidebar", el => (el as HTMLElement).inert)).toBe(true);
 } finally { await page.close(); }
});
