import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

for (const hasTouch of [false, true]) {
test(`saved cards stay readable on mobile across themes and keyboard editing (touch: ${hasTouch})`,async()=>{
 const bundle=await Bun.build({entrypoints:['src/client/measurement-timeline.ts'],target:'browser',format:'esm'});
 const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 try {
  const page=await browser.newPage();await page.setViewport({width:390,height:844,hasTouch});
  await page.setContent(`<style>${readFileSync('src/styles/theme.css','utf8')+readFileSync('src/styles/measurement-timeline.css','utf8')}body{margin:0;padding:16px}#saved{width:300px;max-width:100%;box-sizing:border-box}</style><div id="saved"></div>`);
  await page.addScriptTag({content:(await bundle.outputs[0].text()).replace(/export\s*\{[\s\S]*?\};?\s*$/, "")+"\nwindow.__createSaved=createMeasurementTimeline;"});
  await page.evaluate(async()=>{
   const t=(window as any).__createSaved(document.querySelector('#saved'),{schema:{},store:{read:async()=>({version:1,moments:[]}),write:async()=>{}},onRestoreSnapshot:()=>true});
   await t.ready;
   for(let i=0;i<20;i++)await t.record({kind:'snapshot',title:'Experiment with a longer descriptive name '+i,time:i,snapshot:{id:'saved-'+i,label:'Moment',time:i,timestamp:1,props:{},telemetry:{},state:{time:i},imageDataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',isExact:true}});
   (window as any).__saved=t;
  });
  expect(await page.$$eval('.bk-saved-card',cards=>cards.length)).toBe(20);
  for(const theme of ['light','dark'])for(const ui of ['standard','neo','playful']){
   await page.evaluate(({theme,ui})=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.ui=ui},{theme,ui});
   expect(await page.$eval('#saved',e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
  }
  await page.locator('.bk-saved-card:first-child .bk-saved-card-actions button').click();
  await page.locator('input[aria-label="Saved moment name"]').fill('My experiment');
  expect(await page.$eval('.bk-saved-card:first-child .bk-saved-open', e => getComputedStyle(e).display)).toBe('none');
  expect(await page.$eval('.bk-saved-card:first-child .bk-saved-card-actions', e => getComputedStyle(e).display)).toBe('none');
  expect(await page.$eval('.bk-saved-card:first-child .bk-saved-toggle', e => getComputedStyle(e).display)).toBe('none');
  const alignment = await page.evaluate(() => {
   const form = document.querySelector('.bk-saved-rename')!;
   const buttons = [...form.querySelectorAll('button')];
   return { labels: buttons.map(b => b.textContent), left: buttons[0].getBoundingClientRect().left, right: buttons[1].getBoundingClientRect().left };
  });
  expect(alignment.labels).toEqual(['Cancel', 'Save']);
  expect(alignment.left).toBeLessThan(alignment.right);
  await page.keyboard.press('Enter');
  expect(await page.$eval('.bk-saved-card:first-child .bk-saved-open',e=>e.textContent)).toContain('My experiment');
  const headerLayout = await page.$eval('.bk-saved-card:first-child', card => {
   const image = card.querySelector('img')!.getBoundingClientRect();
   const actions = card.querySelector('.bk-saved-card-actions')!.getBoundingClientRect();
   const title = card.querySelector('.bk-saved-open > span')!.getBoundingClientRect();
   return { imageTop: image.top, actionsBottom: actions.bottom, titleBottom: title.bottom };
  });
  expect(headerLayout.imageTop).toBeGreaterThanOrEqual(headerLayout.actionsBottom);
  expect(headerLayout.imageTop).toBeGreaterThanOrEqual(headerLayout.titleBottom);
  const beforeToast = await page.$eval('.bk-saved-list', e => e.getBoundingClientRect().top);
  await page.evaluate(() => (window as any).__saved.showFeedback('State deleted.'));
  expect(await page.$eval('.bk-saved-status', e => getComputedStyle(e).position)).toBe('fixed');
  expect(await page.$eval('.bk-saved-list', e => e.getBoundingClientRect().top)).toBe(beforeToast);
  expect(await page.$eval('.bk-saved-icon--delete', e => e.getAttribute('aria-label'))).toBe('Delete');
  await page.locator('.bk-saved-toolbar button').click();
  expect(await page.$$eval('.bk-saved-card img', images => images.every(e => getComputedStyle(e).display === 'none'))).toBe(true);
  expect(await page.$eval('.bk-saved-toolbar button', e => e.textContent)).toBe('');
  expect(await page.$eval('.bk-saved-card:first-child', e => e.getBoundingClientRect().height)).toBeLessThan(52);
  await page.mouse.move(380, 0);
  await page.focus('.bk-saved-toolbar button');
  const hidesActionsUntilHover = await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches);
  if (hasTouch) expect(hidesActionsUntilHover).toBe(false);
  expect(await page.$eval('.bk-saved-card-actions', e => getComputedStyle(e).opacity)).toBe(hidesActionsUntilHover ? '0' : '1');
  await page.hover('.bk-saved-card:first-child');
  expect(await page.$eval('.bk-saved-card-actions', e => getComputedStyle(e).opacity)).toBe('1');
  await page.mouse.move(380, 0);
  await page.focus('.bk-saved-card:first-child .bk-saved-icon');
  expect(await page.$eval('.bk-saved-card-actions', e => getComputedStyle(e).opacity)).toBe('1');
  expect(await page.$eval('.bk-saved-card:first-child .bk-saved-card-actions', e=>getComputedStyle(e).display)).toBe('flex');
  expect(await page.$eval('.bk-saved-toolbar', e=>e.parentElement?.className)).toBe('bk-saved-experiments');
  await page.locator('.bk-saved-card:first-child .bk-saved-card-actions button[aria-label="Rename"]').click();
  await page.locator('input[aria-label="Saved moment name"]').fill('Edited while collapsed');
  await page.keyboard.press('Enter');
  expect(await page.$eval('.bk-saved-card:first-child .bk-saved-open', e=>e.textContent)).toContain('Edited while collapsed');
  await page.locator('.bk-saved-card:first-child .bk-saved-toggle').click();
  expect(await page.$eval('.bk-saved-card:first-child img', e => getComputedStyle(e).display)).not.toBe('none');
  expect(await page.$eval('.bk-saved-card:nth-child(2) img', e => getComputedStyle(e).display)).toBe('none');
  await page.locator('.bk-saved-toolbar button').click();
  expect(await page.$$eval('.bk-saved-card img', images => images.every(e => getComputedStyle(e).display !== 'none'))).toBe(true);
  expect(await page.$eval('.bk-saved-preview .bk-saved-live', e => e.textContent)).toBe('Live');
  await page.focus('.bk-saved-open');
  await page.evaluate(()=>(window as any).__saved.update(30,{},true));
  expect(await page.evaluate(()=>document.activeElement?.className)).toBe('bk-saved-open');
 }finally{await browser.close()}
},20000);

}
