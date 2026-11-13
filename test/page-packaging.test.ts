import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildChapter } from '../src/parser/mdx.js';
import type { Chapter } from '../src/types.js';

const chapter: Chapter = {meta:{title:'Course',slug:'course'},lessons:[{meta:{title:'Lesson',slug:'lesson'},blocks:[{type:'markdown',src:'Hello'}]}]};

test('chapter pages share stable assets instead of embedding the application', () => {
 const outDir=mkdtempSync(join(tmpdir(),'mr-md-assets-'));
 try {
  buildChapter(chapter,{outDir,strict:false});
  const index=readFileSync(join(outDir,'index.html'),'utf8');
  const lesson=readFileSync(join(outDir,'lesson.html'),'utf8');
  expect(Buffer.byteLength(lesson)).toBeLessThan(50000);
  expect(existsSync(join(outDir,'assets/app.bundle.js'))).toBe(true);
  const asset=(html:string)=>html.match(/src="(assets\/app.bundle.js\?v=[a-f0-9]+)"/)?.[1];
  expect(asset(index)).toBeTruthy();
  expect(asset(index)).toBe(asset(lesson));
  buildChapter(chapter,{outDir,strict:false});
  expect(asset(readFileSync(join(outDir,'index.html'),'utf8'))).toBe(asset(index));
 } finally {rmSync(outDir,{recursive:true,force:true});}
});

test('explicit standalone chapters still embed their runtime',()=>{
 const outDir=mkdtempSync(join(tmpdir(),'mr-md-standalone-'));
 try {
  buildChapter(chapter,{outDir,strict:false,standalone:true});
  expect(readFileSync(join(outDir,'lesson.html'),'utf8')).toContain('<script type="module">');
  expect(existsSync(join(outDir,'assets/app.bundle.js'))).toBe(false);
 }finally{rmSync(outDir,{recursive:true,force:true});}
});

test('phone route bundle contains every screen and keeps quiz data without desktop simulation code', () => {
 const outDir=mkdtempSync(join(tmpdir(),'mr-md-phone-bundle-'));
 try {
  buildChapter(chapter,{outDir,strict:false});
  const data=JSON.parse(readFileSync(join(outDir,'assets/phone-app.json'),'utf8'));
  expect(data.version).toBe(1);
  expect(data.routes['lesson.html'].main).toContain('Hello');
  expect(data.routes['index.html'].main).toContain('bk-phone-catalogue');
  expect(data.routes['index.html'].main).not.toContain('bk-chapter-dashboard');
  expect(data.routes['lesson.html'].main).not.toContain('bk-phone-reading-header');
 }finally{rmSync(outDir,{recursive:true,force:true});}
});

test('phone views retain inert quiz data and remove executable and simulation markup', async()=>{
 const {phoneRouteFromHtml}=await import('../src/renderer/phone-app.js');
 const route=phoneRouteFromHtml(`<html><body><nav class="bk-nav"></nav><main class="bk-main"><div class="bk-quiz"><script type="application/json" class="bk-quiz-data">"answers"</script></div><script>alert('bad')</script><div class="bk-object"><div class="bk-object-header">Lab</div><div class="bk-phone-sim-notice">Read on phone</div><iframe srcdoc="heavy runtime"></iframe></div></main></body></html>`,'Lesson',false);
 expect(route.main).toContain('bk-quiz-data');
 expect(route.main).toContain('Read on phone');
 expect(route.main).not.toContain('heavy runtime');
 expect(route.main).not.toContain("alert('bad')");
});

test('shared nested lessons resolve their runtime, bundle, and course links from the course root', () => {
 const outDir = mkdtempSync(join(tmpdir(), 'mr-md-nested-assets-'));
 const nested: Chapter = {
  meta: { title: 'Nested course', slug: 'course' },
  lessons: [
   { meta: { title: 'Nested lesson', slug: 'unit/lesson', nextSlug: 'other/next', nextTitle: 'Next lesson' }, blocks: [{ type: 'markdown', src: 'Nested content' }] },
   { meta: { title: 'Next lesson', slug: 'other/next' }, blocks: [{ type: 'markdown', src: 'Next content' }] },
  ],
 };
 try {
  buildChapter(nested, { outDir, strict: false });
  const html = readFileSync(join(outDir, 'unit/lesson.html'), 'utf8');
  const pageUrl = new URL('https://example.test/courses/demo/unit/lesson.html');
  const baseHref = html.match(/<base[^>]*href="([^"]+)"/)?.[1];
  expect(baseHref).toBe('../');
  const base = new URL(baseHref!, pageUrl);
  const styles = html.match(/href="([^"]*assets\/theme.css\?v=[^"]+)"/)?.[1];
  const script = html.match(/src="([^"]*assets\/app.bundle.js\?v=[^"]+)"/)?.[1];
  const phone = html.match(/name="bk-phone-app" content="([^"]+)"/)?.[1];
  expect(new URL(styles!, base).pathname).toBe('/courses/demo/assets/theme.css');
  expect(new URL(script!, base).pathname).toBe('/courses/demo/assets/app.bundle.js');
  expect(new URL(phone!, pageUrl).pathname).toBe('/courses/demo/assets/phone-app.json');
  expect(new URL('other/next.html', base).pathname).toBe('/courses/demo/other/next.html');
  expect(html).toContain('courseBase.href = courseBase.href');
  const home = readFileSync(join(outDir, 'index.html'), 'utf8');
  expect(home).toContain('<base data-bk-course-root href="./">');
 } finally { rmSync(outDir, { recursive: true, force: true }); }
});

test('nested chapter aliases keep the same shared course root', () => {
 const outDir = mkdtempSync(join(tmpdir(), 'mr-md-nested-alias-'));
 try {
  buildChapter({ ...chapter, meta: { title: 'Course', slug: 'unit/course' } }, { outDir, strict: false });
  const alias = readFileSync(join(outDir, 'unit/course.html'), 'utf8');
  expect(alias).toContain('<base data-bk-course-root href="../">');
  expect(alias).toContain('name="bk-phone-app" content="../assets/phone-app.json"');
 } finally { rmSync(outDir, { recursive: true, force: true }); }
});

test('chapter output rejects lesson and alias slugs that escape its output directory', () => {
 const root = mkdtempSync(join(tmpdir(), 'mr-md-output-boundary-'));
 const outDir = join(root, 'out');
 try {
  expect(() => buildChapter({ ...chapter, lessons: [{ ...chapter.lessons[0]!, meta: { title: 'Escape', slug: '../escaped' } }] }, { outDir, strict: false })).toThrow('outside');
  expect(existsSync(join(root, 'escaped.html'))).toBe(false);
  expect(() => buildChapter({ ...chapter, meta: {title:'Escape alias',slug:'../alias'} }, { outDir, strict: false })).toThrow('outside');
  expect(existsSync(join(root, 'alias.html'))).toBe(false);
 } finally { rmSync(root, {recursive:true,force:true}); }
});
