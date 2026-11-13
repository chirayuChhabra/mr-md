import { afterAll, beforeAll, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import puppeteer, {type Browser} from 'puppeteer';
let browser: Browser;
let server: ReturnType<typeof Bun.serve>;
beforeAll(async () => {
 const root=resolve('mr-markdown-documentation/out');
 server=Bun.serve({port:0,async fetch(req){
  const filePath=resolve(root, `.${decodeURIComponent(new URL(req.url).pathname)}`);
  if(!filePath.startsWith(`${root}/`)) return new Response(null,{status:404});
  const file=Bun.file(filePath);
  return await file.exists()?new Response(file):new Response(null,{status:404});
 }});
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
});
afterAll(async()=>{await browser?.close();server?.stop(true);});
for(const width of [390,1440]) test(`Compile and Next remain legible across themes and palettes at ${width}px`,async()=>{
 const page=await browser.newPage();
 try {
  await page.setViewport({width,height:900,isMobile:width<768,hasTouch:width<768});
  await page.goto(new URL('coding.html',server.url).href);
  await page.waitForSelector('.bk-compile-btn');
  for(const theme of ['light','dark']) for(const palette of ['ink','field','ember','elixir','trunk','lava']) {
   const ratios=await page.evaluate((theme,palette)=>{
    for(const el of [document.documentElement,document.querySelector<HTMLElement>('.bk-shell')!]){el.dataset.theme=theme;el.dataset.palette=palette;}
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const ctx=canvas.getContext('2d')!;
    const luminance=(rgb:number[])=>rgb.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i]!,0);
    function contrast(el:Element){
     ctx.fillStyle='#fff';ctx.fillRect(0,0,1,1);
     const ancestors:Element[]=[];
     for(let node:Element|null=el;node;node=node.parentElement)ancestors.unshift(node);
     for(const node of ancestors){ctx.fillStyle=getComputedStyle(node).backgroundColor;ctx.fillRect(0,0,1,1);}
     const bg=luminance([...ctx.getImageData(0,0,1,1).data]);
     ctx.fillStyle=getComputedStyle(el).color;ctx.fillRect(0,0,1,1);
     const fg=luminance([...ctx.getImageData(0,0,1,1).data]);
     return (Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05);
    }
    const next=document.querySelector('.bk-end-link--next')!;
    const arrow=next.querySelector('.bk-phone-action-icon') ?? next.querySelector('span')!;
    const compile=document.querySelector('.bk-compile-btn')!;
    const initial=contrast(compile);
    compile.classList.add('binary-ready');
    const binary=contrast(compile);
    compile.classList.remove('binary-ready');
    return {compile:initial,binary,next:contrast(next.querySelector('strong')!),arrow:contrast(arrow)};
   },theme,palette);
   expect({width,theme,palette,compile:ratios.compile>=4.5,binary:ratios.binary>=4.5,next:ratios.next>=4.5,arrow:ratios.arrow>=3}).toEqual({width,theme,palette,compile:true,binary:true,next:true,arrow:true});
  }
 }finally{await page.close();}
});
