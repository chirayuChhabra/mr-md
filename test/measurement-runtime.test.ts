import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { renderInspectorTabs, renderSimulationTelemetry } from "../src/renderer/markdown/telemetry.js";
import * as api from "../src/client/telemetry.js";
import type { SimulationTelemetry } from "../src/types.js";

test("measurement views persist while trial data, semantic events, badges and notification limits remain independent", async () => {
 const schema: SimulationTelemetry = {
  height: {label:"Height",unit:"m",graph:true,scene:"height",changeThreshold:2,states:[{when:{op:"gte",value:10},tone:"warning",label:"Above limit"}],notifications:[
   {id:"record",when:{op:"gte",value:10},message:"Milestone recorded",tone:"neutral",toast:false,once:false},
   {id:"warn",when:{op:"gte",value:10},message:"<img src=x onerror=alert(1)>",tone:"warning",once:false},
  ]},
  force:{label:"Force",unit:"N",graph:true,scene:"force"},
 };
 const dom=new JSDOM(`<figure id="trial" class="bk-object"><div class="bk-sim-workspace"><div class="bk-sim-stage"><div class="bk-embed-frame"><iframe></iframe></div></div>${renderInspectorTabs("trial","<p>Settings</p>",renderSimulationTelemetry("trial",schema),schema)}</div><script class="bk-sim-telemetry-schema" type="application/json">${JSON.stringify(schema)}</script><script class="bk-measurements-config" type="application/json">{"notifications":{"minInterval":60}}</script></figure>`,{pretendToBeVisual:true,url:"https://example.test/lesson"});
 const {window}=dom;
 const names=["window","document","Element","HTMLElement","Node","CustomEvent","MutationObserver","requestAnimationFrame","cancelAnimationFrame","getComputedStyle"];
 const previous=new Map(names.map(name=>[name,(globalThis as any)[name]]));
 for(const name of names)(globalThis as any)[name]=["requestAnimationFrame","cancelAnimationFrame","getComputedStyle"].includes(name)?(window as any)[name].bind(window):(window as any)[name];
 try {
  api.bkWireTelemetry();api.bkInitTelemetry();
  const doc=window.document,frame=doc.querySelector("iframe")!,messages:any[]=[];
  frame.contentWindow!.postMessage=(message:unknown)=>{messages.push(message);};
  const publish=(height:number,time:number,source=frame.contentWindow)=>window.dispatchEvent(new window.MessageEvent("message",{source,data:{type:"bk:telemetry",data:{height,time,force:height*2}}}));
  const click=(selector:string)=>(doc.querySelector(selector) as HTMLElement).click();
  publish(0,0);publish(11,1,window);
  expect(doc.querySelectorAll('.bk-snapshot-row:not([data-id="start"])')).toHaveLength(0);
  expect(doc.querySelector('[data-kind="start"]')?.textContent).toContain("0 m");
  publish(11,1);
  expect(doc.querySelector('[data-telemetry-key="height"]')?.getAttribute("data-measurement-tone")).toBe("warning");
  expect(doc.querySelectorAll('.bk-snapshot-row:not([data-id="start"])')).toHaveLength(2);
  expect(doc.querySelector('[data-tone="warning"].bk-snapshot-row')?.getAttribute("aria-label")).toContain("<img src=x onerror=alert(1)>");
  expect(doc.querySelector('[data-measurement-unread="telemetry"]')?.textContent).toBe("2");
  expect(doc.querySelector('[data-measurement-unread="timeline"]')?.textContent).toBe("2");
  expect(doc.querySelectorAll(".bk-measurement-notice")).toHaveLength(1);
  expect(doc.querySelector(".bk-measurement-notice img")).toBeNull();
  click(".bk-measurement-notice-body");
  expect(messages.at(-1)).toEqual({type:"bk:measurement-visibility",measurements:[{key:"height",scene:"height"}]});
  click('[data-measurement-toggle="force"]');
  expect(messages.at(-1).measurements).toEqual([{key:"height",scene:"height"},{key:"force",scene:"force"}]);
  click('.bk-snapshot-row[data-tone="warning"]');
  expect(doc.querySelector('.bk-timeline-details-desc')?.textContent).toContain("Height: 11 m");
  expect(doc.querySelector('[data-measurement-toggle="height"]')?.getAttribute("aria-pressed")).toBe("true");
  api.bkSelectInspectorTab("trial","timeline");await Promise.resolve();
  expect((doc.querySelector('[data-measurement-unread="timeline"]') as HTMLElement).hidden).toBe(true);
  api.bkSelectInspectorTab("trial","telemetry");
  publish(0,2);publish(12,3);
  expect(doc.querySelectorAll('.bk-snapshot-row:not([data-id="start"])')).toHaveLength(4);
  expect(doc.querySelectorAll(".bk-measurement-notice")).toHaveLength(0);
  click('[data-measurement-graph="height"]');
  const header=doc.querySelector('.bk-graph-window[data-measurement-key="height"] .bk-graph-window-header');
  publish(14,4);
  expect(doc.querySelector('.bk-graph-window[data-measurement-key="height"] .bk-graph-window-header')).toBe(header);
  expect(doc.querySelector(".is-measurement-changed")).toBeNull();
  click('[aria-label="Minimize graph"]');
  expect(doc.querySelector('[aria-label="Restore graph"]')).not.toBeNull();
  window.dispatchEvent(new window.MessageEvent("message",{source:window,data:{type:"bk:telemetry-reset"}}));
  expect(doc.querySelectorAll('.bk-snapshot-row:not([data-id="start"])')).toHaveLength(4);
  window.dispatchEvent(new window.MessageEvent("message",{source:frame.contentWindow,data:{type:"bk:telemetry-reset"}}));
  expect(doc.querySelectorAll('.bk-snapshot-row:not([data-id="start"])')).toHaveLength(0);
  expect(doc.querySelector('[data-measurement-tone]')).toBeNull();
  expect(doc.querySelector('.bk-graph-window[data-measurement-key="height"]')).not.toBeNull();
  expect(doc.querySelector('[aria-label="Restore graph"]')).not.toBeNull();
  expect(messages.at(-1)).toEqual({type:"bk:measurement-visibility",measurements:[{key:"height",scene:"height"},{key:"force",scene:"force"}]});
  click('[aria-label="Restore graph"]');
  expect(doc.querySelector('.bk-graph-window polyline')).toBeNull();
  publish(0,0);publish(11,1);
  expect(doc.querySelectorAll('.bk-snapshot-row:not([data-id="start"])')).toHaveLength(2);
 } finally {
  window.document.body.replaceChildren();api.bkInitTelemetry();
  for(const[name,value]of previous)(globalThis as any)[name]=value;
  window.close();
 }
});
