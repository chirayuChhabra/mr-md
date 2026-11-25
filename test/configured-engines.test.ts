import { createBlogKit } from "../src/blog-kit/engine.js";
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { buildProject } from "../src/compiler.js";
import { configuredBuildOptions } from "../src/blog-kit/configured.js";
import { render } from "../src/renderer/index.js";
import type { Lesson } from "../src/types.js";

const roots: string[] = [];
const lesson: Lesson = { meta: {title: "Example", slug: "example"}, blocks: [
 {type: "markdown", src: "Before"}, {type: "quiz", src: "questions.json"}, {type: "markdown", src: "After"},
] };
function fixture(config: object, source: string) {
 const root = mkdtempSync(join(tmpdir(), "mrmd-engine-")); roots.push(root);
 writeFileSync(join(root,"mrmd.config.json"), JSON.stringify(config));
 writeFileSync(join(root,"custom.cjs"), source);
 return root;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root,{recursive:true,force:true}); });
test("JSON selection routes only testing blocks, preserves order and collects assets once", () => {
 const root = fixture({ testing: {engine:"./custom.cjs",settings:{label:"Assessment"}} }, `module.exports = {render({block,settings}) {return {html:'<article>'+settings.label+'</article>',css:'.assessment {color:red}',js:'window.assessmentLoaded=true; window.token="$&"'}}}`);
 const html = render(lesson, {contentBase:root});
 expect(html.indexOf("Before")).toBeLessThan(html.indexOf("<article data-bk-src"));
 expect(html.indexOf("<article data-bk-src")).toBeLessThan(html.indexOf("After"));
 expect(html).toContain("Assessment</article>");
 expect(html).toContain('window.token="$&"');
 expect(html.match(/window.assessmentLoaded=true/g)).toHaveLength(1);
 expect(html).toContain('name="bk-engine-navigation"');
 expect(html).not.toContain('"label":"Assessment"');
});
test("engine settings validation reports the section", () => {
 const root = fixture({testing:{engine:"./custom.cjs",settings:{}}}, `module.exports = {schema:{parse(){throw new Error('endpoint required')}},render(){return {html:''}}}`);
 expect(() => configuredBuildOptions({contentBase:root})).toThrow("testing.settings: endpoint required");
});
test("invalid module and output fail instead of silently keeping old quizzes", () => {
 const root = fixture({testing:{engine:"./custom.cjs"}}, "module.exports={}");
 expect(() => render(lesson,{contentBase:root})).toThrow("render function");
 writeFileSync(join(root,"custom.cjs"), "module.exports={render(){return 'wrong'}}");
 expect(() => render(lesson,{contentBase:root})).toThrow("render must return");
});
test("chapter build applies a replacement to every lesson and reloads edited modules", () => {
 const root = fixture({content:{lessons:["b.md","a.md"]},testing:{engine:"./custom.cjs"}}, `module.exports={render(){return {html:'<article>Version one</article>'}}}`);
 writeFileSync(join(root,"questions.json"), JSON.stringify({questions:[{question:"One?",options:["Yes","No"],answer:0}]}));
 for (const name of ["a","b"]) writeFileSync(join(root,name+".md"), `# ${name}\n\n![quiz](./questions.json)`);
 buildProject(root);
 for (const name of ["a","b"]) expect(readFileSync(join(root,"out",name+".html"),"utf8")).toContain("Version one");
 writeFileSync(join(root,"custom.cjs"), `module.exports={render(){return {html:'<article>Version two</article>'}}}`);
 buildProject(root);
 expect(readFileSync(join(root,"out/a.html"),"utf8")).toContain("Version two");
});
test("code and theme sections compose into the final document", () => {
 const root = fixture({code:{engine:"./custom.cjs",settings:{label:"Code"}},theme:{engine:"./theme.cjs"}}, `module.exports={render({code,settings}){return {html:'<pre class="replacement">'+settings.label+': '+code+'</pre>',css:'.replacement{color:blue}'}}}`);
 writeFileSync(join(root,"theme.cjs"), `module.exports={render({bodyHtml}){return {html:'<!doctype html><html><head></head><body>'+bodyHtml+'</body></html>',css:'body{background:white}'}}}`);
 const html = render({meta:lesson.meta,blocks:[{type:"markdown",src:'```js\nconst n = 1;\n```'}]}, {contentBase:root});
 expect(html).toContain('class="replacement"');
 expect(html).toContain("Code: const n = 1;");
 expect(html).toContain(".replacement{color:blue}");
 expect(html).toContain("body{background:white}");
});

test("ES module replacements reload on rebuild", () => {
 const root = fixture({testing:{engine:"./custom.js"}}, "");
 writeFileSync(join(root,"custom.js"), `export default {render(){return {html:'<p>First implementation</p>'}}}`);
 expect(render(lesson,{contentBase:root})).toContain("First implementation");
 writeFileSync(join(root,"custom.js"), `export default {render(){return {html:'<p>Second implementation</p>'}}}`);
 expect(render(lesson,{contentBase:root})).toContain("Second implementation");
});
test("local engine paths cannot escape the chapter", () => {
 const root = fixture({testing:{engine:"../outside.cjs"}}, "");
 writeFileSync(join(root,"mrmd.config.json"),JSON.stringify({testing:{engine:"../../../../etc/passwd"}}));
 expect(() => render(lesson,{contentBase:root})).toThrow("testing.engine");
});
test("chapter-local package entries resolve within the chapter", () => {
 const root = fixture({ testing: { engine: "./plugin" } }, "module.exports = { render() { return { html: '<article>Local engine</article>' }; } };");
 const directory = join(root, "plugin");
 mkdirSync(directory);
 writeFileSync(join(directory, "package.json"), JSON.stringify({ main: "../custom.cjs" }));
 expect(render(lesson, { contentBase: root })).toContain("Local engine");
});
test("a local package entry outside the chapter fails the path check", () => {
 const root = fixture({ testing: { engine: "./plugin" } }, "");
 const assets = mkdtempSync(join(tmpdir(), "mrmd-assets-"));
 roots.push(assets);
 const metadata = join(assets, "metadata.json");
 writeFileSync(metadata, "{}");
 const directory = join(root, "plugin");
 mkdirSync(directory);
 writeFileSync(join(directory, "package.json"), JSON.stringify({ main: relative(directory, metadata) }));
 expect(() => configuredBuildOptions({ contentBase: root })).toThrow("Local engines must be inside the chapter folder");
});
test("render reads built-in section settings from the same chapter config", () => {
 const root = fixture({theme:{settings:{mode:"dark",accent:"#123456",layout:"wide"}}}, "");
 const html = render({meta:lesson.meta,blocks:[]},{contentBase:root});
 expect(html).toContain('data-theme="dark"');
 expect(html).toContain("#123456");
 expect(html).toContain('data-bk-width="wide"');
});

test("changes to engine helper modules appear in the next render", () => {
 const root = fixture({testing:{engine:"./custom.js"}}, "");
 writeFileSync(join(root,"helper.js"), "export const label = 'First helper';");
 writeFileSync(join(root,"custom.js"), "import {label} from './helper.js'; export default {render(){return {html:'<p>'+label+'</p>'}}}");
 expect(render(lesson,{contentBase:root})).toContain("First helper");
 writeFileSync(join(root,"helper.js"), "export const label = 'Edited helper';");
 expect(render(lesson,{contentBase:root})).toContain("Edited helper");
});

test("a replacement theme receives the chapter overview body and lesson navigation", () => {
 const root = fixture({theme:{engine:"./custom.cjs"},content:{lessons:["intro.md"]}}, `module.exports={render({bodyHtml,navHtml}){return {html:'<!doctype html><html><head></head><body>'+(navHtml || '')+bodyHtml+'</body></html>'}}}`);
 writeFileSync(join(root,"intro.md"), "# Introduction\n\nText.");
 buildProject(root);
 const html = readFileSync(join(root,"out/index.html"),"utf8");
 expect(html).toContain("bk-chapter-dashboard");
 expect(html).toContain('href="intro.html"');
});

test("programmatic default BlogKit keeps the phone route bundle", () => {
 const root = fixture({content:{lessons:["intro.md"]}}, "");
 writeFileSync(join(root,"intro.md"), "# Introduction\n\nText.");
 buildProject(root, {blogKit: createBlogKit()});
 const data = JSON.parse(readFileSync(join(root,"out/assets/phone-app.json"),"utf8"));
 expect(data.routes["intro.html"].title).toBe("Introduction");
});
