import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer";
import { iframeDoc } from "../src/renderer/blocks/iframe.js";
import { stepsIframeDoc } from "../src/renderer/blocks/steps-iframe.js";



for (const [kind, renderFrame] of [["block", iframeDoc], ["steps", stepsIframeDoc]] as const) {
 test(`${kind}: default canvas layout fills preview and expanded aspect ratios without distortion`, async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
  try {
   const page = await browser.newPage();
   await page.setViewport({width:1600,height:1100,deviceScaleFactor:2});
   const source = `window.bkSetup(1280,720,(ctx,w,h,frame)=>{
    window.lastLayout={w,h,frame};
    ctx.fillStyle='#ff0000';ctx.fillRect(0,0,w,h);
   });`;
   await page.setContent(`<iframe srcdoc="${renderFrame(source,"{}")}" style="width:1200px;height:675px;border:0"></iframe>`);
   await page.waitForFunction(()=>!!(document.querySelector('iframe')!.contentWindow as any).lastLayout);
   for(const [width,height] of [[1200,675],[1200,900],[1500,600]]) {
    await page.$eval('iframe',(el,size)=>{el.style.width=size[0]+'px';el.style.height=size[1]+'px';},[width,height]);
    await page.waitForFunction(([w,h])=>{const win=document.querySelector('iframe')!.contentWindow as any;return win.lastLayout?.frame?.windowWidth===w&&win.lastLayout?.frame?.windowHeight===h;},{},[width,height]);
    const result=await page.$eval('iframe', el=>{
     const win=el.contentWindow as any, canvas=win.document.querySelector('canvas'), layout=win.lastLayout;
     const rect=canvas.getBoundingClientRect();
     const pixels=canvas.getContext('2d').getImageData(canvas.width-1,canvas.height-1,1,1).data;
     return {layout,pixel:Array.from(pixels),point:win.bkCanvasPoint({clientX:rect.right,clientY:rect.bottom},canvas),bitmap:[canvas.width,canvas.height]};
    });
    expect(result.layout.w/result.layout.h).toBeCloseTo(width/height,6);
    expect(result.layout.w).toBeGreaterThanOrEqual(1280);
    expect(result.layout.h).toBeGreaterThanOrEqual(720);
    expect(result.layout.frame.originX).toBeCloseTo(0,6);
    expect(result.layout.frame.originY).toBeCloseTo(0,6);
    expect(result.pixel).toEqual([255,0,0,255]);
    expect(result.point.x).toBeCloseTo(result.layout.w,4);
    expect(result.point.y).toBeCloseTo(result.layout.h,4);
    expect(result.bitmap).toEqual([width*2,height*2]);
   }
  } finally { await browser.close(); }
 });
}


test("QCD keeps pointer picking accurate after preview expands", async () => {
 const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
 try {
  const page = await browser.newPage();
  await page.setViewport({width:1500,height:1100,deviceScaleFactor:2});
  const source = readFileSync("mr-markdown-documentation/sims/qcd.js", "utf8") + `
   window.qcdState=()=>({quarks:proton.map(q=>({x:q.x,y:q.y,isDragging:q.isDragging})), dragging:!!draggingQuark});`;
  await page.setContent(`<iframe srcdoc="${iframeDoc(source,"{}")}" style="width:1200px;height:675px;border:0"></iframe>`);
  await page.waitForFunction(()=>!!(document.querySelector('iframe')!.contentWindow as any).qcdState);
  for(const height of [675,1000]) {
   await page.$eval('iframe',(el,h)=>{el.style.height=h+'px';},height);
   await page.waitForFunction(h=>{const win=document.querySelector('iframe')!.contentWindow as any;return win.document.querySelector('canvas').__bkLogicalH>=h/0.9375;},{},height);
   const point=await page.$eval('iframe',el=>{
    const win=el.contentWindow as any,canvas=win.document.querySelector('canvas'),q=win.qcdState().quarks[0],frame=el.getBoundingClientRect();
    return {x:frame.x+q.x*canvas.__bkScale,y:frame.y+q.y*canvas.__bkScale};
   });
   await page.mouse.move(point.x,point.y);
   await page.mouse.down();
   expect(await page.$eval('iframe',el=>(el.contentWindow as any).qcdState().dragging)).toBe(true);
   await page.mouse.up();
  }
 } finally {await browser.close();}
});
