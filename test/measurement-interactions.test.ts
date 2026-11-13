import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { snapshotRuntimeCode } from "../src/renderer/blocks/snapshot-runtime.js";
import { savedCollectionSchema } from "../src/client/saved-experiments-store.js";

test("BK records pointer, keyboard and named interactions with matching boundaries", () => {
 const dom = new JSDOM('<canvas data-bk-interaction-label="Cart dragged"></canvas>');
 const w=dom.window as any;
 const sent:any[]=[];
 const parent={postMessage:(message:any)=>sent.push(message)};
 Object.defineProperty(w,"parent",{value:parent});
 new Function("window","document",snapshotRuntimeCode)(w,w.document);
 const canvas=w.document.querySelector('canvas');
 const pointer=(type:string)=>{const event=new w.Event(type,{bubbles:true});Object.defineProperty(event,'pointerId',{value:7});canvas.dispatchEvent(event);};
 pointer('pointerdown');pointer('pointermove');pointer('pointerup');
 expect(sent.map(m=>m.phase)).toEqual(['start','end']);
 expect(sent[0].id).toBe(sent[1].id);
 expect(sent[0].label).toBe('Cart dragged');
 w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowLeft',code:'ArrowLeft'}));
 w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowLeft',code:'ArrowLeft',repeat:true}));
 w.dispatchEvent(new w.Event('blur'));
 expect(sent.slice(-2).map(m=>m.phase)).toEqual(['start','end']);
 const finish=w.bkBeginInteraction('External force applied');finish();finish();
 expect(sent.slice(-2).map(m=>m.label)).toEqual(['External force applied','External force applied']);
 expect(sent).toHaveLength(6);
 dom.window.close();
});

test("saved-state validation retains provenance and accepts older histories", () => {
 const point={time:1,x:1,y:2,sampleId:3,interaction:{id:'drag-1',label:'Cart dragged'}};
 const snapshot={id:'state',time:1,timestamp:1,label:'Saved state',props:{},telemetry:{},isExact:true,measurementHistory:{x:[point]}};
 const collection={version:1,moments:[{id:'state',name:'Saved state',savedAt:1,snapshot}]};
 expect(savedCollectionSchema.parse(collection).moments[0].snapshot.measurementHistory!.x[0]).toEqual(point);
 const legacy={...snapshot,measurementHistory:{x:[{time:1,x:1,y:2}]}};
 expect(savedCollectionSchema.safeParse({...collection,moments:[{...collection.moments[0],snapshot:legacy}]}).success).toBe(true);
 expect(savedCollectionSchema.safeParse({...collection,moments:[{...collection.moments[0],snapshot:{...snapshot,measurementHistory:{x:[{...point,interaction:{id:'',label:'bad'}}]}}}]}).success).toBe(false);
});

test("authored graphs recover earlier saved histories from the underlying measurements", () => {
 const {graphData}=require('../src/client/telemetry.js');
 const history=[{time:0,x:0,y:0.75},{time:1,x:1,y:0.4},{time:2,x:2,y:0.2}];
 const values=graphData({specs:[{key:'displacement',xAxis:{key:'time'}}],historySpecs:[],samples:{'history:displacement':history},latest:{displacement:{time:2,x:2,y:0.2}},graphSnapshotTime:2});
 expect(values.displacement).toEqual(history);
 const phase=graphData({specs:[{key:'velocity',xAxis:{key:'displacement'}}],historySpecs:[],samples:{'history:displacement':history,'history:velocity':history.map(p=>({...p,y:-p.y}))},latest:{},graphSnapshotTime:2});
 expect(phase.velocity.map((p:any)=>[p.x,p.y])).toEqual([[0.75,-0.75],[0.4,-0.4],[0.2,-0.2]]);
 const custom=graphData({specs:[{key:'custom:time:displacement',yKey:'displacement',xAxis:{key:'time'}}],historySpecs:[],samples:{'custom:time:displacement':history},latest:{},graphSnapshotTime:2});
 expect(custom['custom:time:displacement']).toEqual(history);

});
