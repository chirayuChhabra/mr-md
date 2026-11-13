import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer";
import { renderSimulation } from "../src/renderer/blocks/simulation.js";
import { renderSteps } from "../src/renderer/blocks/steps.js";

const chrome = await puppeteer.executablePath();

async function fixture() {
 const bundle = await Bun.build({ entrypoints: ["./src/client/workspace.ts"], target: "browser", format: "esm" });
 expect(bundle.success).toBe(true);
 const source = `${await bundle.outputs[0]!.text()}\nbkWireWorkspace();`;
 const src = `bkSetup(800,450,(ctx)=>{ctx.fillStyle=bkColor('bg');ctx.fillRect(0,0,800,450);ctx.fillStyle=bkColor('text');ctx.font='28px sans-serif';ctx.textAlign='center';ctx.fillText('Drag to explore',400,225)});`;
 const blocks = [
  renderSimulation({type:"simulation",src},0,{}).html,
  renderSimulation({type:"simulation",src,props:{speed:1},tunables:{speed:{type:"range",min:0,max:2}}},1,{}).html,
  renderSimulation({type:"simulation",src,telemetry:{speed:{label:"Speed"}}},2,{}).html,
  renderSteps({type:"steps",src,steps:[{title:"Explore"}],voice:false,audio:false},3,{}).html,
 ].join("");
 return { source, blocks };
}

test.skipIf(!existsSync(chrome))("expanded scenes reserve an inspector only for authored content", async () => {
 const { source, blocks } = await fixture();
 const browser = await puppeteer.launch({headless:true,args:["--no-sandbox","--disable-gpu","--disable-dev-shm-usage"]});
 try {
  const page = await browser.newPage();
  await page.setContent(`<style>${readFileSync("src/styles/theme.css","utf8")}</style>${blocks}`);
  await page.addScriptTag({type:"module",content:source});
  for (const viewport of [{width:1440,height:900},{width:820,height:1180}]) {
   await page.setViewport(viewport);
   for (const id of ["sim-0","sim-1","sim-2","steps-3"]) {
    await page.locator(`#${id} [data-bk-expand-preview]`).click();
    const layout = await page.$eval(`#${id}`,el=>{
     const stage=el.querySelector('.bk-sim-stage')!.getBoundingClientRect();
     const workspace=el.querySelector('.bk-sim-workspace')!.getBoundingClientRect();
     return {inspector:!!el.querySelector('.bk-sim-inspector'),stageWidth:stage.width,workspaceWidth:workspace.width,playback:!!el.querySelector('[data-bk-playback]')};
    });
    expect(layout.inspector).toBe(id!=="sim-0");
    if(id==="sim-0") {
     expect(layout.stageWidth).toBe(layout.workspaceWidth);
     expect(layout.playback).toBe(true);
     const before = await page.$eval(`#${id}`,el=>el.getAttribute("data-bk-playback-state"));
     await page.locator(`#${id} [data-bk-playback]`).click();
     expect(await page.$eval(`#${id}`,el=>el.getAttribute('data-bk-playback-state'))).toBe(before === "paused" ? "playing" : "paused");
    }
    await page.keyboard.press('Escape');
   }
  }
 } finally { await browser.close(); }
});


test.skipIf(!existsSync(chrome))("phones expose desktop notices without live simulation or graph UI", async () => {
 const {source, blocks} = await fixture();
 const browser = await puppeteer.launch({headless:true,args:["--no-sandbox","--disable-gpu","--disable-dev-shm-usage"]});
 try {
  const page = await browser.newPage();
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync("src/styles/theme.css","utf8")}</style>${blocks}`);
  await page.addScriptTag({type:"module",content:source});
  expect(await page.$$eval('.bk-phone-sim-notice', notices => notices.length === 4 && notices.every(notice => notice.getBoundingClientRect().height > 0))).toBe(true);
  expect(await page.$$eval('.bk-sim-workspace', spaces => spaces.every(space => space.getBoundingClientRect().height === 0))).toBe(true);
  await page.$$eval('[data-bk-expand-preview]', buttons => buttons.forEach(button => (button as HTMLButtonElement).click()));
  expect(await page.$('.bk-object--maximized')).toBeNull();
  expect(await page.$('iframe')).toBeNull();
  expect(await page.$('.bk-graph-layer')).toBeNull();
 } finally { await browser.close(); }
});
