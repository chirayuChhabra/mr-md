import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer";
import { renderSimulationControls } from "../src/renderer/markdown/controls.js";
import { renderInspectorTabs, renderSimulationTelemetry } from "../src/renderer/markdown/telemetry.js";

const chrome = process.env.PUPPETEER_EXECUTABLE_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

test.skipIf(!existsSync(chrome))("inspector keeps headings compact and aligns values in readable instrument rows", async () => {
 const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
 try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const controls = renderSimulationControls({ props: { damping: 3 }, tunables: { damping: { label: "Damping (c)", type: "range", min: 0, max: 25, unit: "N·s/m" } } });
  const telemetry = renderSimulationTelemetry("lab", { omega: { label: "Natural angular frequency ω₀", unit: "rad/s" }, frequency: { label: "Frequency f₀", unit: "Hz" } });
  await page.setContent(`<style>${readFileSync("src/styles/theme.css", "utf8")}</style><figure class="bk-object bk-object--maximized"><div class="bk-sim-workspace"><div class="bk-sim-stage"></div><aside class="bk-sim-inspector">${renderInspectorTabs("lab", controls, telemetry)}</aside></div></figure>`);
  const gap = await page.evaluate(() => {
   const textBounds = (el: Element) => { const range = document.createRange(); range.selectNodeContents(el); return range.getBoundingClientRect(); };
   return textBounds(document.querySelector(".bk-sim-range > span")!).top - textBounds(document.querySelector("legend")!).bottom;
  });
  expect(gap).toBeLessThanOrEqual(20);
  const offset = await page.evaluate(() => {
   document.querySelector('.bk-sim-tabpanel--controls')!.setAttribute('hidden', '');
   document.querySelector('.bk-sim-tabpanel--telemetry')!.removeAttribute('hidden');
   const rows = Array.from(document.querySelectorAll('.bk-telemetry-row'), el => el.getBoundingClientRect());
   const values = Array.from(document.querySelectorAll('.bk-telemetry-value'), el => el.getBoundingClientRect());
   const labels = Array.from(document.querySelectorAll('.bk-telemetry-label'), el => el.getBoundingClientRect());
   return {
    rightEdge: Math.abs(values[0].right - values[1].right),
    rowsOverlap: rows[0].bottom > rows[1].top,
    labelsOverlap: labels.some((label, index) => label.right > values[index].left),
   };
  });
  expect(offset.rightEdge).toBeLessThan(1);
  expect(offset.rowsOverlap).toBe(false);
  expect(offset.labelsOverlap).toBe(false);
 } finally { await browser.close(); }
});

test.skipIf(!existsSync(chrome))("overflow cue follows the active panel and offers navigation without a scrollbar", async () => {
 const bundle = await Bun.build({ entrypoints: ['src/client/inspector.ts'], target: 'browser', format: 'esm' });
 expect(bundle.success).toBe(true);
 const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
 try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 700 });
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  const props = Object.fromEntries(Array.from({length:20}, (_,i)=>[`parameter${i}`, i]));
  const controls = renderSimulationControls({props});
  const telemetry = renderSimulationTelemetry('overflow', {state:{label:'Status',display:'status'}});
  await page.setContent(`<style>${readFileSync('src/styles/theme.css','utf8')}</style><figure class="bk-object bk-object--maximized"><div class="bk-sim-workspace"><div class="bk-sim-stage"></div><aside class="bk-sim-inspector">${renderInspectorTabs('overflow',controls,telemetry)}</aside></div></figure>`);
  await page.addScriptTag({type:'module',content: await bundle.outputs[0].text() + '\nbkInitInspectors();'});
  await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('[data-bk-scroll-more]')!.hidden);
  expect(await page.$eval('[data-bk-scroll-label]',el=>el.textContent)).toBe('More settings below');
  await page.locator('button[aria-controls="overflow-panel-controls"][data-bk-scroll-more]').click();
  await page.waitForFunction(()=>document.querySelector('.bk-sim-tabpanel--controls')!.scrollTop>0);
  await page.$eval('.bk-sim-tabpanel--controls',el=>{el.scrollTop=el.scrollHeight;});
  await page.waitForFunction(()=>document.querySelector('[data-bk-scroll-more]')!.getAttribute('data-scroll-end')==='true');
  expect(await page.$eval('[data-bk-scroll-label]',el=>el.textContent)).toBe('Back to top');
  await page.locator('[data-bk-scroll-more]').click();
  await page.waitForFunction(()=>document.querySelector('.bk-sim-tabpanel--controls')!.scrollTop===0);
  await page.evaluate(()=>{
   document.querySelector('.bk-sim-tabpanel--controls')!.setAttribute('hidden','');
   document.querySelector('.bk-sim-tabpanel--telemetry')!.removeAttribute('hidden');
  });
  await page.waitForFunction(()=>document.querySelector<HTMLButtonElement>('[data-bk-scroll-more]')!.hidden);
 } finally { await browser.close(); }
});
