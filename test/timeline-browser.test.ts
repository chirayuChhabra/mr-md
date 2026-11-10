import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

test('linear timeline preserves captured history and supports snapshot rename', async () => {
 const bundle = await Bun.build({entrypoints:['src/client/measurement-timeline.ts'], target:'browser',format:'esm'});
 const browser = await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 try {
  const page=await browser.newPage();
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  page.setDefaultTimeout(5000);
  await page.setViewport({width:390,height:844});
  await page.setContent(`<style>${readFileSync('src/styles/theme.css','utf8')+readFileSync('src/styles/measurement-timeline.css','utf8')}</style><div class="bk-measurement-history" style="width:300px;margin:24px;display:none" id="history"></div>`);
  const source=(await bundle.outputs[0].text()).replace(/export\s*\{[\s\S]*?\};?\s*$/, '');
  await page.addScriptTag({content:source+`
const snapshot=(id,time)=>({id,time,timestamp:time,label:id,props:{},telemetry:{speed:time},isExact:true});
window.timeline=createMeasurementTimeline(document.querySelector('#history'),{schema:{speed:{label:'Speed',unit:'m/s'}},onCompareBranch:branch=>window.compared=branch,onRestoreSnapshot:()=>true});
timeline.setCapability(true);timeline.start(0,{speed:0},snapshot('start',0));
timeline.record({id:'one',title:'First crossing',time:1,snapshot:snapshot('one',1)});
timeline.record({id:'two',title:'Later crossing',time:2,tone:'success',snapshot:snapshot('two',2)});
timeline.update(3,{speed:3},false,snapshot('present',3));`});
  await page.$eval('#history',e=>(e as HTMLElement).style.display='');
  const first=await page.waitForSelector('button[aria-label="First crossing, 1 s"]');
  await first!.click();
  expect(await page.$eval('.bk-timeline-node-details',e=>(e as HTMLElement).innerText)).toContain('First crossing');
  expect(await page.evaluate(()=>{const t=(window as any).timeline;t.update(8,{speed:8},true);return t.getBranches().length})).toBe(1);
  await page.evaluate(()=>{(window as any).timeline.branchOnContinuation('Interaction')});
  await page.evaluate(()=>{(window as any).timeline.record({id:'child',title:'Child crossing',time:1.5})});
  expect(await page.$$eval('.bk-snapshot-row',nodes=>nodes.every(n=>n.querySelectorAll('.bk-snapshot-dot').length===1))).toBe(true);
  expect(await page.$$eval('.bk-timeline-branch-pill',nodes=>nodes.length)).toBe(0);
  expect(await page.$$eval('.bk-snapshot-row',nodes=>nodes.every(n=>n.querySelector('.bk-snapshot-content')))).toBe(true);
  expect(await page.$$eval('.bk-snapshot-row[data-lane="0"]', rows=>rows.every((row,i)=>i===0||row.getBoundingClientRect().top>rows[i-1].getBoundingClientRect().top))).toBe(true);
  for(const theme of ['light','dark']) for(const ui of ['standard','neo','playful']) {
   await page.evaluate(({theme,ui})=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.ui=ui},{theme,ui});
   expect(await page.$eval('#history',el=>el.getBoundingClientRect().right<=window.innerWidth)).toBe(true);
  }
  expect(await page.$eval('[data-id="two"]',n=>getComputedStyle(n,'::before').content)).toBe('none');
  expect(await page.$eval('[data-id="two"] .bk-snapshot-dot',n=>n.getBoundingClientRect().width)).toBe(8);
  expect(await page.$eval('.bk-snapshot-row:last-child',n=>n.getAttribute('data-id'))).toBe('start');
  await page.waitForFunction(()=>[...document.querySelectorAll<SVGPathElement>('.bk-snapshot-edges path')].every(path=>{
   const svg=path.ownerSVGElement!, start=path.getPointAtLength(0),end=path.getPointAtLength(path.getTotalLength());
   const dot=(id:string)=>document.querySelector<HTMLElement>(`[data-id="${id}"] .bk-snapshot-dot`)!.getBoundingClientRect();
   const a=dot(path.dataset.child!),b=dot(path.dataset.parent!),base=svg.getBoundingClientRect().top;
   return Math.abs(start.y-(a.top+a.height/2-base))<1 && Math.abs(end.y-(b.top+b.height/2-base))<1;
  }));
  await page.locator('button[aria-label="First crossing, 1 s"]').click();
  await page.locator('button[aria-label="Rename snapshot"]').click();
  await page.locator('input[aria-label="Snapshot name"]').fill('Renamed crossing');
  await page.keyboard.press('Enter');
  await page.waitForSelector('button[aria-label="Renamed crossing, 1 s"]');
  expect(await page.evaluate(() => (window as any).timeline.getBranches().length)).toBe(1);
  expect(await page.$$eval('.bk-timeline-fork-edge', nodes => nodes.length)).toBe(0);
  expect(errors).toEqual([]);
 } finally {await browser.close()}
},30000);

test('harness restores a snapshot and continues on the same timeline after control interaction', async () => {
 const {renderSimulation}=await import('../src/renderer/blocks/simulation.js');
 const bundle=await Bun.build({entrypoints:['harness-test'],target:'browser',plugins:[{name:'harness-test',setup(build){
  build.onResolve({filter:/^harness-test$/},()=>({path:'harness-test',namespace:'harness'}));
  build.onLoad({filter:/.*/,namespace:'harness'},()=>({resolveDir:process.cwd(),loader:'ts',contents:`
import {bkWireMaximizeControls} from './src/client/ui.ts';
import {bkWireInteractiveFrames} from './src/client/interactive.ts';
import {bkWireSimControls} from './src/client/simulation.ts';
import {bkWireTelemetry,bkInitTelemetry} from './src/client/telemetry.ts';
bkWireMaximizeControls();bkWireInteractiveFrames();bkWireSimControls();bkWireTelemetry();bkInitTelemetry();`}));
 }}]});
 const {html}=renderSimulation({type:'simulation',label:'Timeline experiment',props:{speed:1},tunables:{speed:{label:'Speed',type:'range',min:0,max:5}},telemetry:{time:{label:'Time',unit:'s',graph:true}},measurements:{timeline:true},src:`
const sim=window.defineSimulation({props:{speed:1}});let time=0;window.__readTime=()=>time;
window.bkRegisterSnapshot({capture:()=>({time}),restore:s=>{time=s.time;window.__savedTime=time;}});
window.bkSetup(800,450,ctx=>{time+=sim.deltaTime()*sim.props.speed;sim.publishTelemetry({time});ctx.clearRect(0,0,800,450);});`},0,{});
 const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 try {
  const page=await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.setViewport({width:1280,height:900});
  await page.setContent(`<style>${readFileSync('src/styles/theme.css','utf8')+readFileSync('src/styles/measurement-timeline.css','utf8')}</style>${html}`);
  await page.addScriptTag({content:await bundle.outputs[0].text()});
  await page.locator('[data-bk-expand-preview]').click();
  await page.waitForFunction(()=>{const b=document.querySelector<HTMLButtonElement>('[data-bk-capture-snapshot]');return b&&!b.disabled});
  const frame=page.frames().find(f=>f.parentFrame()===page.mainFrame())!;
  await frame.waitForFunction(()=>(window as any).__readTime()>0.2);
  await page.locator('[role="tab"][aria-controls$="-panel-timeline"]').click();
  await page.locator('[data-bk-capture-snapshot]').click();
  const node=await page.waitForSelector('.bk-snapshot-row[data-kind="snapshot"]:not([data-id="start"])');
  const savedTime=Number(await node!.evaluate(e=>(e as HTMLElement).dataset.time));
  const savedId=await node!.evaluate(e=>(e as HTMLElement).dataset.id);
  await frame.waitForFunction(t=>(window as any).__readTime()>t+0.25,{},savedTime);
  await page.locator('[data-bk-capture-snapshot]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.bk-snapshot-row[data-kind="snapshot"]:not([data-id="start"])').length>=2);
  await page.locator('[data-bk-playback]').click();
  await page.locator(`[data-id="${savedId}"]`).click();
  await page.waitForFunction(()=>document.querySelector('.bk-object')?.getAttribute('data-snapshot-viewing')==='true');
  expect(await frame.evaluate(()=>(window as any).__readTime())).toBeCloseTo(savedTime,5);
  await page.locator('.bk-timeline-return-btn').click();
  await page.waitForFunction(()=>!document.querySelector('.bk-object')?.hasAttribute('data-snapshot-viewing'));
  expect(await frame.evaluate(()=>(window as any).__readTime())).toBeGreaterThan(savedTime+0.1);
  await page.locator(`[data-id="${savedId}"]`).click();
  await page.waitForFunction(()=>document.querySelector('.bk-object')?.hasAttribute('data-snapshot-viewing'));
  expect(await page.$eval('iframe',e=>e.hasAttribute('inert'))).toBe(false);
  expect(await page.$eval('[data-bk-prop="speed"]',e=>(e as HTMLInputElement).disabled)).toBe(false);
  await page.$eval('[data-bk-prop="speed"]', e=>{(e as HTMLInputElement).value='2';e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>!document.querySelector('.bk-object')?.hasAttribute('data-snapshot-viewing'));
  expect(await page.$eval('iframe',e=>e.hasAttribute('inert'))).toBe(false);
  expect(await page.$eval('[data-bk-prop="speed"]',e=>(e as HTMLInputElement).disabled)).toBe(false);
  expect(await page.$$eval('.bk-timeline-fork-edge',nodes=>nodes.length)).toBe(0);
  const forkCount=await page.$$eval('.bk-timeline-fork-edge',nodes=>nodes.length);
  await page.locator(`[data-id="${savedId}"]`).click();
  await page.waitForFunction(()=>document.querySelector('.bk-object')?.hasAttribute('data-snapshot-viewing'));
  await frame.locator('canvas').click();
  await page.waitForFunction(()=>!document.querySelector('.bk-object')?.hasAttribute('data-snapshot-viewing'));
  const showAll = await page.$('[data-action="show-all"]');
  if (showAll) await showAll.click();
  expect(await page.$$eval('.bk-timeline-fork-edge',nodes=>nodes.length)).toBe(forkCount);
  // Direct paused spatial edits remain paused; only explicit Play/Space resumes
  expect(await page.$eval('.bk-object',e=>(e as HTMLElement).dataset.bkPlaybackState)).toBe('paused');
  expect(await page.$eval('.bk-sim-pause-overlay',e=>(e as HTMLElement).hidden)).toBe(false);
  await page.locator('[data-bk-playback]').click();
  expect(await page.$eval('.bk-object',e=>(e as HTMLElement).dataset.bkPlaybackState)).toBe('playing');
  expect(await page.$eval('.bk-sim-pause-overlay',e=>(e as HTMLElement).hidden)).toBe(true);

 } finally {await browser.close()}
},30000);

test('spring lab harness restores exact model values, continues linearly, and resets captured history', async () => {
 const { renderSimulation } = await import('../src/renderer/blocks/simulation.js');
 const springConfig = JSON.parse(readFileSync('playground/measurements-lab/spring.config.json', 'utf8'));
 const springSrc = readFileSync('playground/measurements-lab/spring.js', 'utf8');

 const bundle = await Bun.build({
  entrypoints: ['harness-spring-test'],
  target: 'browser',
  plugins: [{
   name: 'harness-spring-test',
   setup(build) {
    build.onResolve({ filter: /^harness-spring-test$/ }, () => ({ path: 'harness-spring-test', namespace: 'harness' }));
    build.onLoad({ filter: /.*/, namespace: 'harness' }, () => ({
     resolveDir: process.cwd(),
     loader: 'ts',
     contents: `
import { bkWireMaximizeControls } from './src/client/ui.ts';
import { bkWireInteractiveFrames } from './src/client/interactive.ts';
import { bkWireSimControls } from './src/client/simulation.ts';
import { bkWireTelemetry, bkInitTelemetry } from './src/client/telemetry.ts';
bkWireMaximizeControls();
bkWireInteractiveFrames();
bkWireSimControls();
bkWireTelemetry();
bkInitTelemetry();
`
    }));
   }
  }]
 });

 const { html } = renderSimulation({
  type: 'simulation',
  label: springConfig.label || 'Damped spring',
  props: springConfig.props || { mass: 1, stiffness: 8, damping: 0.12 },
  tunables: springConfig.tunables || {},
  telemetry: springConfig.telemetry || {},
  measurements: { timeline: true },
  src: springSrc,
 }, 0, {});

 const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
 });

 try {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  await page.setViewport({ width: 1280, height: 900 });
  await page.setContent(`<style>${readFileSync('src/styles/theme.css', 'utf8') + readFileSync('src/styles/measurement-timeline.css', 'utf8')}</style>${html}`);
  await page.addScriptTag({ content: await bundle.outputs[0].text() });

  await page.locator('[data-bk-expand-preview]').click();
  await page.waitForFunction(() => {
   const b = document.querySelector<HTMLButtonElement>('[data-bk-capture-snapshot]');
   return b && !b.disabled;
  });

  const frame = page.frames().find(f => f.parentFrame() === page.mainFrame())!;

  // 1. Verify model initial snapshot was captured at Start registration ordering
  await frame.waitForFunction(() => (window as any).__bkInitialSnapshot?.state !== undefined);
  const initialSnapshot = await frame.evaluate(() => (window as any).__bkInitialSnapshot);
  expect(initialSnapshot.state.x).toBeCloseTo(0.65, 2);
  expect(initialSnapshot.state.v).toBeCloseTo(0, 2);
  expect(initialSnapshot.time).toBe(0);

  // 2. Let simulation run and verify physics advances
  await frame.waitForFunction(() => {
   const s = (window as any).__bkSnapshotHandlers?.capture();
   return s && s.time > 0.4 && Math.abs(s.x - 0.65) > 0.05;
  });

  // Switch to timeline tab
  await page.locator('[role="tab"][aria-controls$="-panel-timeline"]').click();

  // 3. Capture a snapshot at present time (t ~ 0.5s)
  await page.locator('[data-bk-capture-snapshot]').click();
  const snap1Node = await page.waitForSelector('.bk-snapshot-row[data-kind="snapshot"]:not([data-id="start"])');
  const snap1Time = Number(await snap1Node!.evaluate(e => (e as HTMLElement).dataset.time));
  const snap1Id = await snap1Node!.evaluate(e => (e as HTMLElement).dataset.id);
  expect(snap1Time).toBeGreaterThan(0.2);

  // Let simulation advance further
  await frame.waitForFunction(t => (window as any).__bkSnapshotHandlers.capture().time > t + 0.3, {}, snap1Time);

  // Pause simulation
  await page.locator('[data-bk-playback]').click();
  const pauseState = await frame.evaluate(() => (window as any).__bkSnapshotHandlers.capture());
  expect(pauseState.time).toBeGreaterThan(snap1Time);

  // 4. Test exact initial Start restore
  const startBtn = await page.waitForSelector('.bk-snapshot-row[data-id="start"]');
  await startBtn!.click();
  await page.waitForFunction(() => document.querySelector('.bk-object')?.getAttribute('data-snapshot-viewing') === 'true');

  // Verify ACTUAL model values in iframe are restored to initial state (x=0.65, time=0)
  const restoredStart = await frame.evaluate(() => (window as any).__bkSnapshotHandlers.capture());
  expect(restoredStart.x).toBeCloseTo(0.65, 2);
  expect(restoredStart.time).toBeCloseTo(0, 2);
  expect(restoredStart.v).toBeCloseTo(0, 2);

  // 5. Return to live present
  await page.locator('.bk-timeline-return-btn').click();
  await page.waitForFunction(() => !document.querySelector('.bk-object')?.hasAttribute('data-snapshot-viewing'));

  // Model values restored to live present values
  const returnedState = await frame.evaluate(() => (window as any).__bkSnapshotHandlers.capture());
  expect(returnedState.time).toBeCloseTo(pauseState.time, 1);

  // Live control changes keep all captured snapshots on the same timeline.
  const forkCountBefore = await page.$$eval('.bk-timeline-fork-edge', nodes => nodes.length);
  await page.$eval('[data-bk-prop="mass"]', e => {
   (e as HTMLInputElement).value = '2.5';
   e.dispatchEvent(new Event('input', { bubbles: true }));
   e.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(await frame.evaluate(() => (window as any).__simProps?.mass)).toBe(2.5);
  // Captured history remains on one timeline.
  expect(await page.$$eval('.bk-timeline-fork-edge', nodes => nodes.length)).toBe(forkCountBefore);

  // Restoring and editing an older snapshot continues on the same timeline.
  await page.locator(`[data-id="${snap1Id}"]`).click();
  await page.waitForFunction(() => document.querySelector('.bk-object')?.getAttribute('data-snapshot-viewing') === 'true');
  const restoredSnap1 = await frame.evaluate(() => (window as any).__bkSnapshotHandlers.capture());
  expect(restoredSnap1.time).toBeCloseTo(snap1Time, 2);

  // Direct paused spatial edit in scene while viewing older snapshot
  await frame.locator('canvas').click();
  await page.waitForFunction(() => !document.querySelector('.bk-object')?.hasAttribute('data-snapshot-viewing'));

  // Continuation retains the existing captures without creating a branch.
  expect(await page.$$eval('.bk-timeline-fork-edge', nodes => nodes.length)).toBe(forkCountBefore);
  // Direct paused spatial edit remains paused
  expect(await page.$eval('.bk-object', e => (e as HTMLElement).dataset.bkPlaybackState)).toBe('paused');

  // 8. Reset purges pending state and resets initial snapshot cache for next trial
  await page.locator('[data-bk-reset-simulation]').click();
  await page.waitForFunction(() => !document.querySelector('.bk-object')?.hasAttribute('data-snapshot-viewing'));
  expect(await page.$$eval('.bk-snapshot-row:not([data-id="start"])', nodes => nodes.length)).toBe(0);
 } finally {
  await browser.close();
 }
}, 35000);
