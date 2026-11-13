import { expect, test } from "bun:test";
import puppeteer from "puppeteer";
import { iframeDoc } from "../src/renderer/blocks/iframe.js";
import { stepsIframeDoc } from "../src/renderer/blocks/steps-iframe.js";

for (const [kind, renderFrame] of [["block", iframeDoc], ["steps", stepsIframeDoc]] as const) {
 test(`${kind}: restored state and telemetry stay consistent, including failed restores`, async () => {
  const browser = await puppeteer.launch({headless:true,args:["--no-sandbox","--disable-gpu","--disable-dev-shm-usage"]});
  try {
   const page = await browser.newPage();
   const source = `const sim=defineSimulation({props:{}});let value=1;
    bkRegisterSnapshot({capture:()=>({value}),restore:s=>{if(s.fail)throw Error('Rejected restore');value=s.value}});
    bkSetup(800,450,()=>sim.publishTelemetry({rendered:true}));
    window.setCurrent=()=>{value=2;sim.publishTelemetry({value,futureOnly:2})};window.ready=true;`;
   await page.setContent(`<iframe srcdoc="${renderFrame(source,"{}")}"></iframe>`);
   await page.waitForFunction(() => Boolean((document.querySelector("iframe")!.contentWindow as any).ready));
   const result = await page.evaluate(async () => {
    const child = document.querySelector("iframe")!.contentWindow as any;
    const request = (type: string, id: string, extra: object = {}) => new Promise<any>(resolve => {
     const receive = (event: MessageEvent) => {
      if (event.source !== child || event.data?.id !== id) return;
      window.removeEventListener("message", receive);
      resolve(event.data);
     };
     window.addEventListener("message", receive);
     child.postMessage({type,id,...extra}, "*");
    });
    child.setCurrent();
    const failed = await request("bk:snapshot-restore", "failed", {snapshot:{state:{fail:true},props:{},telemetry:{value:9}},resumePlayback:false});
    const afterFailed = await request("bk:snapshot-capture", "after-failed");
    const restored = await request("bk:snapshot-restore", "restored", {snapshot:{state:{value:1},props:{},telemetry:{value:1}},resumePlayback:false});
    const afterRestore = await request("bk:snapshot-capture", "after-restore");
    return {failed,afterFailed,restored,afterRestore};
   });
   expect(result.failed.success).toBe(false);
   expect(result.afterFailed.state).toEqual({value:2});
   expect(result.afterFailed.telemetry).toEqual({rendered:true,value:2,futureOnly:2});
   expect(result.restored.success).toBe(true);
   expect(result.afterRestore.state).toEqual({value:1});
   expect(result.afterRestore.telemetry).toEqual({value:1,rendered:true});
  } finally { await browser.close(); }
 });
}

for (const [kind, renderFrame] of [["block", iframeDoc], ["steps", stepsIframeDoc]] as const) {
 test(`${kind}: restoring a playing snapshot redraws without advancing physics`, async () => {
  const browser = await puppeteer.launch({headless:true,args:["--no-sandbox","--disable-gpu","--disable-dev-shm-usage"]});
  try {
   const page = await browser.newPage();
   const source = `const sim=defineSimulation({props:{}});let value=0,clock=0;window.draws=0;
    bkRegisterSnapshot({capture:()=>({value}),restore:s=>{value=s.value}});
    bkSetup(800,450,()=>{value+=sim.deltaTime(clock+=16);window.draws++;if(window.__bkRestoring)window.restoringValue=value});window.ready=true;`;
   await page.setContent(`<iframe srcdoc="${renderFrame(source,"{}")}"></iframe>`);
   await page.waitForFunction(() => Boolean((document.querySelector("iframe")!.contentWindow as any).ready));
   await page.evaluate(() => document.querySelector("iframe")!.contentWindow!.postMessage({type:"bk:play"}, "*"));
   await page.waitForFunction(() => (document.querySelector("iframe")!.contentWindow as any).draws > 2);
   const result = await page.evaluate(() => new Promise<any>(resolve => {
    const child = document.querySelector("iframe")!.contentWindow as any;
    const receive = (event: MessageEvent) => {
     if (event.source !== child || event.data?.id !== "restore-playing") return;
     window.removeEventListener("message", receive);
     resolve({response:event.data,value:child.restoringValue});
    };
    window.addEventListener("message", receive);
    child.postMessage({type:"bk:snapshot-restore",id:"restore-playing",snapshot:{state:{value:1},props:{},telemetry:{},time:0},resumePlayback:true}, "*");
   }));
   expect(result.response.success).toBe(true);
   expect(result.value).toBe(1);
  } finally {await browser.close();}
 });
}
