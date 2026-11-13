import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer";
import { renderSimulation } from "../src/renderer/blocks/simulation.js";

test("saved states load paused, resume without copies, return to live, and survive reload", async () => {
 const bundle = await Bun.build({entrypoints:["saved-harness"],target:"browser",plugins:[{name:"harness",setup(build){
  build.onResolve({filter:/^saved-harness$/},()=>({path:"saved-harness",namespace:"harness"}));
  build.onLoad({filter:/.*/,namespace:"harness"},()=>({resolveDir:process.cwd(),loader:"ts",contents:`
import {bkWireMaximizeControls} from './src/client/ui.ts';
import {bkWireInteractiveFrames} from './src/client/interactive.ts';
import {bkWireSimControls} from './src/client/simulation.ts';
import {bkWireTelemetry,bkInitTelemetry,getMeasurementRuntime} from './src/client/telemetry.ts';
import {createMeasurementTimeline} from './src/client/measurement-timeline.ts';
bkWireMaximizeControls();bkWireInteractiveFrames();bkWireSimControls();bkWireTelemetry();bkInitTelemetry();
window.__measurementRuntime=getMeasurementRuntime(document.querySelector('.bk-object').id);
window.createSaved=createMeasurementTimeline;
const originalUpdate=window.__measurementRuntime.graphs.update.bind(window.__measurementRuntime.graphs);
window.__measurementRuntime.graphs.update=data=>{window.__graphData=structuredClone(data);originalUpdate(data);};`}));
 }}]});
 const {html}=renderSimulation({type:"simulation",label:"Saved experiment",props:{speed:1},tunables:{speed:{label:"Speed",type:"range",min:0,max:5}},telemetry:{time:{label:"Time",unit:"s",graph:true}},measurements:{timeline:true},src:`
const sim=window.defineSimulation({props:{speed:1}});let time=0;
window.bkRegisterSnapshot({capture:()=>({time}),restore:s=>{time=s.time;}});
window.bkSetup(800,450,ctx=>{time+=sim.deltaTime()*sim.props.speed;sim.publishTelemetry({time});ctx.clearRect(0,0,800,450);});`},0,{});
 const automatic=renderSimulation({type:"simulation",label:"Automatic state",telemetry:{time:{label:"Time",unit:"s",saveStates:[{id:"checkpoint",name:"Checkpoint",when:{op:"gte",value:0.25}}]}},measurements:{timeline:true},src:`
const sim=window.defineSimulation({});let time=0;window.bkRegisterSnapshot({capture:()=>({time}),restore:s=>time=s.time});window.bkSetup(800,450,ctx=>{time+=sim.deltaTime();sim.publishTelemetry({time});});`},0,{}).html;
 const oscillatorConfig=JSON.parse(readFileSync("mr-markdown-documentation/sims/oscillator.config.json","utf8"));
 const oscillatorSource=readFileSync("mr-markdown-documentation/sims/oscillator.js","utf8");
 const oscillator=renderSimulation({...oscillatorConfig,type:"simulation",src:oscillatorSource},0,{}).html;
 const legacyOscillator=renderSimulation({...oscillatorConfig,type:"simulation",src:oscillatorSource.replace("time: state.time,","")},0,{}).html;
 const script=await bundle.outputs[0].text();
 const styles=readFileSync("src/styles/theme.css","utf8")+readFileSync("src/styles/measurement-timeline.css","utf8");
 const server=Bun.serve({port:0,fetch:request=>new URL(request.url).pathname==="/app.js"?new Response(script,{headers:{"Content-Type":"text/javascript"}}):new Response(`<style>${styles}</style>${new URL(request.url).pathname==="/automatic"?automatic:new URL(request.url).pathname==="/oscillator"?oscillator:new URL(request.url).pathname==="/legacy-oscillator"?legacyOscillator:new URL(request.url).searchParams.has("runtime-update")?html.replace('srcdoc="','srcdoc="&lt;!-- updated framework runtime --&gt;'):html}<script src="/app.js"></script>`,{headers:{"Content-Type":"text/html"}})});
 const browser=await puppeteer.launch({headless:true,args:["--no-sandbox","--disable-gpu","--disable-dev-shm-usage"]});
 try {
  const page=await browser.newPage();page.setDefaultTimeout(8000);await page.setViewport({width:1280,height:900});
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto(`http://localhost:${server.port}/saved`);
  expect(await page.$eval('[data-bk-capture-snapshot]', e => getComputedStyle(e).display)).toBe('none');
  await page.locator("[data-bk-expand-preview]").click();
  await page.waitForFunction(()=>{const b=document.querySelector<HTMLButtonElement>('[data-bk-capture-snapshot]');return b&&!b.disabled});
  const frame=await (await page.$("iframe"))!.contentFrame();
  await frame!.waitForFunction(()=>(window as any).__bkSnapshotHandlers.capture().time>0.25);
  await page.waitForFunction(()=>(window as any).__measurementRuntime.samples.time?.length>3);
  await page.evaluate(()=>(window as any).__measurementRuntime.graphs.open('time'));
  await page.locator("[data-bk-capture-snapshot]").click();
  await page.waitForFunction(()=>document.querySelector('.bk-saved-status')?.textContent==='State saved.');
  expect(await page.$$eval('.bk-saved-card',cards=>cards.length)).toBe(2);
  expect(await page.$('.bk-saved-card:first-child img')).not.toBeNull();
  await page.locator('input[aria-label="Saved moment name"]').fill('My state');
  await page.keyboard.press('Enter');
  expect(await page.$eval('.bk-saved-card:last-child',c=>c.textContent)).toContain('Initial state');
  const saved=await page.evaluate(()=>(window as any).__measurementRuntime.timeline.getSavedMoments()[0]);
  expect(saved.snapshot.measurementHistory.time.length).toBeGreaterThan(3);
  expect(saved.snapshot.measurementHistory.time.at(-1)).toMatchObject({time:saved.snapshot.time,y:saved.snapshot.telemetry.time});
  await frame!.waitForFunction(t=>(window as any).__bkSnapshotHandlers.capture().time>t+0.4,{},saved.snapshot.time);
  await page.locator('.bk-saved-card:first-child .bk-saved-open').click();
  await page.waitForFunction(()=>document.querySelector('.bk-object')?.hasAttribute('data-snapshot-viewing'));
  expect(await frame!.evaluate(()=>(window as any).__bkSnapshotHandlers.capture().time)).toBeCloseTo(saved.snapshot.time,5);
  const restoredHistory=await page.evaluate(()=>({samples:(window as any).__measurementRuntime.samples.time,graph:(window as any).__graphData.time}));
  expect(restoredHistory.samples).toEqual(saved.snapshot.measurementHistory.time.filter((p:any)=>p.time<=saved.snapshot.time));
  expect(restoredHistory.graph.length).toBeGreaterThan(3);
  expect(restoredHistory.graph[0]).toEqual(saved.snapshot.measurementHistory.time[0]);
  const frozenLive=await page.evaluate(()=>(window as any).__measurementRuntime.timeline.getBranches()[0].presentPoint.snapshot);
  await page.waitForFunction(start=>performance.now()-start>250,{},await page.evaluate(()=>performance.now()));
  expect(await frame!.evaluate(()=>(window as any).__bkSnapshotHandlers.capture().time)).toBe(saved.snapshot.time);
  expect(await page.evaluate(()=>(window as any).__measurementRuntime.timeline.getBranches()[0].presentPoint.snapshot)).toEqual(frozenLive);

  expect(await page.$eval('iframe',e=>(e as HTMLIFrameElement).inert)).toBe(false);
  expect(await page.$eval('[data-bk-prop="speed"]',e=>(e as HTMLInputElement).disabled)).toBe(false);
  expect(await page.$eval('[data-bk-playback]',e=>(e as HTMLButtonElement).disabled)).toBe(false);
  expect(await page.$('.bk-snapshot-edges')).toBeNull();
  expect(await page.$eval('.bk-saved-preview', e => (e as HTMLElement).hidden)).toBe(false);
  expect(await page.$('[data-bk-back-live]')).toBeNull();
  await page.locator('.bk-saved-live').click();
  await page.waitForFunction(()=>!document.querySelector('.bk-object')?.hasAttribute('data-snapshot-viewing'));
  expect(await frame!.evaluate(()=>(window as any).__bkSnapshotHandlers.capture().time)).toBeGreaterThan(saved.snapshot.time+0.2);
  const returnedTime=await frame!.evaluate(()=>(window as any).__bkSnapshotHandlers.capture().time);
  await frame!.waitForFunction(t=>(window as any).__bkSnapshotHandlers.capture().time>t+0.2,{},returnedTime);
  await page.waitForFunction(t=>(window as any).__graphData.time.at(-1).time>t,{},returnedTime);
  await page.locator('.bk-saved-card:first-child .bk-saved-open').click();
  await page.waitForFunction(()=>document.querySelector('.bk-object')?.hasAttribute('data-snapshot-viewing'));
  await page.locator('[data-bk-playback]').click();
  await frame!.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true})));

  await page.waitForFunction(()=>!document.querySelector('.bk-object')?.hasAttribute('data-snapshot-viewing'));
  expect(await page.evaluate(()=>(window as any).__measurementRuntime.samples.time[0])).toEqual(saved.snapshot.measurementHistory.time[0]);
  expect(await page.evaluate(()=>(window as any).__measurementRuntime.timeline.getSavedMoments()[0].snapshot)).toEqual(saved.snapshot);
  await frame!.waitForFunction(t=>(window as any).__bkSnapshotHandlers.capture().time>t+0.2,{},saved.snapshot.time);
  await page.waitForFunction(t=>(window as any).__graphData.time.at(-1).time>t+0.1,{},saved.snapshot.time);
  expect(await page.$('.bk-saved-card[data-selected]')).toBeNull();
  expect(await page.$eval('.bk-saved-live', e => e.getAttribute('aria-current'))).toBe('true');
  expect(await page.$$eval('.bk-saved-card',cards=>cards.length)).toBe(2);
  expect(await page.$('.bk-saved-button--primary')).toBeNull();
  expect(await page.$('.bk-sim-snapshot-cue')).toBeNull();
  expect(await page.$eval('.bk-object',e=>(e as HTMLElement).dataset.bkPlaybackState)).toBe('playing');
  expect(await page.$eval('[data-bk-prop="speed"]',e=>(e as HTMLInputElement).disabled)).toBe(false);
  await page.waitForFunction(()=>document.querySelector('.bk-saved-storage')?.textContent==='States saved on this device');
  await page.goto(`http://localhost:${server.port}/saved?runtime-update`);
  await page.waitForFunction(()=>document.querySelectorAll('.bk-saved-card').length>=1);
  expect(await page.evaluate((id)=>(window as any).__measurementRuntime.timeline.getSavedMoments().some((m:any)=>m.id===id),saved.id)).toBe(true);
  await page.locator('[data-bk-expand-preview]').click();
  await page.locator('[role="tab"][aria-controls$="-panel-timeline"]').click();
  await page.locator(`[data-saved-id="${saved.id}"] .bk-saved-open`).click();
  await page.waitForFunction(()=>document.querySelector('.bk-object')?.hasAttribute('data-snapshot-viewing'));
  const reloadedFrame=await (await page.$('iframe'))!.contentFrame();
  expect(await reloadedFrame!.evaluate(()=>(window as any).__bkSnapshotHandlers.capture().time)).toBeCloseTo(saved.snapshot.time,5);
  expect(await page.evaluate(()=>(window as any).__measurementRuntime.samples.time)).toEqual(saved.snapshot.measurementHistory.time.filter((p:any)=>p.time<=saved.snapshot.time));
  expect(errors).toEqual([]);

  // Earlier saves may contain raw measurement history without today's graph key.
  const rawSaved=await page.evaluate(async()=>{
   const r=(window as any).__measurementRuntime;
   const snapshot=structuredClone(r.timeline.getSavedMoments()[0].snapshot);
   snapshot.id='raw-history-save';snapshot.label='Earlier graph layout';delete snapshot.measurementHistory.time;
   await r.timeline.record({kind:'snapshot',title:snapshot.label,time:snapshot.time,snapshot});
   return snapshot;
  });
  await page.reload();
  await page.waitForFunction(()=>(window as any).__measurementRuntime.timeline.getSavedMoments().length===2);
  await page.locator('[data-bk-expand-preview]').click();
  await page.locator('[role="tab"][aria-controls$="-panel-timeline"]').click();
  await page.locator('[data-saved-id="raw-history-save"] .bk-saved-open').click();
  await page.waitForFunction(()=>document.querySelector('.bk-object')?.hasAttribute('data-snapshot-viewing'));
  const recovered=await page.evaluate(()=>({samples:(window as any).__measurementRuntime.samples.time,graph:(window as any).__graphData.time,snapshot:(window as any).__measurementRuntime.timeline.getSavedMoments()[0].snapshot}));
  expect(recovered.graph.length).toBeGreaterThan(3);
  expect(recovered.samples[0]).toEqual(rawSaved.measurementHistory['history:time'][0]);
  expect(recovered.snapshot).toEqual(rawSaved);
  await page.locator('[data-bk-playback]').click();
  await page.waitForFunction(t=>(window as any).__measurementRuntime.latest.time.time>t+0.1,{},rawSaved.time);
  expect(await page.evaluate(()=>(window as any).__measurementRuntime.samples.time[0])).toEqual(recovered.samples[0]);
  // A deliberately paused Live run stays paused after visiting multiple saved states.
  await page.locator('[data-bk-playback]').click();
  const pausedFrame=await(await page.$('iframe'))!.contentFrame();
  await pausedFrame!.waitForFunction(()=>(window as any).__loop===false);
  const pausedLive=await pausedFrame!.evaluate(()=>(window as any).__bkSnapshotHandlers.capture());
  await page.locator('[data-saved-id="raw-history-save"] .bk-saved-open').click();
  await page.waitForFunction(()=>document.querySelector('.bk-object')?.hasAttribute('data-snapshot-viewing'));
  await page.locator(`[data-saved-id="${saved.id}"] .bk-saved-open`).click();
  await page.waitForFunction(()=>!(document.querySelector('.bk-saved-open') as HTMLButtonElement)?.disabled);
  await page.locator('.bk-saved-live').click();
  await page.waitForFunction(()=>!document.querySelector('.bk-object')?.hasAttribute('data-snapshot-viewing'));
  expect(await page.$eval('.bk-object',e=>(e as HTMLElement).dataset.bkPlaybackState)).toBe('paused');
  await page.waitForFunction(start=>performance.now()-start>250,{},await page.evaluate(()=>performance.now()));
  expect(await pausedFrame!.evaluate(()=>(window as any).__loop)).toBe(false);
  expect(await pausedFrame!.evaluate(()=>(window as any).__bkSnapshotHandlers.capture())).toEqual(pausedLive);


  // Resume on the saved clock, including legacy simulations without telemetry time.
  for(const route of ["oscillator","legacy-oscillator"]) {
  await page.goto(`http://localhost:${server.port}/${route}`);
  await page.locator('[data-bk-expand-preview]').click();
  await page.waitForFunction(()=>{const r=(window as any).__measurementRuntime;return r.supportsExactSnapshot&&r.samples.displacement?.length>3});
  await page.locator('[data-bk-capture-snapshot]').click();
  await page.waitForFunction(()=>document.querySelector('.bk-saved-status')?.textContent==='State saved.');
  await page.locator('input[aria-label="Saved moment name"]').fill("Oscillator checkpoint");
  await page.keyboard.press("Enter");
  const oscillatorSaved=await page.evaluate(()=>(window as any).__measurementRuntime.timeline.getSavedMoments()[0].snapshot);
  await page.evaluate(()=>{(window as any).__measurementRuntime.started-=90000;});
  await page.locator('.bk-saved-card:first-child .bk-saved-open').click();
  await page.waitForFunction(()=>document.querySelector('.bk-object')?.hasAttribute('data-snapshot-viewing'));
  const oscillatorFrame=await(await page.$('iframe'))!.contentFrame();
  await oscillatorFrame!.evaluate(()=>document.querySelector('canvas')!.setAttribute('data-bk-interaction-label','Cart dragged'));
  const canvas=await oscillatorFrame!.$('canvas'),bounds=(await canvas!.boundingBox())!;
  const logical=await oscillatorFrame!.evaluate(()=>{const c=document.querySelector('canvas')!,r=c.getBoundingClientRect();const point=(x:number)=>(window as any).bkCanvasPoint({clientX:x,clientY:r.top},c).x;return {left:point(r.left),width:point(r.right)-point(r.left)};});
  const cartX=(position:number)=>bounds.x+(640+position*160-logical.left)/logical.width*bounds.width;
  await page.mouse.move(cartX(oscillatorSaved.state.x),bounds.y+bounds.height/2);
  await page.mouse.down();
  await page.mouse.move(cartX(-0.5),bounds.y+bounds.height/2,{steps:8});
  await page.mouse.up();
  await page.waitForFunction(()=>!document.querySelector('.bk-object')?.hasAttribute('data-snapshot-viewing'));
  expect(await page.$eval('.bk-object',e=>(e as HTMLElement).dataset.bkPlaybackState)).toBe('paused');
  expect(await oscillatorFrame!.evaluate(()=>(window as any).__loop)).toBe(false);
  expect(await oscillatorFrame!.evaluate(()=>(window as any).__bkSnapshotHandlers.capture().time)).toBe(oscillatorSaved.time);
  await page.waitForFunction(()=>document.querySelector('.bk-chart-user-trace')&&document.querySelector('.bk-chart-user-band'));
  await page.waitForFunction(()=>Math.abs((window as any).__measurementRuntime.latest.displacement.y+0.5)<0.005);
  const pausedEdits=await page.evaluate(()=>(window as any).__measurementRuntime.samples.displacement.filter((p:any)=>p.interaction?.label==='Cart dragged'));
  expect(pausedEdits.length).toBeGreaterThan(1);
  expect(pausedEdits.at(-1).y).toBeCloseTo(-0.5,2);
  expect(pausedEdits.every((p:any)=>p.time===oscillatorSaved.time)).toBe(true);
  await page.locator('[data-bk-playback]').click();
  await oscillatorFrame!.waitForFunction(t=>(window as any).__bkSnapshotHandlers.capture().time>t+0.1,{},oscillatorSaved.time);
  const resumed=await page.evaluate(()=>({time:(window as any).__measurementRuntime.time,saved:(window as any).__measurementRuntime.timeline.getSavedMoments()[0].snapshot}));
  const modelTime=await oscillatorFrame!.evaluate(()=>(window as any).__bkSnapshotHandlers.capture().time);
  expect(Math.abs(resumed.time-modelTime)).toBeLessThan(0.2);
  expect(resumed.saved).toEqual(oscillatorSaved);
  const continuedSamples=await page.evaluate(()=>(window as any).__measurementRuntime.samples.displacement);
  expect(continuedSamples[0]).toEqual(oscillatorSaved.measurementHistory.displacement[0]);
  expect(continuedSamples.at(-1).time).toBeLessThan(modelTime+0.2);
  await page.waitForFunction(()=>!(window as any).__measurementRuntime.latest.displacement.interaction);
  if(route==='oscillator') {
   await page.locator('[data-bk-capture-snapshot]').click();
   await page.waitForFunction(()=>(window as any).__measurementRuntime.timeline.getSavedMoments().length===2);
   await page.locator('input[aria-label="Saved moment name"]').fill('Annotated run');await page.keyboard.press('Enter');
   await page.waitForFunction(()=>!document.querySelector('.bk-saved-rename'));
   const annotated=await page.evaluate(()=>(window as any).__measurementRuntime.timeline.getSavedMoments()[0]);
   expect(annotated.snapshot.measurementHistory.displacement.some((p:any)=>p.interaction?.label==='Cart dragged')).toBe(true);
   await page.reload();
   await page.waitForFunction(()=>(window as any).__measurementRuntime.timeline.getSavedMoments().length===2);
   expect(await page.evaluate(()=>(window as any).__measurementRuntime.timeline.getSavedMoments()[0].snapshot)).toEqual(annotated.snapshot);
   await page.locator('[data-bk-expand-preview]').click();
   await page.locator('[role="tab"][aria-controls$="-panel-timeline"]').click();
   await page.locator('.bk-saved-card:first-child .bk-saved-open').click();
   await page.waitForSelector('.bk-chart-user-trace');
   expect(await page.$eval('.bk-chart-interaction-legend',e=>e.textContent)).toBe('User changes');
  }
  }


  // A storage failure must leave the user in preview and preserve the current workspace.
  const failed=await page.evaluate(async()=>{
   const element=document.createElement('div');document.body.append(element);
   const snapshot=(id:string,time:number)=>({id,time,timestamp:1,label:id,props:{},telemetry:{time},state:{time},isExact:true});
   const t=(window as any).createSaved(element,{schema:{},store:{read:async()=>({version:1,moments:[]}),write:async()=>{throw Error('quota')}},onRestoreSnapshot:()=>true});
   await t.ready;t.update(8,{time:8},false,snapshot('current',8));
   await t.record({title:'Original',kind:'snapshot',time:2,snapshot:snapshot('old',2)});
   await t.restoreSnapshot(snapshot('old',2));
   return {preview:t.isAtPast(),message:element.textContent,playingCopies:t.getBranchCount()};
  });
  expect(failed.preview).toBe(true);
  expect(failed.message).toContain('Could not save on this device');
  expect(failed.playingCopies).toBe(1);
  await page.goto(`http://localhost:${server.port}/automatic`);
  await page.locator('[data-bk-expand-preview]').click();
  await page.waitForFunction(()=>document.querySelector('.bk-saved-card:first-child .bk-saved-open')?.textContent?.includes('Checkpoint'));
  const autoFrame=await (await page.$('iframe'))!.contentFrame();
  await autoFrame!.waitForFunction(()=>(window as any).__bkSnapshotHandlers.capture().time>0.6);
  expect(await page.$$eval('.bk-saved-card',cards=>cards.length)).toBe(2);
  expect(await page.$('.bk-saved-card:first-child img')).not.toBeNull();
  expect(await page.$('input[aria-label="Saved moment name"]')).toBeNull();
  expect(await page.$eval('.bk-object',e=>(e as HTMLElement).dataset.bkPlaybackState)).not.toBe('paused');

 } finally {await browser.close();server.stop(true);}
},40000);
