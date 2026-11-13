import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer";
import { iframeDoc } from "../src/renderer/blocks/iframe.js";
import { stepsIframeDoc } from "../src/renderer/blocks/steps-iframe.js";

const chrome = await puppeteer.executablePath();

test.skipIf(!existsSync(chrome))("block and step canvases preserve model coordinates across viewport changes", async () => {
 const browser = await puppeteer.launch({headless:true,args:["--no-sandbox","--disable-gpu","--disable-dev-shm-usage"]});
 try {
  const page = await browser.newPage();
  const variants = [
   {setup: "bkSetup(draw)", width:800, height:450},
   {setup: "bkSetup(draw, {width:1200,height:600})", width:1200, height:600},
   {setup: "bkSetup(1200,600,draw)", width:1200, height:600},
  ];
  for (const makeDoc of [iframeDoc, stepsIframeDoc]) {
   for (const {setup,width,height} of variants) {
    const src = `let model; function draw(ctx,w,h) { if (!model) model={x1:w/4,x2:w/2}; const distance=model.x2-model.x1; window.observed={w,h,distance,force:1/(distance*distance)}; } ${setup};`;
    await page.setViewport({width:1200,height:800});
    await page.setContent(`<iframe style="width:100vw;height:100vh;border:0" srcdoc="${makeDoc(src,"{}")}"></iframe>`);
    const sim = (await (await page.$("iframe"))!.contentFrame())!;
    await sim.waitForFunction("window.observed");
    const initial = await sim.evaluate(() => (window as any).observed);
    for (const viewport of [{width:1200,height:800},{width:500,height:900}]) {
     await page.setViewport(viewport);
     await sim.evaluate(() => window.dispatchEvent(new Event("resize")));
     const state = await sim.evaluate(() => {
      const canvas=document.querySelector("canvas")!;
      const rect=canvas.getBoundingClientRect();
      const w=window as any;
      return {fillsViewport:Math.abs(rect.width-innerWidth)<1 && Math.abs(rect.height-innerHeight)<1, observed:w.observed, point:w.bkCanvasPoint({clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2},canvas)};
     });
     expect(state.fillsViewport).toBe(true);
     expect(state.observed).toEqual(initial);
     expect(state.observed).toMatchObject({w:width,h:height,distance:width/4});
     expect(state.point.x).toBeCloseTo(width/2,1);
     expect(state.point.y).toBeCloseTo(height/2,1);
    }
   }
   for (const setup of ["bkSetup(draw,{framing:'responsive'})", "bkSetup(800,450,draw,{framing:'responsive'})"]) {
    const src = `function draw(ctx,w,h) { window.dimensions=[w,h]; } ${setup};`;
    await page.setViewport({width:1200,height:800});
    await page.setContent(`<iframe style="width:100vw;height:100vh;border:0" srcdoc="${makeDoc(src,"{}")}"></iframe>`);
    const sim = (await (await page.$("iframe"))!.contentFrame())!;
    await sim.waitForFunction("window.dimensions");
    const initial = await sim.evaluate(() => (window as any).dimensions);
    await page.setViewport({width:500,height:900});
    await sim.evaluate(() => window.dispatchEvent(new Event("resize")));
    const resized = await sim.evaluate(() => (window as any).dimensions);
    expect(resized).not.toEqual(initial);
   }
  }
 } finally {await browser.close();}
}, 20000);
