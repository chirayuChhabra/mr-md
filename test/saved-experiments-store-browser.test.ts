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
