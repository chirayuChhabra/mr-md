import { expect, test } from 'bun:test';
import puppeteer from 'puppeteer';
import { iframeDoc } from '../src/renderer/blocks/iframe';

const root = new URL('../mr-markdown-documentation/sims/', import.meta.url);

test('documentation oscillator explicitly enables timeline', async () => {
 const config = await Bun.file(new URL('oscillator.config.json', root)).json();
 expect(config.timeline).toBe(true);
});

test('oscillator snapshot protocol restores exact pixels, history and deterministic continuation', async () => {
 const config = await Bun.file(new URL('oscillator.config.json', root)).json();
 const source = await Bun.file(new URL('oscillator.js', root)).text();
 const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
 try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 600 });
  await page.setContent(`<iframe sandbox="allow-scripts allow-same-origin" style="width:1240px;height:540px" srcdoc="${iframeDoc(source, JSON.stringify(config.props), false)}"></iframe>`);
  const frame = await (await page.waitForSelector('iframe'))!.contentFrame();
  await frame!.waitForFunction(() => (window as any).bkSetupCalled);
  expect(await frame!.evaluate(() => typeof (window as any).__bkSnapshotHandlers?.restore)).toBe('function');
  const result = await frame!.evaluate(() => {
   const w = window as any;
   let clock = performance.now();
   performance.now = () => clock;
   const responses: any[] = [];
   // Exercise the production source check with synthetic parent and sibling events.
   w.parent.postMessage = (data: any) => responses.push(data);
   const send = (data: any, source: any = window.parent) => window.dispatchEvent(new MessageEvent('message', { source, data }));
   const capture = () => { send({ type: 'bk:snapshot-capture', id: 'capture' }); return responses.at(-1); };
   const advance = () => { send({ type: 'bk:play' }); w.__stopLoop(); clock += 16; w.__loop = true; w.__renderFrame(); w.__loop = false; };
   send({ type: 'bk:snapshot-query-capabilities' });
   const supported = responses.at(-1).supported;
   const initial = capture();
   const originalCount = responses.length;
   send({ type: 'bk:snapshot-capture' }, window);
   const siblingIgnored = responses.length === originalCount;
   for (let i = 0; i < 15; i++) advance();
   window.dispatchEvent(new CustomEvent('bk:action', { detail: { action: 'impulse' } }));
   w.__renderFrame();
   const saved = capture();
   const pixels = () => (document.querySelector('canvas') as HTMLCanvasElement).toDataURL();
   const image = pixels();
   let exact = true;
   const restore = (snapshot: any) => send({ type: 'bk:snapshot-restore', id: 'restore', snapshot });
   restore(saved);
   for (let i = 0; i < 10; i++) advance();
   const continuation = capture().state;
   for (let cycle = 0; cycle < 5; cycle++) {
    send({ type: 'bk:reset' });
    restore(saved);
    exact &&= JSON.stringify(capture().state) === JSON.stringify(saved.state) && pixels() === image;
    for (let i = 0; i < 10; i++) advance();
    exact &&= JSON.stringify(capture().state) === JSON.stringify(continuation);
   }
   send({ type: 'bk:pause' });
   send({ type: 'bk:snapshot-restore', id: 'resume', snapshot: saved, resumePlayback: true });
   w.__stopLoop();
   for (let i = 0; i < 3; i++) { clock += 16; w.__loop = true; w.__renderFrame(); w.__loop = false; }
   const resumedTime = capture().time;
   restore(initial);
   return { supported, siblingIgnored, exact, resumedTime, telemetry: saved.telemetry, initial: initial.state, restored: capture().state, savedTime: saved.time };
  });
  expect(result.supported).toBe(true);
  expect(result.siblingIgnored).toBe(true);
  expect(result.savedTime).toBeGreaterThan(0);
  expect(result.exact).toBe(true);
  expect(result.telemetry.displacement).toBeDefined();
  expect(result.resumedTime).toBeGreaterThan(result.savedTime);
  expect(result.restored).toEqual(result.initial);
 } finally { await browser.close(); }
});
