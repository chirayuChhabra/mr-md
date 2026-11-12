import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createMeasurementTimeline } from "../src/client/measurement-timeline.js";
import { savedCollectionSchema, type SavedCollection, type ExperimentStore } from "../src/client/saved-experiments-store.js";
const snapshot = (id:string,time:number) => ({id,label:id,time,timestamp:1,props:{speed:1},telemetry:{time},state:{time},isExact:true});
function fixture(fail=false) {
 const doc=new JSDOM('<div></div>').window.document;
 let data:SavedCollection={version:1,moments:[]};
 const store:ExperimentStore={read:async()=>structuredClone(data),write:async next=>{if(fail)throw Error('quota');data=structuredClone(next)}};
 const timeline=createMeasurementTimeline(doc.querySelector('div')!,{schema:{},store,onRestoreSnapshot:()=>true});
 return {doc,timeline,stored:()=>data};
}
test('saved states remain immutable when playback resumes',async()=>{
 const {timeline,stored}=fixture();await timeline.ready;
 timeline.update(10,{time:10},false,snapshot('current',10));
 await timeline.record({title:'Original',kind:'snapshot',time:2,snapshot:snapshot('old',2)});
 await timeline.restoreSnapshot(snapshot('old',2));
 expect(timeline.isAtPast()).toBe(true);expect(timeline.canBranch()).toBe(false);
 timeline.continueFromSnapshot();
 expect(timeline.isAtPast()).toBe(false);
 expect(stored().moments.map(m=>m.snapshot.time)).toEqual([2]);
 timeline.update(8,{time:8},true,snapshot('copy',8));
 expect(timeline.getSavedMoments().find(m=>m.id==='old')!.snapshot.state).toEqual({time:2});
 timeline.reset();expect(timeline.getSavedMoments()).toHaveLength(1);
});
test('storage errors are reported without losing the saved state in memory',async()=>{
 const {timeline,doc}=fixture(true);await timeline.ready;
 timeline.update(10,{time:10},false,snapshot('current',10));
 await timeline.record({title:'Old',kind:'snapshot',time:2,snapshot:snapshot('old',2)});
 await timeline.restoreSnapshot(snapshot('old',2));
 expect(timeline.isAtPast()).toBe(true);expect(doc.body.textContent).toContain('Could not save on this device');
 await timeline.returnToPresent();expect(timeline.isAtPast()).toBe(false);
});
test('automatic events do not become saved experiments and saved labels are text',async()=>{
 const {timeline,doc,stored}=fixture();await timeline.ready;
 await timeline.record({title:'Changed',time:1,kind:'control',snapshot:snapshot('auto',1)});
 expect(timeline.getSavedMoments()).toHaveLength(0);
 await timeline.record({title:'<img src=x onerror=alert(1)>',kind:'snapshot',time:2,snapshot:snapshot('old',2)});
 expect(doc.querySelector('.bk-saved-open')?.textContent).toContain('<img');
 expect(doc.querySelector('.bk-saved-open img')).toBeNull();
 timeline.renameSnapshot('old','Renamed');await new Promise(r=>setTimeout(r,0));
 expect(stored().moments[0].name).toBe('Renamed');
});
test('saved collection rejects malformed persistent state',()=>{
 expect(savedCollectionSchema.safeParse({version:1,moments:[{snapshot:{time:NaN}}]}).success).toBe(false);
 expect(savedCollectionSchema.safeParse({version:2,moments:[]}).success).toBe(false);
});

test('initial state stays last and saved states can be deleted and restored with Undo',async()=>{
 const {timeline,doc}=fixture();await timeline.ready;
 timeline.start(0,{time:0},snapshot('boot',0));
 await timeline.record({title:'Named state',kind:'snapshot',time:2,snapshot:snapshot('old',2)});
 expect(doc.querySelector('.bk-saved-card:last-child')?.textContent).toContain('Initial state');
 const remove=[...doc.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.getAttribute('aria-label')==='Delete')!;
 remove.click();expect(timeline.getSavedMoments()).toHaveLength(0);
 const undo=[...doc.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Undo')!;
 undo.click();expect(timeline.getSavedMoments()).toHaveLength(1);
});


test('selection temporarily opens collapsed cards and continuing makes a new live experiment', async () => {
 const {timeline,doc}=fixture(); await timeline.ready;
 timeline.update(10,{},false,snapshot('live',10));
 await timeline.record({title:'First',kind:'snapshot',time:2,snapshot:snapshot('first',2)});
 await timeline.record({title:'Second',kind:'snapshot',time:3,snapshot:snapshot('second',3)});
 doc.querySelector<HTMLButtonElement>('.bk-saved-toolbar button')!.click();
 expect([...doc.querySelectorAll<HTMLElement>('.bk-saved-card')].every(c=>c.dataset.collapsed==='true')).toBe(true);
 await timeline.restoreSnapshot(snapshot('first',2));
 expect(doc.querySelector<HTMLElement>('[data-saved-id="first"]')!.dataset.collapsed).toBe('false');
 await timeline.restoreSnapshot(snapshot('second',3));
 expect(doc.querySelector<HTMLElement>('[data-saved-id="first"]')!.dataset.collapsed).toBe('true');
 expect(doc.querySelector<HTMLElement>('[data-saved-id="second"]')!.dataset.collapsed).toBe('false');
 timeline.continueFromSnapshot();
 expect(doc.querySelector('[data-selected]')).toBeNull();
 expect(doc.querySelector('.bk-saved-live')!.getAttribute('aria-current')).toBe('true');
 expect(doc.querySelector<HTMLElement>('[data-saved-id="second"]')!.dataset.collapsed).toBe('true');
 expect(doc.querySelector('.bk-saved-time')).toBeNull();
 timeline.update(4,{},true,snapshot('continued',4));
 await timeline.restoreSnapshot(snapshot('first',2));
 await timeline.returnToPresent();
 expect(timeline.getBranches()[0].presentPoint?.time).toBe(4);
 expect(timeline.getSavedMoments().map(m=>m.snapshot.time)).toEqual([3,2]);
});

test('returning to Live restores its playback state from before the first saved-state visit', async()=>{
 for(const playing of [true,false]) {
  const {timeline,doc}=fixture();await timeline.ready;
  timeline.update(10,{time:10},playing,snapshot('live',10));
  await timeline.record({title:'First',kind:'snapshot',time:2,snapshot:snapshot('first',2)});
  await timeline.record({title:'Second',kind:'snapshot',time:3,snapshot:snapshot('second',3)});
  const states:boolean[]=[];
  doc.querySelector('div')!.addEventListener('bk:timeline-live',event=>states.push((event as CustomEvent).detail?.playing));
  await timeline.restoreSnapshot(snapshot('first',2));
  await timeline.restoreSnapshot(snapshot('second',3));
  await timeline.returnToPresent();
  expect(states).toEqual([playing]);
  expect(timeline.getBranches()[0].presentPoint?.time).toBe(10);
  timeline.dispose();doc.defaultView!.close();
 }
});
