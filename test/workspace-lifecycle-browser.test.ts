import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer';

test('workspace preserves shell, source scroll, sidebar geometry and route cleanup', async () => {
 const bundle = await Bun.build({entrypoints:['lifecycle-fixture'],target:'browser',plugins:[{name:'fixture',setup(build){
 build.onResolve({filter:/\.js$/},args=>{const path=resolve(dirname(args.importer),args.path.replace(/\.js$/,'.ts'));if(existsSync(path))return {path}});
 build.onResolve({filter:/^lifecycle-fixture$/},()=>({path:'fixture',namespace:'fixture'}));
 build.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'ts',resolveDir:process.cwd(),contents:`import {bkWireWorkspace,bkExpandLab,bkCollapseLab} from './src/client/workspace.ts'; import {bkInitRouter} from './src/client/router.ts'; import {bkEnterWorld,bkExitWorld,bkWireWorldPortals} from './src/client/world.ts'; Object.assign(window,{expand:bkExpandLab,collapse:bkCollapseLab,enterWorld:bkEnterWorld,exitWorld:bkExitWorld}); bkWireWorldPortals(); bkWireWorkspace(); bkInitRouter();`}));
 }}]});
 const script=await bundle.outputs[0]!.text();
 const html=`<style>${readFileSync('src/styles/theme.css','utf8')}</style><div class="bk-shell"><header id="bk-topbar" class="bk-topbar"><div class="bk-topbar-left"><button class="bk-topbar-sidebar-toggle" onclick="document.querySelector('.bk-shell').toggleAttribute('data-collapsed')">Sidebar</button><nav class="bk-topbar-breadcrumbs"><a href="#source">Lesson</a></nav></div><div class="bk-topbar-right"></div></header><div class="bk-body"><aside class="bk-sidebar"><div class="bk-sidebar-header">Course</div><nav class="bk-nav"><a href="/other">Other</a></nav></aside><main class="bk-main"><div style="height:1000px"></div><h2 id="source">Source</h2><figure id="sim" class="bk-object"><div class="bk-object-header"><span class="bk-object-title">Lab</span></div><div class="bk-sim-workspace"><div class="bk-sim-preview"><iframe></iframe></div></div></figure><figure id="world" class="bk-object--world"><div class="bk-world-fullscreen"><div class="bk-world-frame-slot"></div></div></figure><div style="height:2000px"></div></main></div></div><script>${script}</script>`;
 const server=Bun.serve({port:0,fetch:()=>new Response(html,{headers:{'Content-Type':'text/html'}})});
 const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 try {
 const page=await browser.newPage(); await page.setViewport({width:1280,height:800}); await page.goto(`http://localhost:${server.port}`);
 for(let i=0;i<3;i++) {
 await page.evaluate(()=>{document.querySelector('.bk-shell')!.removeAttribute('data-collapsed');document.querySelector('.bk-main')!.scrollTop=850;(window as any).expand('sim')});
 expect(await page.$eval('.bk-sidebar',el=>el.closest('[inert]')===null)).toBe(true);
 await page.waitForFunction(()=>!!document.elementFromPoint(100,150)?.closest('.bk-sidebar'));
 const width=await page.$eval('#sim',el=>el.getBoundingClientRect().width);
 await page.evaluate(()=>document.querySelector('.bk-shell')!.setAttribute('data-collapsed','true'));
 expect(await page.$eval('#sim',el=>el.getBoundingClientRect().width)).toBe(width);
 expect(await page.$eval('#bk-lab-exit-topbar-btn', el => !!el.querySelector('svg') && !!el.closest('.bk-topbar-right'))).toBe(true);
 expect(await page.$eval('.bk-topbar-breadcrumbs', el => el.textContent!.trim().endsWith('/'))).toBe(true);
 await page.locator('#bk-lab-exit-topbar-btn').click();
 expect(await page.$('.bk-sim-exit-crumb')).toBeNull();
 await page.waitForFunction(()=>!history.state?.bkLab);
 expect(await page.$eval('.bk-main',el=>el.scrollTop)).toBe(850);
 expect(await page.$eval('#bk-topbar',el=>el.closest('.bk-main'))).toBeNull();
 }
 await page.evaluate(()=>(window as any).expand('sim'));
 await page.locator('.bk-sim-exit-crumb').click();
 expect(await page.$('.bk-object--maximized')).toBeNull();
 await page.waitForFunction(()=>!history.state?.bkLab);
 await page.evaluate(()=>(window as any).expand('sim'));
 await page.goBack();
 await page.waitForFunction(()=>!document.querySelector('.bk-object--maximized'));
 expect(await page.$eval('.bk-main',el=>el.scrollTop)).toBe(850);
 await page.evaluate(()=>{document.querySelector('.bk-main')!.scrollTop=923;(window as any).enterWorld(document.querySelector('#world'))});
 await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{data:{type:'bk:world-exit'},source:window})));
 expect(await page.$('.bk-world--exiting')).toBeNull();
 expect(await page.$eval('#bk-world-exit-topbar-btn', el => !!el.querySelector('svg') && !!el.closest('.bk-topbar-right'))).toBe(true);
 await page.locator('.bk-sim-exit-crumb').click();
 await page.waitForFunction(()=>!document.body.classList.contains('bk-world-immersive'));
 expect(await page.$eval('.bk-main',el=>el.scrollTop)).toBe(923);
 await page.waitForFunction(()=>!history.state?.bkWorld);
 await page.evaluate(()=>(window as any).expand('sim'));
 await page.evaluate(()=>document.querySelector<HTMLAnchorElement>('.bk-nav a')!.click());
 await page.waitForFunction(()=>location.pathname==='/other');
 expect(await page.$('#bk-topbar')).not.toBeNull();
 expect(await page.$eval('body',el=>el.style.overflow)).toBe('');
 expect(await page.$('[inert]')).toBeNull();
 await page.evaluate(()=>{(window as any).expand('sim');document.querySelector('#sim')!.remove();(window as any).collapse()});
 expect(await page.$('#bk-topbar')).not.toBeNull();
 await page.waitForFunction(()=>!history.state?.bkLab);
 await page.evaluate(()=>{(window as any).enterWorld(document.querySelector('#world'));(window as any).exitWorld();const a=document.querySelector<HTMLAnchorElement>('.bk-nav a')!;a.href='/third';a.click()});
 await page.waitForFunction(()=>location.pathname==='/third');
 expect(await page.$eval('body',el=>el.classList.contains('bk-world-immersive'))).toBe(false);
 } finally {await browser.close();server.stop(true)}
},30000);
