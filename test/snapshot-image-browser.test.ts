import { expect, test } from 'bun:test';
import puppeteer from 'puppeteer';
import { snapshotRuntimeCode } from '../src/renderer/blocks/snapshot-runtime';

test('manual capture returns exact rendered canvas pixels and preserves state on image failure', async () => {
 const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
 try {
  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 240, deviceScaleFactor: 1 });
  await page.setContent('<style>html,body{margin:0;background:#fff}canvas{display:block;width:400px;height:240px}</style><canvas width="400" height="240"></canvas>');
  await page.addScriptTag({ content: snapshotRuntimeCode });
  await page.evaluate(() => {
   const w = window as any;
   const canvas = document.querySelector('canvas')!, ctx = canvas.getContext('2d')!;
   let frame = 0;
   const draw = () => {
    frame = (frame + 1) % 200;
    ctx.fillStyle = `rgb(${frame},100,50)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    requestAnimationFrame(draw);
   };
   requestAnimationFrame(draw);
   w.bkRegisterSnapshot({ capture: () => ({ time: frame, frame }), restore: () => {} });
   const post = window.postMessage.bind(window);
   window.postMessage = ((data: any, target: string) => {
    if (data?.type === 'bk:snapshot-data') w.result = data;
    else post(data, target);
   }) as typeof window.postMessage;
   window.dispatchEvent(new MessageEvent('message', { source: window, data: { type: 'bk:snapshot-capture', id: 'image-1', includeImage: true } }));
  });
  await page.waitForFunction(() => (window as any).result?.id === 'image-1');
  const result = await page.evaluate(async () => {
   const response = (window as any).result;
   const image = new Image();
   image.src = response.imageDataUrl;
   await image.decode();
   const output = document.createElement('canvas');
   output.width = image.width; output.height = image.height;
   const ctx = output.getContext('2d')!; ctx.drawImage(image, 0, 0);
   return { success: response.success, isExact: response.isExact, frame: response.state.frame, time: response.time, width: image.width, height: image.height, pixel: [...ctx.getImageData(10, 10, 1, 1).data] };
  });
  expect(result.success).toBe(true);
  expect(result.isExact).toBe(true);
  expect(result.time).toBe(result.frame);
  expect(result.width).toBe(400);
  expect(result.height).toBe(240);
  expect(result.pixel).toEqual([result.frame, 100, 50, 255]);

  await page.evaluate(() => {
   (window as any).originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
   HTMLCanvasElement.prototype.toDataURL = () => { throw new Error('Restricted canvas'); };
   window.dispatchEvent(new MessageEvent('message', { source: window, data: { type: 'bk:snapshot-capture', id: 'image-2', includeImage: true } }));
  });
  await page.waitForFunction(() => (window as any).result?.id === 'image-2');
  const failedImage = await page.evaluate(() => (window as any).result);
  expect(failedImage.success).toBe(true);
  expect(failedImage.isExact).toBe(true);
  expect(failedImage.imageDataUrl).toBeUndefined();
  expect(failedImage.imageError).toBe('Restricted canvas');

  await page.evaluate(() => {
   HTMLCanvasElement.prototype.toDataURL = (window as any).originalToDataURL;
   document.querySelector('canvas')!.remove();
   document.body.insertAdjacentHTML('beforeend', '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="400" height="240" fill="rgb(25,75,125)"/></svg>');
   window.dispatchEvent(new MessageEvent('message', { source: window, data: { type: 'bk:snapshot-capture', id: 'image-3', includeImage: true } }));
  });
  await page.waitForFunction(() => (window as any).result?.id === 'image-3');
  const svgResult = await page.evaluate(async () => {
   const response = (window as any).result;
   const image = new Image(); image.src = response.imageDataUrl; await image.decode();
   const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
   const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
   return { success: response.success, pixel: [...ctx.getImageData(10,10,1,1).data] };
  });
  expect(svgResult.success).toBe(true);
  expect(svgResult.pixel).toEqual([25,75,125,255]);

 } finally { await browser.close(); }
}, 30000);
