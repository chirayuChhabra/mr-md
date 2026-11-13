import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer";

test("floating graphs preserve the simulation viewport, move, resize, minimize and pop out", async () => {
 const bundle = await Bun.build({ entrypoints: ["src/client/measurement-graphs.ts"], target: "browser", format: "esm" });
 const source = (await bundle.outputs[0].text()).replace(/export\s*\{[\s\S]*?\};?\s*$/, "");
 const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
 try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setContent(`<style>${readFileSync("src/styles/theme.css", "utf8")}${readFileSync("src/styles/measurement-timeline.css", "utf8")}</style><figure class="bk-object--maximized"><div class="bk-sim-stage" style="width:900px;height:650px"><div class="bk-embed-frame" style="flex:1"></div></div></figure>`);
  await page.addScriptTag({ content: source + `
window.workspace = createMeasurementGraphWorkspace({figure:document.querySelector('figure'),simId:'floating',specs:measurementGraphSpecs({speed:{label:'Speed',unit:'m/s',graph:true}}),initialWindows:[],onWindowsChange:()=>{}});
workspace.update({speed:[{time:0,x:0,y:1},{time:1,x:1,y:3}]});` });
  const viewport = () => page.$eval(".bk-embed-frame", el => ({ width: el.clientWidth, height: el.clientHeight }));
  const before = await viewport();
  await page.evaluate(() => (window as any).workspace.open("speed"));
  expect(await viewport()).toEqual(before);
  const header = await page.$(".bk-graph-window-header");
  const box = await header!.boundingBox();
  await page.mouse.move(box!.x + 60, box!.y + 20);
  await page.mouse.down();
  await page.mouse.move(box!.x + 180, box!.y + 84, { steps: 5 });
  await page.mouse.up();
  expect(await page.evaluate(() => (window as any).workspace.getWindows()[0].x)).toBe(144);
  await header!.focus();
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => (window as any).workspace.getWindows()[0].x)).toBe(152);
  await page.$eval(".bk-graph-window", el => { (el as HTMLElement).style.width = "500px"; (el as HTMLElement).style.height = "340px"; });
  await page.waitForFunction(() => (window as any).workspace.getWindows()[0].width === 500);
  expect(await viewport()).toEqual(before);
  await page.locator('[aria-label="Minimize graph"]').click();
  expect(await page.$eval(".bk-graph-window", el => el.getBoundingClientRect().height)).toBe(44);
  await page.locator('[aria-label="Restore graph"]').click();
  expect(await page.$eval(".bk-graph-window", el => el.getBoundingClientRect().height)).toBe(340);
  const popupTarget = new Promise<any>(resolve => browser.once("targetcreated", resolve));
  await page.locator('[aria-label="Maximize graph"]').click();
  const popup = await (await popupTarget).page();
  await popup.waitForSelector("#charts svg");
  expect(await popup.title()).toBe("Measurement graphs");
  await popup.close();
  await page.evaluate(() => {
   const workspace = (window as any).workspace;
   workspace.register({ key: 'custom:time:speed', yKey: 'speed', label: 'Custom speed', xAxis: { key: 'time', label: 'Time' }, yAxis: { label: 'Speed' } });
   workspace.open('custom:time:speed');
  });
  const customTarget = new Promise<any>(resolve => browser.once('targetcreated', resolve));
  await page.locator('[data-measurement-key="custom:time:speed"] [aria-label="Maximize graph"]').click();
  const customPopup = await (await customTarget).page();
  await customPopup.waitForSelector('[data-measurement-key="custom:time:speed"]');
  await page.evaluate(() => (window as any).workspace.remove('custom:time:speed'));
  await customPopup.waitForFunction(() => !document.querySelector('[data-measurement-key="custom:time:speed"]'));
  expect(await customPopup.$$eval('.bk-graph-choices label', labels => labels.map(label => label.textContent))).not.toContain('Custom speed');
  await customPopup.close();
  await page.setViewport({ width: 820, height: 1180 });
  await page.$eval(".bk-graph-window", el => (el as HTMLElement).style.width = "900px");
  await page.$eval(".bk-sim-stage", el => (el as HTMLElement).style.width = "360px");
  await page.waitForFunction(() => { const el = document.querySelector('.bk-graph-window')!, a = el.getBoundingClientRect(), b = el.closest('figure')!.getBoundingClientRect(); return a.width <= 804 && a.right <= b.right; });
  const contained = await page.$eval('.bk-graph-window', el => { const a = el.getBoundingClientRect(), b = el.closest('figure')!.getBoundingClientRect(); return a.left >= b.left && a.right <= b.right; });
  expect(contained).toBe(true);
  const tabletViewport = await viewport();
  expect(await page.$eval('.bk-graph-layer', el => el.parentElement?.tagName)).toBe('FIGURE');
  await page.locator('[aria-label="Close graph"]').click();
  expect(await viewport()).toEqual(tabletViewport);
 } finally { await browser.close(); }
}, 30000);
