import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer";
import { renderSimulation } from "../src/renderer/blocks/simulation.js";
import { renderSteps } from "../src/renderer/blocks/steps.js";

const chrome = process.env.PUPPETEER_EXECUTABLE_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

test.skipIf(!existsSync(chrome))("fullscreen keyboard works from host, transport and iframe, including paused step navigation", async () => {
 const bundle = await Bun.build({entrypoints:["keyboard-fixture"],target:"browser",plugins:[{name:"fixture",setup(build){
  build.onResolve({filter:/^keyboard-fixture$/},()=>({path:"fixture",namespace:"fixture"}));
  build.onLoad({filter:/.*/,namespace:"fixture"},()=>({loader:"ts",resolveDir:process.cwd(),contents:`import {bkWireWorkspace} from './src/client/workspace.ts'; import {bkWireSteps} from './src/client/steps.ts'; import {bkWireSimControls} from './src/client/simulation.ts'; bkWireWorkspace(); bkWireSteps(); bkWireSimControls();`}));
 }}]});
 expect(bundle.success).toBe(true);
 const src=`const sim=defineSimulation({props:{speed:2}});window.resets=0;sim.onReset(()=>{window.resets++});bkSetup(800,450,(ctx)=>{ctx.fillStyle=bkColor('bg');ctx.fillRect(0,0,800,450)});`;
 const block=renderSimulation({type:"simulation",src,props:{speed:2},tunables:{speed:{type:"range",min:0,max:10}}},0,{}).html;
 const steps=renderSteps({type:"steps",src,props:{speed:2},tunables:{speed:{type:"range",min:0,max:10}},voice:false,audio:false,steps:[{title:"First"},{title:"Second"},{title:"Third"}]},1,{}).html;
 const browser=await puppeteer.launch({executablePath:chrome,headless:true});
 try {
  const page=await browser.newPage();
  page.on('pageerror', err => console.error('PAGE ERROR:', err));
  page.on('console', msg => console.log('CONSOLE:', msg.text()));
  await page.setViewport({width:1280,height:800});
  await page.setContent(`<style>${readFileSync('src/styles/theme.css','utf8')}</style>${block}${steps}`);
  await page.addScriptTag({content:await bundle.outputs[0]!.text()});
  await page.locator('#sim-0 [data-bk-expand-preview]').click();
  await page.waitForFunction(()=>document.querySelector('#sim-0')?.classList.contains('bk-object--maximized'));
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>document.querySelector('#sim-0')?.getAttribute('data-bk-playback-state')==='paused');
  expect(await page.$eval('#sim-0 .bk-sim-pause-overlay',el=>(el as HTMLElement).hidden)).toBe(false);
  await page.focus('#sim-0 [data-bk-playback]');
  await page.keyboard.down('Space');
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  expect(await page.$eval('#sim-0',el=>(el as HTMLElement).dataset.bkPlaybackState)).toBe('playing');
  const blockFrame=(await page.$('#sim-0 iframe'))!;
  const frame=await blockFrame.contentFrame();
  await frame!.evaluate(()=>{document.body.tabIndex=-1;document.body.focus()});
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>document.querySelector('#sim-0')?.getAttribute('data-bk-playback-state')==='paused');
  await page.locator('#sim-0 [data-bk-resume]').click();
  expect(await page.$eval('#sim-0 .bk-sim-pause-overlay',el=>(el as HTMLElement).hidden)).toBe(true);

  // Space on host control slider toggles pause/play
  await page.focus('#sim-0 input[type=range]');
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>document.querySelector('#sim-0')?.getAttribute('data-bk-playback-state')==='paused');
  expect(await page.$eval('#sim-0 .bk-sim-pause-overlay',el=>(el as HTMLElement).hidden)).toBe(false);
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>document.querySelector('#sim-0')?.getAttribute('data-bk-playback-state')==='playing');
  expect(await page.$eval('#sim-0 .bk-sim-pause-overlay',el=>(el as HTMLElement).hidden)).toBe(true);

  // Changing host control while paused resumes playback
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>document.querySelector('#sim-0')?.getAttribute('data-bk-playback-state')==='paused');
  await page.$eval('#sim-0 input[type=range]', (el) => {
    (el as HTMLInputElement).value = "8";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(()=>document.querySelector('#sim-0')?.getAttribute('data-bk-playback-state')==='playing');
  expect(await page.$eval('#sim-0 .bk-sim-pause-overlay',el=>(el as HTMLElement).hidden)).toBe(true);

  await page.keyboard.press('Escape');
  await page.locator('#steps-1 [data-bk-expand-preview]').click();
  await page.waitForFunction(()=>document.querySelector('#steps-1')?.classList.contains('bk-object--maximized'));
  await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{source:document.querySelector<HTMLIFrameElement>('#steps-1 iframe')!.contentWindow,data:{type:'bk:steps-ready'}})));
  expect(await page.$eval('#steps-1',el=>(el as HTMLElement).dataset.bkPlaybackState)).toBe('playing');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(()=>document.querySelector('#steps-1 .bk-steps-step-title')?.textContent==='Second');
  expect(await page.$eval('#steps-1',el=>(el as HTMLElement).dataset.bkPlaybackState)).toBe('paused');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(()=>document.querySelector('#steps-1 .bk-steps-step-title')?.textContent==='Third');
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(()=>document.querySelector('#steps-1 .bk-steps-step-title')?.textContent==='Second');
  await page.focus('#steps-1 .bk-steps-btn--next');
  await page.keyboard.press('Space');
  expect(await page.$eval('#steps-1 .bk-steps-step-title',el=>el.textContent)).toBe('Second');
  expect(await page.$eval('#steps-1',el=>(el as HTMLElement).dataset.bkPlaybackState)).toBe('playing');
  const stepFrame=await (await page.$('#steps-1 iframe'))!.contentFrame();
  await stepFrame!.evaluate(()=>{document.body.tabIndex=-1;document.body.focus()});
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(()=>document.querySelector('#steps-1 .bk-steps-step-title')?.textContent==='First');
  await page.focus('#steps-1 input[type=range]');
  await page.keyboard.press('ArrowRight');
  expect(await page.$eval('#steps-1 .bk-steps-step-title',el=>el.textContent)).toBe('First');

  // Space on step slider toggles pause/play
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>document.querySelector('#steps-1')?.getAttribute('data-bk-playback-state')==='paused');
  expect(await page.$eval('#steps-1 .bk-sim-pause-overlay',el=>(el as HTMLElement).hidden)).toBe(false);

  await page.keyboard.press('Space');
  await page.waitForFunction(()=>document.querySelector('#steps-1')?.getAttribute('data-bk-playback-state')==='playing');
  expect(await page.$eval('#steps-1 .bk-sim-pause-overlay',el=>(el as HTMLElement).hidden)).toBe(true);

  // Changing step control while paused resumes playback
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>document.querySelector('#steps-1')?.getAttribute('data-bk-playback-state')==='paused');
  await page.$eval('#steps-1 input[type=range]', (el) => {
    (el as HTMLInputElement).value = "7";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(()=>document.querySelector('#steps-1')?.getAttribute('data-bk-playback-state')==='playing');
  expect(await page.$eval('#steps-1 .bk-sim-pause-overlay',el=>(el as HTMLElement).hidden)).toBe(true);

  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.querySelector('.bk-object--maximized'));
 } finally {await browser.close()}
},30000);
