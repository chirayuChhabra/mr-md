import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

test('linear timeline keeps a long capture history bounded and keyboard accessible', async () => {
 const bundle = await Bun.build({entrypoints:['src/client/measurement-timeline.ts'],target:'browser',format:'esm'});
 const browser = await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({width:390,height:844});
  await page.setContent(`<style>${readFileSync('src/styles/theme.css','utf8') + readFileSync('src/styles/measurement-timeline.css','utf8')}body{margin:0;padding:16px}#inspector{width:300px;max-width:300px;box-sizing:border-box}</style><div id="inspector"><div id="timeline" class="bk-measurement-history"></div></div>`);
  const source = (await bundle.outputs[0].text()).replace(/export\s*\{[\s\S]*?\};?\s*$/, '');
  await page.addScriptTag({content:source + `
const snapshot = (id,time) => ({id,time,timestamp:time*1000,label:id,props:{},telemetry:{speed:time},isExact:true});
window.timeline=createMeasurementTimeline(document.querySelector('#timeline'),{schema:{speed:{label:'Speed',unit:'m/s'}},onRestoreSnapshot:()=>true});
timeline.setCapability(true);
timeline.start(0,{speed:0},snapshot('start',0));
for(let i=1;i<=40;i++) timeline.record({id:'capture-'+i,title:'Captured speed measurement '+i,time:i,snapshot:snapshot('snapshot-'+i,i)});
timeline.update(45,{speed:45},false,snapshot('present',45));`});
  expect(await page.$$eval('.bk-snapshot-row', rows => rows.length)).toBe(41);
  expect(await page.evaluate(() => (window as any).timeline.getBranchCount())).toBe(1);
  expect(await page.$$eval('.bk-snapshot-row', rows => new Set(rows.map(row => (row as HTMLElement).dataset.branchId)).size)).toBe(1);
  expect(await page.$$eval('.bk-snapshot-row', rows => rows.every(row => row.getBoundingClientRect().height >=36))).toBe(true);
  for(const theme of ['light','dark']) for(const ui of ['standard','neo','playful']) {
   await page.evaluate(({theme,ui}) => {document.documentElement.dataset.theme=theme;document.documentElement.dataset.ui=ui}, {theme,ui});
   expect(await page.$eval('#inspector', element => element.scrollWidth <= element.clientWidth+1)).toBe(true);
  }
  await page.focus('[data-id="capture-40"]');
  await page.evaluate(() => (window as any).timeline.update(46,{speed:46},true));
  expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.id)).toBe('capture-40');
  await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.id)).toBe('capture-39');
  await page.keyboard.press('End');
  expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.id)).toBe('start');
  await page.keyboard.press('Home');
  expect(await page.evaluate(() => document.activeElement?.classList.contains('bk-timeline-live-head'))).toBe(true);
  await page.locator('button[aria-label="Captured speed measurement 1, 1 s"]').click();
  expect(await page.evaluate(() => (window as any).timeline.isAtPast())).toBe(true);
  expect(await page.$eval('.bk-timeline-status', element => element.getAttribute('aria-live'))).toBe('polite');
  expect(await page.$$eval('.bk-timeline-delete-btn, .bk-timeline-focus-toggle, .bk-timeline-menu', elements => elements.length)).toBe(0);
  await page.locator('.bk-timeline-return-btn').click();
  expect(await page.evaluate(() => (window as any).timeline.isAtPast())).toBe(false);
  expect(await page.evaluate(() => (window as any).timeline.getBranches()[0].presentPoint.time)).toBe(46);
  await page.locator('button[aria-label="Captured speed measurement 1, 1 s"]').click();
  expect(await page.evaluate(() => (window as any).timeline.branchOnContinuation('Continue'))).toBe('main');
  await page.evaluate(() => (window as any).timeline.record({id:'continued',title:'Continued measurement',time:1.5}));
  expect(await page.evaluate(() => (window as any).timeline.getBranchCount())).toBe(1);
  expect(await page.$$eval('.bk-snapshot-row', rows => rows.length)).toBe(42);
  expect(await page.$('[data-id="capture-40"]')).not.toBeNull();
  expect(await page.$$eval('.bk-timeline-fork-edge', elements => elements.length)).toBe(0);
  expect(errors).toEqual([]);
 } finally {await browser.close()}
},30000);
