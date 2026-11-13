import { afterAll, beforeAll, expect, test } from "bun:test";
import { resolve } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { render } from "../src/renderer/index.js";

let browser: Browser;
const contentsSelector = (page: Page) => page.viewport()!.width < 768 || page.viewport()!.height <= 500 ? "#bk-phone-contents" : "#bk-topbar-sidebar-toggle";
let docsServer: ReturnType<typeof Bun.serve>;
const lesson = (name: string) => new URL(`${name}.html`, docsServer.url).href;

beforeAll(async () => {
 const standalone = render({meta:{title:"Standalone lesson",slug:"standalone"},blocks:[{type:"markdown",src:"# Reading\nA standalone lesson."}]},{standalone:true});
 docsServer = Bun.serve({port:0, async fetch(req) {
  if (new URL(req.url).pathname === "/standalone-test.html") return new Response(standalone, {headers:{"Content-Type":"text/html"}});
  const root = resolve("mr-markdown-documentation/out");
  const filePath = resolve(root, `.${decodeURIComponent(new URL(req.url).pathname)}`);
  if (!filePath.startsWith(`${root}/`)) return new Response('', {status:404});
  const file = Bun.file(filePath);
  return await file.exists() ? new Response(file) : new Response('', {status:404});
 }});
 browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
});
afterAll(async () => { await browser?.close(); docsServer?.stop(true); });

for (const [width, height] of [[320, 740], [390, 844], [844, 390]]) {
 test(`phone ${width}×${height} replaces every simulation with a notice`, async () => {
  const page = await browser.newPage();
  try {
   await page.setViewport({ width, height, isMobile: true, hasTouch: true });
   await page.goto(lesson("creating-simulations"), { waitUntil: "domcontentloaded" });
   await page.waitForFunction(() => document.documentElement.dataset.isPhone === "true");
   expect(await page.$$(".bk-object iframe")).toHaveLength(0);
   expect(await page.$$(".bk-phone-sim-notice")).toHaveLength(5);
   expect(await page.evaluate(() => [...document.querySelectorAll(".bk-phone-sim-notice")].every(el => el.getBoundingClientRect().height > 0))).toBe(true);
   expect(await page.evaluate(() => [...document.querySelectorAll(".bk-sim-workspace, .bk-world-portal, .bk-pixel-gateway")].every(el => el.getBoundingClientRect().height === 0))).toBe(true);
   expect(await page.$eval(".bk-main", el => el.scrollWidth <= el.clientWidth)).toBe(true);
  } finally { await page.close(); }
 });
}

for (const [width, height] of [[768, 1024], [820, 1180], [1180, 820]]) {
 test(`tablet ${width}×${height} keeps expanded canvas and controls within the viewport`, async () => {
  const page = await browser.newPage();
  try {
   await page.setViewport({ width, height, isMobile: true, hasTouch: true });
   await page.goto(lesson("creating-simulations"), { waitUntil: "domcontentloaded" });
   await page.waitForSelector(".bk-sim-preview iframe");
   await page.locator('button[aria-label="Expand simulation"]').click();
   await page.waitForSelector(".bk-object--maximized");
   expect(await page.evaluate(() => [...document.querySelectorAll(".bk-object--maximized .bk-sim-stage, .bk-object--maximized .bk-sim-inspector")].every(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1;
   }))).toBe(true);
   await page.locator('button[aria-label="Exit expanded view"]').click();
   expect(await page.$(".bk-object--maximized")).toBeNull();
  } finally { await page.close(); }
 });
}

test("phone code editing, execution, and keyboard drawer dismissal work inline", async () => {
 const page = await browser.newPage();
 try {
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(lesson("coding"), { waitUntil: "domcontentloaded" });
  await page.waitForSelector('.cm-content[contenteditable="true"]');
  await page.locator('.bk-code-runner .cm-content[contenteditable="true"]').fill('console.log("Mobile edit works");');
  await page.locator(".bk-code-runner .bk-run-btn").click();
  await page.waitForFunction(() => document.querySelector(".bk-code-runner .bk-runner-logs")?.textContent?.includes("Mobile edit works"));
  expect(await page.$(".bk-object--maximized")).toBeNull();
  expect(await page.$eval(".bk-sidebar", el => (el as HTMLElement).inert)).toBe(true);
  await page.locator(contentsSelector(page)).click();
  expect(await page.$eval(contentsSelector(page), el => el.getAttribute("aria-expanded"))).toBe("true");
  await page.keyboard.press("Escape");
  expect(await page.$eval(contentsSelector(page), el => el === document.activeElement)).toBe(true);
  expect(await page.$eval(".bk-sidebar", el => (el as HTMLElement).inert)).toBe(true);
 } finally { await page.close(); }
});

for (const [width, height] of [[390, 844], [844, 390]]) {
 test(`contents sheet fits ${width}×${height} and exposes its header`, async () => {
  const page = await browser.newPage();
  try {
   await page.setViewport({ width, height, isMobile: true, hasTouch: true });
   await page.goto(lesson("coding"));
   await page.locator(contentsSelector(page)).click();
   await page.waitForFunction(() => document.querySelector('.bk-sidebar')?.getBoundingClientRect().top! >= 0);
   expect(await page.$eval('.bk-drawer-header', el => el.getBoundingClientRect().height > 0)).toBe(true);
   expect(await page.$eval('.bk-sidebar', el => { const r = el.getBoundingClientRect(); return r.width <= innerWidth && r.bottom <= innerHeight + 1; })).toBe(true);
  } finally { await page.close(); }
 });
}

test('drawer traps keyboard focus and backdrop dismisses it', async () => {
 const page = await browser.newPage();
 try {
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.goto(lesson('coding'));
  await page.locator(contentsSelector(page)).click();
  await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
  expect(await page.evaluate(() => !!document.activeElement?.closest('.bk-sidebar'))).toBe(true);
  await page.keyboard.press('Escape');
  await page.locator(contentsSelector(page)).click();
  await page.evaluate(() => (document.querySelector('#bk-backdrop') as HTMLElement).click());
  expect(await page.$eval('.bk-main', el => (el as HTMLElement).inert)).toBe(false);
 } finally { await page.close(); }
});

test('wheel at navigation edge does not scroll the lesson', async () => {
 const page = await browser.newPage();
 try {
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.goto(lesson('coding'));
  await page.locator(contentsSelector(page)).click();
  await page.$eval('.bk-nav', el => { el.insertAdjacentHTML('beforeend', '<div style="height:2000px"></div>'); el.scrollTop = el.scrollHeight; });
  const box = (await (await page.$('.bk-nav'))!.boundingBox())!;
  const before = await page.$eval('.bk-main', el => el.scrollTop);
  await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.wheel({deltaY:500});
  expect(await page.$eval('.bk-main', el => el.scrollTop)).toBe(before);
  expect(await page.evaluate(() => scrollY)).toBe(0);
 } finally { await page.close(); }
});

test('tablet rotation clears modal state and desktop remains visible', async () => {
 const page = await browser.newPage();
 try {
  await page.setViewport({width:820,height:1180,isMobile:true,hasTouch:true}); await page.goto(lesson('coding'));
  await page.locator(contentsSelector(page)).click();
  await page.setViewport({width:1180,height:820,isMobile:true,hasTouch:true});
  await page.waitForFunction(() => !document.querySelector('.bk-main')?.inert);
  expect(await page.$eval('.bk-sidebar', el => !el.hasAttribute('aria-modal') && !(el as HTMLElement).inert)).toBe(true);
  expect(await page.$eval('.bk-main', el => el.getBoundingClientRect().width > 500)).toBe(true);
  await page.setViewport({width:1440,height:900});
  expect(await page.$eval('.bk-sidebar', el => el.getBoundingClientRect().width > 0)).toBe(true);
 } finally { await page.close(); }
});


test('expanded inspector wheel at its edge preserves lesson scroll', async () => {
 const page = await browser.newPage();
 try {
  await page.setViewport({width:820,height:1180,isMobile:true,hasTouch:true});
  await page.goto(lesson('creating-simulations'));
  await page.locator('button[aria-label="Expand simulation"]').click();
  await page.waitForSelector('.bk-object--maximized .bk-sim-inspector');
  await page.$eval('.bk-object--maximized .bk-sim-inspector', el => { el.insertAdjacentHTML('beforeend', '<div style="height:2000px"></div>'); el.scrollTop = el.scrollHeight; });
  const box = (await (await page.$('.bk-object--maximized .bk-sim-inspector'))!.boundingBox())!;
  const before = await page.$eval('.bk-main', el => el.scrollTop);
  await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.wheel({deltaY:500});
  expect(await page.$eval('.bk-main', el => el.scrollTop)).toBe(before);
 } finally { await page.close(); }
});

for (const [width, height] of [[820, 1180], [1024, 768], [1180, 820]]) {
 test(`full-window lab covers every edge and uses horizontal space at ${width}×${height}`, async () => {
  const page = await browser.newPage();
  try {
   await page.setViewport({ width, height, isMobile: true, hasTouch: true });
   await page.goto(lesson('creating-simulations'));
   for (const ui of ['standard', 'neo', 'playful']) {
    await page.evaluate(ui => {
     document.documentElement.dataset.ui = ui;
     document.querySelector<HTMLElement>('.bk-shell')!.dataset.ui = ui;
    }, ui);
    const opener = page.locator('button[aria-label="Expand simulation"]');
    await opener.click();
    await page.waitForFunction(() => document.querySelector('.bk-object--maximized')?.hasAttribute('data-bk-canvas-responsive'));
    const result = await page.$eval('.bk-object--maximized', el => {
     const r = el.getBoundingClientRect(), s = getComputedStyle(el);
     const stage = el.querySelector('.bk-sim-stage')!.getBoundingClientRect();
     const inspector = el.querySelector('.bk-sim-inspector')!.getBoundingClientRect();
     return {
      covers: Math.abs(r.left) < 1 && Math.abs(r.top) < 1 && Math.abs(r.right - innerWidth) < 1 && Math.abs(r.bottom - innerHeight) < 1,
      square: s.borderRadius === '0px' && s.borderTopWidth === '0px' && s.boxShadow === 'none',
      corners: [[1,1],[innerWidth-2,1],[1,innerHeight-2],[innerWidth-2,innerHeight-2]].every(([x,y]) => el.contains(document.elementFromPoint(x,y))),
      horizontal: innerHeight > innerWidth && innerWidth <= 1024 ? inspector.top >= stage.bottom - 1 && stage.width >= innerWidth - 1 : inspector.left >= stage.right - 1 && stage.width >= 420 && inspector.width >= 280,
      proportionate: (() => { const frame = el.querySelector('iframe')!.getBoundingClientRect(); const ratio = Number((el as HTMLElement).style.getPropertyValue('--bk-canvas-aspect')); return Math.abs(frame.width / frame.height - ratio) < 0.02; })(),
     };
    });
    expect(result).toEqual({ covers: true, square: true, corners: true, horizontal: true, proportionate: true });
    await page.locator('button[aria-label="Exit expanded view"]').click();
    expect(await page.$('.bk-object--maximized')).toBeNull();
    expect(await page.$eval('.bk-main', el => !(el as HTMLElement).inert)).toBe(true);
   }
  } finally { await page.close(); }
 });
}

for (const width of [320, 390]) {
 test(`phone ${width} keeps compact runner titles beside their actions`, async () => {
  const page = await browser.newPage();
  try {
   await page.setViewport({width, height:844, isMobile:true, hasTouch:true});
   await page.goto(lesson('coding'));
   expect(await page.$eval('.bk-phone-nav', el => el.getBoundingClientRect().bottom <= innerHeight + 1)).toBe(true);
   expect(await page.$$eval('.bk-runner-header', headers => headers.every(header => {
    const title = header.querySelector('.bk-runner-header-left')?.getBoundingClientRect();
    const actions = header.querySelector('.bk-runner-header-actions')?.getBoundingClientRect();
    return !!title && !!actions && actions.left >= title.right - 1 && header.getBoundingClientRect().height <= 80;
   }))).toBe(true);
  } finally { await page.close(); }
 });
}

test('phone toolbar and floating contents open distinct sheets with focus return', async () => {
 const page = await browser.newPage();
 try {
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.goto(lesson('coding'));
  expect(await page.$eval('#bk-topbar', el => el.getBoundingClientRect().height)).toBe(0);
  await page.waitForFunction(()=>document.documentElement.dataset.phoneAppReady==='true');
  expect(await page.$eval('.bk-phone-home',el=>(el as HTMLAnchorElement).href.endsWith('/index.html'))).toBe(true);
  await page.locator('#bk-phone-appearance').click();
  await page.waitForFunction(() => !document.querySelector<HTMLElement>('#bk-theme-panel')?.hidden);
  expect(await page.$eval('.bk-nav', el => el.getBoundingClientRect().height)).toBe(0);
  await page.locator('#bk-theme-panel button[data-theme="dark"]').click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await page.keyboard.press('Escape');
  expect(await page.$eval('#bk-phone-appearance', el => el === document.activeElement)).toBe(true);
  await page.locator('#bk-phone-contents').click();
  expect(await page.$eval('.bk-nav', el => el.getBoundingClientRect().height > 0)).toBe(true);
  await page.locator('#bk-drawer-close').click();
  expect(await page.$eval('#bk-phone-contents', el => el === document.activeElement)).toBe(true);
 } finally { await page.close(); }
});

test('phone navigation keeps its app bar and shell without fetching HTML', async () => {
 const page = await browser.newPage();
 try {
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.goto(lesson('coding'));
  await page.waitForFunction(()=>document.documentElement.dataset.phoneAppReady==='true');
  await page.evaluate(()=>{(window as any).__appbar=document.querySelector('.bk-phone-appbar');(window as any).__shell=document.querySelector('.bk-shell');});
  const requests: string[]=[];
  page.on('request',req=>{if(req.url().includes('.html'))requests.push(req.url());});
  await page.locator('#bk-phone-back').click();
  await page.waitForFunction(()=>location.pathname.endsWith('/index.html'));
  expect(requests).toHaveLength(0);
  expect(await page.evaluate(()=>(window as any).__appbar===document.querySelector('.bk-phone-appbar') && (window as any).__shell===document.querySelector('.bk-shell'))).toBe(true);
  await page.locator('#bk-phone-search').click();
  await page.keyboard.press('Escape');
  expect(await page.$eval('#bk-phone-search',el=>el===document.activeElement)).toBe(true);
 }finally{await page.close();}
});

test('phone catalogue uses compact rows and code swipes scroll the lesson', async () => {
 const page = await browser.newPage();
 try {
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.goto(lesson('index'));
  expect(await page.$eval('.bk-phone-catalogue', el => el.getBoundingClientRect().height > 0)).toBe(true);
  expect(await page.$eval('.bk-chapter-dashboard', el => el.getBoundingClientRect().height)).toBe(0);
  expect(await page.$eval('.bk-phone-catalogue li a', el => el.getBoundingClientRect().height < 140)).toBe(true);
  await page.goto(lesson('coding'));
  await page.waitForSelector('.cm-content');
  await page.$eval('.cm-content', el => el.scrollIntoView({block:'center'}));
  const before = await page.$eval('.bk-main', el => el.scrollTop);
  const box = await page.$eval('.cm-content', el => {const r=el.getBoundingClientRect();return {x:r.x+50,y:Math.min(r.bottom-10,innerHeight-150)};});
  const cdp = await page.createCDPSession();
  await cdp.send('Input.synthesizeScrollGesture', {x:box.x,y:box.y,yDistance:-300,gestureSourceType:'touch'});
  expect(await page.$eval('.bk-main', el => el.scrollTop)).toBeGreaterThan(before+50);
  await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.setViewport({width:820,height:1180,isMobile:true,hasTouch:true})]);
  await page.goto(lesson('index'));
  expect(await page.$eval('.bk-phone-catalogue', el => el.getBoundingClientRect().height)).toBe(0);
  expect(await page.$eval('.bk-chapter-dashboard', el => el.getBoundingClientRect().height > 0)).toBe(true);
 } finally {await page.close();}
});

test('phone toolbar hides down, returns up, and respects small scroll movements', async () => {
 const page = await browser.newPage();
 try {
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.goto(lesson('quickstart'));
  await page.waitForFunction(()=>document.documentElement.dataset.phoneAppReady==='true');
  await page.$eval('.bk-main', el => { el.scrollTop = 500; });
  await page.waitForFunction(()=>document.querySelector('.bk-shell')?.hasAttribute('data-toolbar-hidden'));
  await page.$eval('.bk-main', el => { el.scrollTop = 492; });
  expect(await page.$eval('.bk-shell',el=>el.hasAttribute('data-toolbar-hidden'))).toBe(true);
  await page.$eval('.bk-main', el => { el.scrollTop = 440; });
  await page.waitForFunction(()=>!document.querySelector('.bk-shell')?.hasAttribute('data-toolbar-hidden'));
 } finally {await page.close();}
});

test('phone back restores the same screen, scroll, and edited code with neutral tap feedback', async () => {
 const page = await browser.newPage();
 try {
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.goto(lesson('index'));
  await page.waitForFunction(()=>document.documentElement.dataset.phoneAppReady==='true');
  await page.$eval('.bk-main',el=>{el.scrollTop=240;});
  const position=await page.$eval('.bk-main',el=>el.scrollTop);
  await page.evaluate(()=>{(window as any).__catalogue=document.querySelector('.bk-phone-catalogue');document.querySelector<HTMLAnchorElement>('[data-phone-lesson="coding"]')!.click();});
  await page.waitForSelector('.cm-content[contenteditable="true"]');
  await page.locator('.bk-code-runner .cm-content[contenteditable="true"]').fill('console.log("preserved draft");');
  await page.locator('#bk-phone-back').click();
  await page.waitForFunction(()=>location.pathname.endsWith('/index.html'));
  expect(await page.$eval('.bk-main',el=>el.scrollTop)).toBe(position);
  expect(await page.evaluate(()=>(window as any).__catalogue===document.querySelector('.bk-phone-catalogue'))).toBe(true);
  expect(await page.$eval('[data-phone-lesson="coding"]',el=>getComputedStyle(el).getPropertyValue('-webkit-tap-highlight-color'))).toBe('rgba(0, 0, 0, 0)');
  await page.$eval('[data-phone-lesson="coding"]',el=>(el as HTMLElement).click());
  expect(await page.$eval('.bk-code-runner .cm-content',el=>el.textContent)).toContain('preserved draft');
 }finally{await page.close();}
});

test('phone routes open from the loaded app bundle without another request', async () => {
 const page=await browser.newPage();
 try {
  await page.evaluateOnNewDocument(() => {Object.defineProperty(navigator,'connection',{value:{saveData:false,effectiveType:'4g'}});});
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.goto(lesson('index'),{waitUntil:'networkidle0'});
  const requests: string[]=[];
  await page.setRequestInterception(true);
  page.on('request',req=>{
   if(req.url().endsWith('/quickstart.html')) {requests.push(req.url());void req.abort();}
   else void req.continue();
  });
  await page.$eval('[data-phone-lesson="quickstart"]',el=>(el as HTMLElement).click());
  await page.waitForFunction(()=>location.pathname.endsWith('/quickstart.html'));
  expect(requests).toHaveLength(0);
  expect(await page.$eval('.bk-hero h1',el=>el.textContent)).toContain('Quickstart');
 }finally{await page.close();}
});

test('phone system Back dismisses a sheet before leaving the screen', async () => {
 const page=await browser.newPage();
 try {
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.goto(lesson('coding'));
  await page.waitForFunction(()=>document.documentElement.dataset.phoneAppReady==='true');
  await page.locator('#bk-phone-contents').click();
  await page.waitForFunction(()=>history.state?.bkPhoneSheet==='contents');
  await page.goBack();
  await page.waitForFunction(()=>document.querySelector('.bk-shell')?.getAttribute('data-mobile-open')!=='true');
  expect(new URL(page.url()).pathname).toBe('/coding.html');
  expect(await page.$('.cm-content')).not.toBeNull();
 }finally{await page.close();}
});

test('overscrolling never changes lessons; the end action advances explicitly', async () => {
 const page=await browser.newPage();
 try {
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.goto(lesson('quickstart'));
  await page.waitForFunction(()=>document.documentElement.dataset.phoneAppReady==='true');
  await page.$eval('.bk-main',el=>{el.scrollTop=el.scrollHeight;});
  const gesture = async (distance:number, hold:number) => page.evaluate(async (distance,hold)=>{
   const main=document.querySelector('.bk-main')!;
   const touch=(y:number)=>new Touch({identifier:1,target:main,clientX:180,clientY:y});
   main.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[touch(600)]}));
   main.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,touches:[touch(600-distance)]}));
   await new Promise(resolve=>setTimeout(resolve,hold));
   main.dispatchEvent(new TouchEvent('touchend',{bubbles:true,changedTouches:[touch(600-distance)]}));
  },distance,hold);
  await gesture(40,0);
  expect(new URL(page.url()).pathname).toBe('/quickstart.html');
  await gesture(96,0);
  expect(new URL(page.url()).pathname).toBe('/quickstart.html');
  await page.$eval('.bk-end-link--next',el=>(el as HTMLAnchorElement).click());
  await page.waitForFunction(()=>location.pathname.endsWith('/modules.html'));
 }finally{await page.close();}
});

test('phone course back returns home after sequential lessons and marks the active row', async () => {
 const page = await browser.newPage();
 try {
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.goto(lesson('quickstart'), {waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.documentElement.dataset.phoneAppReady==='true');
  await page.$eval('.bk-end-link--next',el=>(el as HTMLElement).click());
  await page.waitForFunction(()=>location.pathname.endsWith('modules.html'));
  await page.locator('#bk-phone-back').click();
  await page.waitForSelector('.bk-phone-catalogue');
  expect(await page.$eval('[data-phone-lesson="modules"]',el=>el.getAttribute('aria-current'))).toBe('location');
  expect(await page.$eval('.bk-phone-start',el=>el.getAttribute('href'))).toContain('modules.html');
  expect(await page.$eval('.bk-phone-appbar',el=>getComputedStyle(el).display)).toBe('flex');
  expect(await page.$$('.bk-phone-pull-next')).toHaveLength(0);
 } finally {await page.close();}
});

test('phone sheet swipes dismiss and lesson arrows share alignment', async () => {
 const page = await browser.newPage();
 try {
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.goto(lesson('modules'));
  await page.waitForFunction(()=>document.documentElement.dataset.phoneAppReady==='true');
  await page.locator('#bk-phone-contents').click();
  await page.waitForSelector('.bk-shell[data-mobile-open="true"]');
  await page.evaluate(()=>{
   const sheet=document.querySelector('.bk-sidebar')!;
   const touch=(x:number)=>new Touch({identifier:1,target:sheet,clientX:x,clientY:300});
   sheet.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[touch(30)]}));
   sheet.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[touch(150)]}));
   sheet.dispatchEvent(new TouchEvent('touchend',{bubbles:true,changedTouches:[touch(150)]}));
  });
  await page.waitForFunction(()=>!document.querySelector('.bk-shell')!.hasAttribute('data-mobile-open'));
  await page.$eval('.bk-main',el=>{el.scrollTop=el.scrollHeight;});
  const icons=await page.$$eval('.bk-phone-action-icon',els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,width:r.width,height:r.height};}));
  expect(icons).toHaveLength(2);
  expect(Math.abs(icons[0]!.x-icons[1]!.x)).toBeLessThan(1);
  expect(icons.every(i=>i.width>=20 && i.height>=20)).toBe(true);
 } finally {await page.close();}
});


test('phone search replaces duplicate menus and Contents stays in the right thumb zone only in lessons', async () => {
 const page=await browser.newPage();
 try {
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.goto(lesson('index'));
  await page.waitForFunction(()=>document.documentElement.dataset.phoneAppReady==='true');
  expect(await page.$('#bk-phone-app-contents')).toBeNull();
  expect(await page.$('.bk-phone-breadcrumb-divider')).toBeNull();
  expect(await page.$eval('.bk-phone-nav',el=>getComputedStyle(el).display)).toBe('none');
  await page.locator('button[aria-label="Search course"]').click();
  await page.locator('input[type="search"]').fill('nonsense-no-matching-lesson');
  await page.waitForFunction(()=>document.querySelector('.bk-phone-search-dialog [role=status]')?.textContent?.includes('No results'));
  await page.locator('input[type="search"]').fill('Quickstart');
  await page.waitForSelector('.bk-phone-search-dialog a');
  await page.locator('.bk-phone-search-dialog a').click();
  await page.waitForFunction(()=>location.pathname.endsWith('/quickstart.html'));
  expect(await page.$eval('.bk-phone-search-dialog',el=>(el as HTMLDialogElement).open)).toBe(false);
  const button=await page.$eval('#bk-phone-contents',el=>{const r=el.getBoundingClientRect();return {center:r.x+r.width/2,bottom:r.bottom,width:r.width};});
  expect(button.center).toBeGreaterThan(260);
  expect(button.bottom).toBeLessThanOrEqual(844-48);
  expect(button.width).toBeGreaterThan(100);
 } finally {await page.close();}
});

for (const width of [320,390]) {
 test(`compact phone ${width} wraps editable code and keeps search minimal`, async () => {
  const page=await browser.newPage();
  try {
   await page.setViewport({width,height:844,isMobile:true,hasTouch:true});
   await page.goto(lesson('coding'));
   await page.waitForSelector('.cm-content[contenteditable="true"]');
   expect(await page.$('.bk-phone-app-title')).toBeNull();
   expect(await page.$eval(".bk-code-runner",e=>e.getBoundingClientRect().height)).toBeLessThan(280);
   const editor=page.locator('.cm-content[contenteditable="true"]');
   await editor.fill('const message = "A long line of text that should wrap across several lines on a compact phone without disappearing off the right side of the editor";');
   await page.waitForFunction(()=>{const e=document.querySelector('.cm-line')!;return e.getBoundingClientRect().height>32;});
   expect(await page.$eval('.cm-scroller',e=>e.scrollWidth<=e.clientWidth+2)).toBe(true);
   expect(await page.$eval('.bk-main',e=>e.scrollWidth<=e.clientWidth)).toBe(true);
   await page.locator('#bk-phone-search').click();
   await page.locator('.bk-phone-search-dialog input').fill('code');
   await page.waitForSelector('.bk-phone-search-dialog a');
   expect(await page.$eval('.bk-phone-search-dialog li',e=>getComputedStyle(e,'::before').content)).toBe('none');
   expect(await page.$eval('.bk-phone-search-dialog input',e=>e.getBoundingClientRect().height)).toBe(48);
   await page.locator('button[aria-label="Close search"]').click();
   expect(await page.$eval('.bk-phone-search-dialog',e=>(e as HTMLDialogElement).open)).toBe(false);
  } finally {await page.close();}
 });
}

test('phone body swipe dismisses contents and output remains fully visible', async () => {
 const page=await browser.newPage();
 try {
  await page.setViewport({width:320,height:740,isMobile:true,hasTouch:true});
  await page.goto(lesson('coding'));
  await page.waitForFunction(()=>document.documentElement.dataset.phoneAppReady==='true');
  await page.locator('#bk-phone-contents').click();
  await page.waitForSelector('.bk-shell[data-mobile-open="true"]');
  await page.evaluate(()=>{
   const target=document.querySelector('.bk-nav a')!;
   const touch=(y:number)=>new Touch({identifier:1,target,clientX:180,clientY:y});
   target.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[touch(300)]}));
   target.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[touch(400)]}));
   target.dispatchEvent(new TouchEvent('touchend',{bubbles:true,changedTouches:[touch(400)]}));
  });
  await page.waitForFunction(()=>!document.querySelector('.bk-shell')!.hasAttribute('data-mobile-open'));
  await page.locator('.bk-code-runner .bk-run-btn').click();
  await page.waitForFunction(()=>document.querySelector('.bk-log-entry')?.textContent?.includes('5'));
  await page.evaluate(()=>{
   const logs=document.querySelector('.bk-runner-logs')!;
   const card=document.createElement('div');card.className='bk-challenge-card success';
   card.innerHTML='<div class="bk-challenge-icon">🎉</div><div class="bk-challenge-info"><div class="bk-challenge-title">Correct! Challenge Passed</div><div class="bk-challenge-desc">Output matches expected criteria. Excellent work!</div></div>';
   logs.append(card);
  });
  expect(await page.$eval('.bk-runner-output',e=>e.scrollHeight<=e.clientHeight+1)).toBe(true);
  expect(await page.$eval('.bk-challenge-card',e=>e.getBoundingClientRect().height)).toBeLessThan(130);
  expect(await page.$eval('.bk-code-block pre',e=>getComputedStyle(e).whiteSpace)).toBe('pre-wrap');
  expect(await page.$$eval('.bk-runner-badge',es=>es.every(e=>!e.textContent?.includes('Challenge')))).toBe(true);
 } finally {await page.close();}
});


test('standalone phone lessons retain accessible theme and contents controls', async () => {
 const page=await browser.newPage();
 try {
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.goto(new URL('/standalone-test.html',docsServer.url).href);
  expect(await page.$eval('#bk-theme-toggle',el=>el.getBoundingClientRect().height)).toBeGreaterThan(0);
  const before=await page.evaluate(()=>document.documentElement.dataset.theme);
  await page.locator('#bk-theme-toggle').click();
  expect(await page.evaluate(()=>document.documentElement.dataset.theme)).not.toBe(before);
  await page.locator('#bk-topbar-sidebar-toggle').click();
  await page.waitForFunction(()=>document.querySelector('.bk-shell')?.getAttribute('data-mobile-open')==='true');
  await page.keyboard.press('Escape');
  expect(await page.$eval('.bk-main',el=>(el as HTMLElement).inert)).toBe(false);
 } finally {await page.close();}
});
