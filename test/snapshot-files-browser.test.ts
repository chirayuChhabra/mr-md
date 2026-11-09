import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';
import { renderSimulation } from '../src/renderer/blocks/simulation';

test('capture names and downloads an exact PNG, adds a thumbnail, and exports a named timeline', async () => {
 const bundle=await Bun.build({entrypoints:['capture-fixture'],target:'browser',plugins:[{name:'fixture',setup(build){
  build.onResolve({filter:/^capture-fixture$/},()=>({path:'fixture',namespace:'fixture'}));
  build.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'ts',resolveDir:process.cwd(),contents:`import {bkWireMaximizeControls} from './src/client/ui.ts';import {bkWireInteractiveFrames} from './src/client/interactive.ts';import {bkWireSimControls} from './src/client/simulation.ts';import {bkWireTelemetry,bkInitTelemetry} from './src/client/telemetry.ts';bkWireMaximizeControls();bkWireInteractiveFrames();bkWireSimControls();bkWireTelemetry();bkInitTelemetry();`}));
 }}]});
 const {html}=renderSimulation({type:'simulation',label:'Capture lab',props:{speed:1},tunables:{speed:{type:'range',min:0,max:2}},telemetry:{time:{unit:'s'},position:{label:'Position',unit:'m',graph:true}},src:`const sim=defineSimulation({props:{speed:1}});let time=0;bkRegisterSnapshot({capture:()=>({time}),restore:s=>{time=s.time}});bkSetup(800,450,ctx=>{time+=sim.deltaTime();ctx.fillStyle='#cb4523';ctx.fillRect(0,0,800,450);sim.publishTelemetry({time,position:time*time})});`},0,{});
 const folder=mkdtempSync(join(tmpdir(),'mr-md-capture-'));
 const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage();page.setDefaultTimeout(8000);await page.setViewport({width:1280,height:900});
  const cdp=await page.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:folder,eventsEnabled:true});
  const downloaded=()=>new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Download did not finish')),8000);const handle=(event:any)=>{if(event.state==='completed'){clearTimeout(timer);cdp.off('Browser.downloadProgress',handle);resolve()}};cdp.on('Browser.downloadProgress',handle)});
  await page.setContent(`<style>${readFileSync('src/styles/theme.css','utf8')}${readFileSync('src/styles/measurement-timeline.css','utf8')}</style>${html}`);await page.addScriptTag({content:await bundle.outputs[0].text()});
  await page.locator('[data-bk-expand-preview]').click();
  await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('[data-bk-capture-snapshot]')?.disabled);
  await page.locator('[aria-controls$="-panel-telemetry"]').click();
  await page.locator('[data-measurement-view="graphs"]').click();
  await page.select('[data-graph-y]','position');await page.locator('[data-create-graph]').click();
  await page.waitForSelector('.bk-custom-graph-item');
  await page.locator('[data-remove-custom-graph]').click();
  expect(await page.$$('.bk-custom-graph-item')).toHaveLength(0);expect(await page.$$('.bk-graph-window')).toHaveLength(0);
  await page.locator('[data-measurement-view="stats"]').click();
  expect(await page.$eval('[data-measurement-panel="graphs"]',e=>(e as HTMLElement).hidden)).toBe(true);
  await page.locator('[data-bk-capture-snapshot]').click();await page.waitForSelector('.bk-capture-name');
  expect(await page.$eval('.bk-capture-saved',e=>e.textContent)).toBe('Saved to timeline');
  await page.$eval('.bk-capture-name input',e=>(e as HTMLInputElement).value='Spring trial');
  const pngDone=downloaded();await page.locator('.bk-capture-name button[type="submit"]').click();await pngDone;
  const png=readFileSync(join(folder,'Spring trial.png'));expect([...png.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
  await page.locator('[aria-controls$="-panel-timeline"]').click();
  const row=await page.waitForSelector('.bk-snapshot-row:has(.bk-snapshot-thumbnail)');expect(await row!.evaluate(e=>e.textContent)).toContain('Spring trial');
  await row!.click();await page.waitForFunction(()=>document.querySelector('.bk-object')?.hasAttribute('data-snapshot-viewing'));await page.locator('[aria-label="Rename snapshot"]').click();
  await page.waitForSelector('.bk-timeline-rename input');
  await page.$eval('.bk-timeline-rename input',e=>(e as HTMLInputElement).value='Renamed trial');await page.locator('.bk-timeline-rename button').click();
  expect(await page.$eval('.bk-timeline-continue-btn',e=>e.textContent)).toBe('Resume');
  await page.locator('.bk-timeline-continue-btn').click();
  await page.waitForFunction(()=>document.querySelector('.bk-object')?.getAttribute('data-bk-playback-state')==='playing');
  const jsonDone=downloaded();await page.locator('[data-export-timeline]').click();await jsonDone;
  const csv=readFileSync(join(folder,'Capture lab timeline.csv'),'utf8');
  expect(csv).toContain('Renamed trial');expect(csv).toContain('Time (s)');

 }finally{await browser.close();rmSync(folder,{recursive:true,force:true})}
},30000);
