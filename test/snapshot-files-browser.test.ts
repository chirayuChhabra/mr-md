import { expect, test } from 'bun:test';
import puppeteer from 'puppeteer';
import { snapshotRuntimeCode } from '../src/renderer/blocks/snapshot-runtime.js';

test('a saved moment retains its PNG and downloads with its chosen name',async()=>{
 const bundle=await Bun.build({entrypoints:['src/client/measurement-timeline.ts'],target:'browser',format:'esm'});
 const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage();await page.setContent('<div id="saved"></div>');
  await page.addScriptTag({content:(await bundle.outputs[0].text()).replace(/export\s*\{[\s\S]*?\};?\s*$/, "")+"\nwindow.__createSaved=createMeasurementTimeline;"});
  await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;canvas.getContext('2d')!.fillRect(0,0,32,32);
   const t=(window as any).__createSaved(document.querySelector('#saved'),{schema:{},store:{read:async()=>({version:1,moments:[]}),write:async()=>{}}});
   await t.ready;await t.record({kind:'snapshot',title:'Low damping',time:2,snapshot:{id:'moment',time:2,label:'Low damping',timestamp:1,props:{},telemetry:{},state:{time:2},isExact:true,imageDataUrl:canvas.toDataURL()}});
   (window as any).__download=null;
   HTMLAnchorElement.prototype.click=function(){(window as any).__download={name:this.download,url:this.href}};
  });
  expect(await page.$eval('.bk-saved-open img',image=>(image as HTMLImageElement).src)).toStartWith('data:image/png');
  await page.locator('.bk-saved-card-actions button:nth-child(2)').click();
  const download=await page.evaluate(()=>(window as any).__download);
  expect(download.name).toBe('Low damping.png');expect(download.url).toStartWith('blob:');
 }finally{await browser.close()}
},20000);


test('snapshot capture excludes space around the scene', async () => {
 const browser = await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 try {
  const page = await browser.newPage();
  await page.setContent('<style>body{margin:0;background:#000}canvas{display:block;width:320px;height:200px;margin:50px}</style><canvas width="320" height="200"></canvas>');
  await page.addScriptTag({content:snapshotRuntimeCode});
  const dimensions = await page.evaluate(async () => {
   const result = await (window as any).__bkCaptureSnapshotImage();
   const image = new Image(); image.src = result.imageDataUrl; await image.decode();
   return {width:image.naturalWidth,height:image.naturalHeight};
  });
  expect(dimensions).toEqual({width:320,height:200});
 } finally { await browser.close(); }
}, 20000);
