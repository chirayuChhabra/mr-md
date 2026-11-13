import { expect, test } from "bun:test";
import puppeteer from "puppeteer";

test("saved states recover old iframe hashes once without resurrecting deletions", async () => {
 const bundle = await Bun.build({entrypoints:["src/client/saved-experiments-store.ts"],target:"browser",format:"esm"});
 const script = await bundle.outputs[0].text();
 const server = Bun.serve({port:0,fetch:request => new URL(request.url).pathname === "/store.js"
  ? new Response(script,{headers:{"Content-Type":"text/javascript"}})
  : new Response('<script type="module">import {experimentStore} from "/store.js";window.store=experimentStore;</script>',{headers:{"Content-Type":"text/html"}})});
 const browser = await puppeteer.launch({headless:true,args:["--no-sandbox","--disable-gpu","--disable-dev-shm-usage"]});
 try {
  const page = await browser.newPage();
  await page.goto(server.url.href);
  await page.waitForFunction(() => typeof (window as any).store === "function");
  const result = await page.evaluate(async () => {
   const scope = "bk:measurements:/lesson:sim-0:saved";
   const makeStore = (key:string) => (window as any).store(indexedDB,key);
   const moment = (id:string,savedAt:number) => ({
    id,name:id,savedAt,snapshot:{id,label:id,time:1,timestamp:1,props:{},telemetry:{},state:{time:1},isExact:true}
   });
   await makeStore(scope+":123").write({version:1,moments:[moment("first",1)]});
   await makeStore(scope+":456").write({version:1,moments:[moment("second",2),moment("first",1)]});
   await makeStore("bk:measurements:/lesson:sim-1:saved:123").write({version:1,moments:[moment("other simulation",3)]});
   const recovered = await makeStore(scope).read();
   const legacy = await makeStore(scope+":123").read();
   await makeStore(scope).write({version:1,moments:[]});
   return {recovered:recovered.moments.map((m:any)=>m.id),legacy:legacy.moments.map((m:any)=>m.id),afterDelete:(await makeStore(scope).read()).moments};
  });
  expect(result.recovered).toEqual(["second","first"]);
  expect(result.legacy).toEqual(["first"]);
  expect(result.afterDelete).toEqual([]);
 } finally {
  await browser.close();
  server.stop();
 }
});

test("tabs merge saved-state changes without stale saves resurrecting deletions", async () => {
 const bundles = await Promise.all(["measurement-timeline", "saved-experiments-store"].map(async name => {
  const result=await Bun.build({entrypoints:[`src/client/${name}.ts`],target:"browser",format:"esm"});
  return [name,await result.outputs[0].text()] as const;
 }));
 const scripts=new Map(bundles);
 const server=Bun.serve({port:0,fetch:request=>{
  const name=new URL(request.url).pathname.slice(1).replace(/\.js$/, "");
  return scripts.has(name) ? new Response(scripts.get(name),{headers:{"Content-Type":"text/javascript"}})
   : new Response('<div id="saved"></div><script type="module">import {createMeasurementTimeline} from "/measurement-timeline.js";import {experimentStore} from "/saved-experiments-store.js";window.store=experimentStore(indexedDB,"concurrent:saved");window.timeline=createMeasurementTimeline(document.querySelector("#saved"),{schema:{},store:window.store});await window.timeline.ready;window.ready=true;</script>',{headers:{"Content-Type":"text/html"}});
 }});
 const browser=await puppeteer.launch({headless:true,args:["--no-sandbox","--disable-gpu","--disable-dev-shm-usage"]});
 try {
  const first=await browser.newPage(),second=await browser.newPage();
  for(const page of [first,second]){await page.goto(server.url.href);await page.waitForFunction(()=>!!(window as any).ready,{polling:20});}
  const save=async(page:any,id:string)=>page.evaluate(async(id:string)=>{
   await (window as any).timeline.record({kind:"snapshot",title:id,time:0,snapshot:{id,label:id,time:0,timestamp:1,props:{},telemetry:{},state:{},isExact:true}});
  },id);
  await Promise.all([save(first,"A"),save(second,"B")]);
  const ids=()=>first.evaluate(async()=>(await (window as any).store.read()).moments.map((m:any)=>m.id).sort());
  expect(await ids()).toEqual(["A","B"]);
  // Reload a third tab to observe both saves, then delete one elsewhere.
  const stale=await browser.newPage();await stale.goto(server.url.href);await stale.waitForFunction(()=>!!(window as any).ready,{polling:20});
  await first.evaluate(()=>document.querySelector<HTMLButtonElement>('[data-saved-id="A"] [aria-label="Delete"]')!.click());
  await first.waitForFunction(async()=>!(await (window as any).store.read()).moments.some((m:any)=>m.id==="A"),{polling:20});
  await stale.evaluate(()=>window.dispatchEvent(new Event("pagehide")));
  await stale.evaluate(()=>(window as any).timeline.renameSnapshot("A","Old name"));
  await save(stale,"C");
  expect(await ids()).toEqual(["B","C"]);
  // Renaming a stale, already deleted record cannot bring it back either.
  await stale.evaluate(()=>(window as any).timeline.renameSnapshot("A","Old name"));
  await Promise.all([save(stale,"D"),save(stale,"E"),save(second,"F")]);
  expect(await ids()).toEqual(["B","C","D","E","F"]);
 } finally {await browser.close();server.stop();}
}, 30000);
