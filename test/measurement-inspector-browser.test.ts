import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { renderInspectorTabs, renderSimulationTelemetry } from '../src/renderer/markdown/telemetry';

test('measurement inspector keeps labels, values and actions separated across themes and widths', async () => {
 const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
 try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const css = ['theme', 'measurement-timeline'].map(name => readFileSync(`src/styles/${name}.css`, 'utf8')).join('\n');
  const telemetry = renderSimulationTelemetry('lab', {
   displacement: { label: 'Displacement from equilibrium', unit: 'm', scene: true, graph: true, description: 'Signed distance from the equilibrium position.' },
   energy: { label: 'Mechanical energy', unit: 'J', graph: true },
  });
  await page.setContent(`<style>${css}</style><figure class="bk-object bk-object--maximized"><aside style="width:300px">${renderInspectorTabs('lab', '<div>Settings</div>', telemetry)}</aside></figure>`);
  expect(await page.$$eval('.bk-telemetry-row [data-measurement-graph]', els => els.length)).toBe(0);
  expect(await page.$$eval('.bk-measurement-graph-picker summary', els => els.length)).toBe(0);
  expect(await page.$eval('.bk-object--maximized', el => el.getBoundingClientRect().left)).toBe(0);
  await page.evaluate(() => {
   document.querySelectorAll<HTMLElement>('.bk-sim-tabpanel').forEach(panel => panel.hidden = !panel.classList.contains('bk-sim-tabpanel--telemetry'));
   document.querySelectorAll('.bk-telemetry-num').forEach(num => num.textContent = '-123.45');
  });
  for (const width of [300, 380]) for (const theme of ['light', 'dark']) for (const ui of ['standard', 'neo', 'playful']) {
   await page.evaluate(({ width, theme, ui }) => {
    document.querySelector('aside')!.style.width = `${width}px`;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.ui = ui;
   }, { width, theme, ui });
   const geometry = await page.$$eval('.bk-telemetry-row', rows => rows.map(row => {
    const labelRange = document.createRange();
    labelRange.selectNodeContents(row.querySelector('.bk-telemetry-label')!);
    const label = labelRange.getBoundingClientRect();
    const value = row.querySelector('.bk-telemetry-value')!.getBoundingClientRect();

    const description = row.querySelector('.bk-telemetry-description')?.getBoundingClientRect();
    return { overlap: label.bottom > value.top + 1, overflow: row.scrollWidth > row.clientWidth + 1, descriptionHeight: description?.height };
   }));
   for (const row of geometry) {
    expect(row.overlap).toBe(false);
    expect(row.overflow).toBe(false);
   }
   expect(geometry[0].descriptionHeight).toBeGreaterThan(12);
  }
 } finally { await browser.close(); }
}, 30000);

test('measurement navigation stays visible while the inspector scrolls', async () => {
 const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
 try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const css = ['theme', 'measurement-timeline'].map(name => readFileSync(`src/styles/${name}.css`, 'utf8')).join('\n');
  const schema = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`value${i}`, { label: `Value ${i}`, graph: true }]));
  const telemetry = renderSimulationTelemetry('lab', schema);
  await page.setContent(`<style>${css}</style><figure class="bk-object bk-object--maximized"><aside style="width:300px;height:300px">${renderInspectorTabs('lab', '<div>Settings</div>', telemetry, schema)}</aside></figure>`);
  const result = await page.evaluate(() => {
   const panel = document.querySelector<HTMLElement>('.bk-sim-tabpanel--telemetry')!;
   panel.hidden = false;
   panel.style.height = '200px';
   panel.style.flex = 'none';
   const nav = panel.querySelector<HTMLElement>('.bk-measurement-navigation')!;
   const before = nav.getBoundingClientRect().top;
   panel.scrollTop = 150;
   return { before, after: nav.getBoundingClientRect().top, scroll: panel.scrollTop, first: panel.firstElementChild === nav, height: nav.querySelector('button')!.getBoundingClientRect().height };
  });
  expect(result.first).toBe(true);
  expect(result.scroll).toBeGreaterThan(0);
  expect(Math.abs(result.after - result.before)).toBeLessThanOrEqual(1);
  expect(result.height).toBeGreaterThanOrEqual(44);
 } finally { await browser.close(); }
}, 30000);
