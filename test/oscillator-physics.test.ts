import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function model() {
  const events: Record<string, Function> = {};
  const window: any = {
    __simProps: {},
    defineSimulation: () => ({ onPlaybackChange() {}, onPropsChange() {}, onReset() {} }),
    addEventListener: (name: string, fn: Function) => events[name] = fn,
    bkRegisterSnapshot() {}, bkSetup() {},
  };
  const source = readFileSync('mr-markdown-documentation/sims/oscillator.js', 'utf8');
  runInNewContext(source.replace('window.bkSetup(LOGICAL_WIDTH', 'window.model = { state, updatePhysics }; window.bkSetup(LOGICAL_WIDTH'), { window });
  return { ...window.model, action: (action: string) => events['bk:action']({ detail: { action } }) };
}

test('maximum viscous and quadratic damping dissipate energy at minimum mass', () => {
  for (const dampingMode of ['viscous', 'quadratic']) {
    const { state, updatePhysics } = model();
    Object.assign(state, { mass: 0.5, stiffness: 60, damping: 25, medium: 'glycerin', dampingMode });
    let energy = 0.5 * state.stiffness * state.x ** 2;
    for (let i = 0; i < 200; i++) {
      updatePhysics(0.05);
      const next = 0.5 * (state.stiffness * state.x ** 2 + state.mass * state.v ** 2);
      expect(Number.isFinite(next)).toBe(true);
      expect(next).toBeLessThanOrEqual(energy + 1e-10);
      energy = next;
    }
  }
});

test('vacuum conserves energy and matches the analytical spring solution', () => {
  const { state, updatePhysics } = model();
  state.medium = 'vacuum';
  for (let i = 0; i < 200; i++) updatePhysics(0.05);
  expect(state.x).toBeCloseTo(0.75 * Math.cos(50), 8);
  expect(state.v).toBeCloseTo(-3.75 * Math.sin(50), 8);
});

test('dry friction sticks without chatter and zero damping allows free motion', () => {
  const { state, updatePhysics } = model();
  Object.assign(state, { dampingMode: 'friction', damping: 25, x: 0.01, v: 0 });
  updatePhysics(0.05);
  expect(state.x).toBe(0.01);
  expect(state.v).toBe(0);
  state.damping = 0;
  updatePhysics(0.05);
  expect(state.v).toBeLessThan(0);
});

test('equal impulses produce equal changes in momentum', () => {
  const light = model(), heavy = model();
  light.state.mass = 0.5;
  heavy.state.mass = 5;
  light.action('impulse'); heavy.action('impulse');
  expect(light.state.v * light.state.mass).toBeCloseTo(heavy.state.v * heavy.state.mass, 10);
});
