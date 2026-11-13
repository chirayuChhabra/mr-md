import { expect, test } from "bun:test";
import { normalizeSimulationOptions, normalizeWorldOptions } from "../src/builder/utils.js";
import { validateSimulationConfig, SimulationConfigError } from "../src/simulation-config.js";

const config = {
 telemetry: { speed: { scene: "speed", graph: { x: { key: "distance", unit: "m" }, y: { unit: "m/s" } }, notifications: [{ id: "high", when: { op: "gt", value: 3 }, message: "High", tone: "warning", toast: false }] }, distance: { graph: true } },
 measurements: { visible: ["speed"], graphs: [{ key: "speed", width: 320 }], initialTab: "timeline" },
};

test("preserves measurement metadata through validation and normalization", () => {
 const parsed = validateSimulationConfig(config);
 expect(parsed.measurements).toEqual(config.measurements);
 expect(parsed.telemetry).toEqual(config.telemetry);
 expect(normalizeSimulationOptions({}, 400, parsed).measurements).toEqual(config.measurements);
 expect(normalizeWorldOptions({}, 400, parsed as never).measurements).toEqual(config.measurements);
});

test("reports invalid references and bounds", () => {
 for (const value of [
  { telemetry: { a: { graph: { x: { key: "missing" } } } } },
  { measurements: { visible: ["missing"] } },
  { measurements: { graphs: [{ key: "missing" }] } },
  { telemetry: { a: { graph: true } }, measurements: { graphs: [{ key: "a" }, { key: "a" }] } },
  { measurements: { graphs: [{ key: "a", width: 0 }] } },
  { measurements: { notifications: { maxVisible: 4 } } },
 ]) expect(() => validateSimulationConfig(value)).toThrow(SimulationConfigError);
});

test("Markdown and builder preserve startup views for block and steps", async () => {
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const {parseLesson}=await import('../src/parser/mdx.js');
 const {LessonBlocks}=await import('../src/builder/LessonBlocks.js');
 const directory=mkdtempSync(join(tmpdir(),'measurement-roundtrip-'));
 try {
  for(const name of ['lab','steps']){
   writeFileSync(join(directory,`${name}.js`),'window.bkSetup(800, 450, () => {});');
   writeFileSync(join(directory,`${name}.config.json`),JSON.stringify({...config,...(name==='steps'?{type:'steps',steps:[{id:'one',title:'Explore'}]}:{})}));
  }
  const parsed=parseLesson('---\ntitle: Measurements\nslug: measurements\n---\n\n![Lab](./lab.js)\n\n![Steps](./steps.js)',{contentBase:directory},directory);
  for(const block of parsed.blocks.filter(b=>b.type==='simulation'||b.type==='steps')){
   expect(block.measurements).toEqual(config.measurements);
   expect(block.telemetry?.speed.graph).toEqual(config.telemetry.speed.graph);
  }
  expect(parsed.blocks.filter(b=>b.type==='simulation'||b.type==='steps')).toHaveLength(2);
  class Lesson extends LessonBlocks {get contentBase(){return directory;} getBlocks(){return this.blocks;}}
  const lesson=new Lesson();lesson.lab('lab.js',{});lesson.steps('steps.js',{});
  for(const block of lesson.getBlocks()) expect((block as any).measurements).toEqual(config.measurements);
 } finally {rmSync(directory,{recursive:true,force:true});}
});

test("preserves concise timeline options and capture default in measurements", () => {
	const conciseConfig = {
		measurements: {
			timeline: { capture: true, controls: true },
		},
	};
	const parsed = validateSimulationConfig(conciseConfig);
	expect(parsed.measurements?.timeline).toEqual({ capture: true, controls: true });
	expect(normalizeSimulationOptions({}, 400, parsed).measurements?.timeline).toEqual({
		capture: true,
		controls: true,
	});

	const boolConfig = validateSimulationConfig({ timeline: true });
	expect(boolConfig.measurements?.timeline).toBe(true);
	expect(normalizeSimulationOptions({}, 400, boolConfig).measurements?.timeline).toBe(true);
});
