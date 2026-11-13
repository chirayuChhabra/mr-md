import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { renderSimulation } from '../src/renderer/blocks/simulation';

test('Measurements graphs view builds a custom plot from recorded values and windows move across the inspector', async () => {
 const bundle = await Bun.build({entrypoints:['graph-fixture'], target:'browser',plugins:[{name:'fixture',setup(build){
  build.onResolve({filter:/^graph-fixture$/},()=>({path:'fixture',namespace:'fixture'}));
  build.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'ts',resolveDir:process.cwd(),contents:`import {bkWireMaximizeControls} from './src/client/ui.ts';import {bkWireInteractiveFrames} from './src/client/interactive.ts';import {bkWireSimControls} from './src/client/simulation.ts';import {bkWireTelemetry,bkInitTelemetry} from './src/client/telemetry.ts';bkWireMaximizeControls();bkWireInteractiveFrames();bkWireSimControls();bkWireTelemetry();bkInitTelemetry();`}));
 }}]});
 const {html}=renderSimulation({type:'simulation',label:'Plot experiment',props:{speed:1},tunables:{speed:{type:'range',min:0,max:2}},telemetry:{position:{label:'Position',unit:'m',graph:true},velocity:{label:'Velocity',unit:'m/s'},state:{label:'State'}},src:`const sim=defineSimulation({props:{speed:1}});let t=0;bkSetup(800,450,ctx=>{t+=sim.deltaTime();sim.publishTelemetry({position:t*t,velocity:2*t,state:'Moving'});ctx.clearRect(0,0,800,450)});`},0,{});
 const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage(); page.setDefaultTimeout(8000);
  await page.setViewport({width:1280,height:900});
  await page.setContent(`<style>${readFileSync('src/styles/theme.css','utf8')}${readFileSync('src/styles/measurement-timeline.css','utf8')}</style>${html}`);
  await page.addScriptTag({content:await bundle.outputs[0].text()});
  await page.locator('[data-bk-expand-preview]').click();
  await page.locator('[role="tab"][aria-controls$="-panel-telemetry"]').click();
  await page.locator('[data-measurement-view="graphs"]').click();
  await page.waitForFunction(()=>Number(document.querySelector('[data-telemetry-key="position"] .bk-telemetry-num')?.textContent)>.05);
  await page.select('[data-graph-x]','velocity');await page.select('[data-graph-y]','position');
  await page.locator('[data-create-graph]').click();
  await page.waitForSelector('.bk-graph-window .bk-chart-trace');
  expect(await page.$eval('.bk-graph-window-header strong',e=>e.textContent)).toBe('Position vs Velocity');
  const sampleCount=await page.$eval('.bk-chart-trace',e=>e.getAttribute('points')?.split(' ').length||0);
  expect(sampleCount).toBeGreaterThan(1);
  const header=await page.$('.bk-graph-window-header');const box=await header!.boundingBox();
  await page.mouse.move(box!.x+60,box!.y+20);await page.mouse.down();await page.mouse.move(1000,220,{steps:5});await page.mouse.up();
  expect(await page.$eval('.bk-graph-window',e=>e.getBoundingClientRect().left)).toBeGreaterThan(600);
  expect(await page.$eval('.bk-graph-window',e=>e.getBoundingClientRect().right)).toBeGreaterThan(1200);
  await page.locator('[aria-label="Close graph"]').click();
  await page.select('[data-graph-y]','state');await page.locator('[data-create-graph]').click();
  expect(await page.$eval('.bk-graph-builder-status',e=>e.textContent)).toContain('numeric');
  await page.setViewport({width:820,height:1180});
  expect(await page.$eval('.bk-sim-tablist',e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 }finally{await browser.close()}
},30000);
