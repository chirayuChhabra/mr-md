import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { defineSimulation } from "../src/simulation.js";
import { parseLesson } from "../src/parser/mdx.js";

const base = resolve(import.meta.dir, "../skills/mr-md-simulations/assets");
test("starter configs route through the real lesson parser", () => {
  for (const [name, type] of [["simulation", "simulation"], ["steps", "steps"], ["world", "world"], ["world3d", "world"]]) {
    const lesson = parseLesson(`![Example](./${name}.js)`, { contentBase: base });
    expect(lesson.blocks.some(block => block.type === type)).toBe(true);
  }
});

test("steps starter pauses, completes once, and resets on step changes", () => {
  let draw: Function, onStep: Function, onReset: Function;
  let now = 0, completions = 0;
  const listeners = new Map<string, Function[]>();
  const parent = { postMessage() {} };
  const window = {
    parent,
    addEventListener: (name: string, fn: Function) => { listeners.set(name, [...(listeners.get(name) || []), fn]); },
    removeEventListener() {},
    dispatchEvent: (event: Event) => { for (const fn of listeners.get(event.type) || []) fn(event); },
    __loop: false, __simProps: { speed: 100, target: 1 },
    bkOnStep: (fn: Function) => { onStep = fn; },
    bkOnReset: (fn: Function) => { onReset = fn; },
    bkSetup: (_w: number, _h: number, fn: Function) => { draw = fn; },
    bkColor: () => "#000", bkCompleteStep: () => { completions++; },
  };
  const ctx = new Proxy({}, { get: () => () => {} });
  runInNewContext(`window.defineSimulation = ${defineSimulation.toString()};\n${readFileSync(resolve(base, "steps.js"), "utf8")}`, { window, structuredClone, CustomEvent, performance: { now: () => now } });
  const render = () => { now += 50; for (const fn of listeners.get("message") || []) fn({source:parent,data:{type:window.__loop ? "bk:play" : "bk:pause"}}); draw!(ctx, 800, 450); };
  render(); expect(completions).toBe(0);
  window.__loop = true; render(); render(); expect(completions).toBe(1);
  onReset!(); render(); render(); expect(completions).toBe(2);
  onStep!(); render(); render(); expect(completions).toBe(3);
});

test("2D world starter draws through host world setup", () => {
  let frames = 0;
  const ctx = new Proxy({}, { get: () => () => { frames++; } });
  const window = { bkWorld: { camera: { zoom: 2 } }, bkColor: () => "#000", bkSetupWorld: (fn: Function) => fn(ctx) };
  runInNewContext(readFileSync(resolve(base, "world.js"), "utf8"), { window });
  expect(frames).toBeGreaterThan(0);
});

test("custom 3D starter owns one loop and disposes resources", () => {
  const listeners: Record<string, Function> = {};
  const pending = new Map<number, Function>();
  let id = 0, disposed = 0, renders = 0;
  const disposable = class { dispose() { disposed++; } };
  const renderer = class extends disposable {
    setClearColor() {} setPixelRatio() {} setSize() {}
    render() { renders++; }
  };
  const window = {
    parent: {}, innerWidth: 800, innerHeight: 450, devicePixelRatio: 1,
    bkColor: () => "#000", addEventListener: (name: string, fn: Function) => { listeners[name] = fn; },
  };
  const THREE = {
    WebGLRenderer: renderer,
    Scene: class { add() {} },
    PerspectiveCamera: class { position = { set() {} }; updateProjectionMatrix() {} },
    BoxGeometry: disposable,
    MeshBasicMaterial: class extends disposable { color = { set() {} }; },
    Mesh: class { rotation = { y: 0 }; },
  };
  runInNewContext(readFileSync(resolve(base, "world3d.js"), "utf8"), {
    window, document: { getElementById: () => ({}) }, THREE,
    performance: { now: () => 0 },
    requestAnimationFrame: (fn: Function) => { pending.set(++id, fn); return id; },
    cancelAnimationFrame: (key: number) => pending.delete(key),
  });
  const message = (type: string) => listeners.message({ source: window.parent, data: { type } });
  expect(pending.size).toBe(1);
  message("bk:play"); expect(pending.size).toBe(1);
  message("bk:pause"); expect(pending.size).toBe(0);
  listeners["bk:theme-changed"](); expect(renders).toBeGreaterThan(1);
  message("bk:play"); expect(pending.size).toBe(1);
  listeners.pagehide(); expect(pending.size).toBe(0); expect(disposed).toBe(3);
});
