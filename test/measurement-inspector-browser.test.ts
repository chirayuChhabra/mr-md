import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { renderInspectorTabs, renderSimulationTelemetry } from '../src/renderer/markdown/telemetry';

test('measurement inspector keeps labels, values and actions separated across themes and widths', async () => {
 const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
 try {
  const page = await browser.newPage();
  await page.setViewport({ width: 820, height: 1180 });
  const css = ['theme', 'measurement-timeline'].map(name => readFileSync(`src/styles/${name}.css`, 'utf8')).join('\n');
  const telemetry = renderSimulationTelemetry('lab', {
   displacement: { label: 'Displacement from equilibrium', unit: 'm', scene: true, graph: true, description: 'Signed distance from the equilibrium position.' },
   energy: { label: 'Velocity v', unit: 'm/s', graph: true, states: [{ when: { op: 'lt', value: -0.05 }, label: 'Moving left', tone: 'accent' }] },
  });
  await page.setContent(`<style>${css}</style><figure class="bk-object bk-object--maximized"><aside style="width:300px">${renderInspectorTabs('lab', '<div>Settings</div>', telemetry)}</aside></figure>`);
  expect(await page.$$eval('.bk-telemetry-row [data-measurement-graph]', els => els.length)).toBe(0);
  expect(await page.$$eval('.bk-measurement-graph-picker summary', els => els.length)).toBe(0);
  expect(await page.$eval('.bk-object--maximized', el => el.getBoundingClientRect().left)).toBe(0);
  await page.evaluate(() => {
   document.querySelectorAll<HTMLElement>('.bk-sim-tabpanel').forEach(panel => panel.hidden = !panel.classList.contains('bk-sim-tabpanel--telemetry'));
   document.querySelectorAll('.bk-telemetry-num').forEach(num => num.textContent = '-123.45');
   const state = document.querySelector<HTMLElement>('[data-telemetry-key="energy"] .bk-telemetry-state')!;
   state.hidden = false;
   state.textContent = 'Moving left';

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

    const state = row.querySelector<HTMLElement>('.bk-telemetry-state')!;
    const stateOverlap = !state.hidden && state.getBoundingClientRect().top < value.bottom;
    const description = row.querySelector('.bk-telemetry-description')?.getBoundingClientRect();
    return { stateOverlap, overlap: label.bottom > value.top + 1, overflow: row.scrollWidth > row.clientWidth + 1, descriptionHeight: description?.height };
   }));
   for (const row of geometry) {
    expect(row.overlap).toBe(false);
    expect(row.stateOverlap).toBe(false);
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
  await page.setViewport({ width: 820, height: 1180 });
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

test('inspector keeps full tab labels on one line and focus leaves the card quiet', async () => {
 const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
 try {
  const page = await browser.newPage();
  const css = ['theme', 'measurement-timeline'].map(name => readFileSync(`src/styles/${name}.css`, 'utf8')).join('\n');
  for (const width of [280, 346, 480]) for (const count of [2, 1, 3]) for (const theme of ['light', 'dark']) for (const ui of ['standard', 'neo', 'playful']) {
   const tabs = renderInspectorTabs('lab', count > 1 ? '<button>Setting</button>' : '', '<div>Reading</div>', { value: { label: 'Reading' } }, count === 3);
   await page.setContent(`<html data-theme="${theme}" data-ui="${ui}"><style>${css}</style><figure class="bk-object bk-object--maximized"><aside style="width:${width}px">${tabs}</aside></figure></html>`);
   if (count === 1) expect(await page.$('.bk-sim-tablist')).toBeNull();
   else {
    const tracks = await page.$eval('.bk-sim-tablist', el => getComputedStyle(el).gridTemplateColumns.split(' ').map(parseFloat));
    expect(tracks.length).toBe(count);
    expect(await page.$$eval('.bk-sim-tab', els => els.every(el => getComputedStyle(el).whiteSpace === 'nowrap'))).toBe(true);
    expect(await page.$eval('.bk-sim-tablist', el => el.scrollWidth <= el.clientWidth)).toBe(true);
   }
   const before = await page.$eval('figure', el => getComputedStyle(el).borderColor);
   await page.focus('button');
   expect(await page.$eval('figure', el => getComputedStyle(el).borderColor)).toBe(before);
   expect(await page.$eval('button:focus-visible', el => el.classList.contains('bk-sim-tab') ? getComputedStyle(el,'::after').backgroundColor !== 'rgba(0, 0, 0, 0)' : getComputedStyle(el).outlineStyle !== 'none')).toBe(true);
  }
 } finally { await browser.close(); }
}, 30000);
