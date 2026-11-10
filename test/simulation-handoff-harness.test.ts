import { expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { defineSimulation } from '../src/simulation';

test('runtime queries, repeated playback, step handoffs and foreign messages preserve lifecycle', () => {
 const sent: any[] = [];
 const scope = Object.assign(new EventTarget(), {
  __simProps: { mass: 1 }, __loop: false,
  parent: { postMessage: (message: any) => sent.push(message) },
 });
 const create = runInNewContext(`(${defineSimulation.toString()})`, { window: scope, structuredClone, CustomEvent, performance });
 const sim = create({ props: { mass: 1 } });
 let resets = 0;
 sim.onReset(() => resets++);
 const send = (data: any, source: any = scope.parent) => {
  const event = new Event('message');
  Object.assign(event, { data, source }); scope.dispatchEvent(event);
 };
 send({ type: 'bk:runtime-query' });
 expect(sent.at(-1)).toEqual({ type: 'bk:runtime-ready', reset: true });
 for (let cycle = 0; cycle < 30; cycle++) {
  send({ type: 'bk:play' }); scope.__loop = true;
  expect(sim.deltaTime(1000)).toBe(0);
  expect(sim.deltaTime(1016)).toBeCloseTo(0.016);
  send({ type: 'bk:pause' }); scope.__loop = false;
  expect(sim.deltaTime(9000)).toBe(0);
  send({ type: 'bk:reset' }, {});
  expect(resets).toBe(cycle);
  send({ type: 'bk:reset', props: { mass: 2 }, playing: false });
  expect(resets).toBe(cycle + 1);
  expect(sim.props.mass).toBe(2);
  send({ type: 'bk:snapshot-restore', resumePlayback: true }); scope.__loop = true;
  expect(sim.isPlaying).toBe(true);
  expect(sim.deltaTime(10000)).toBe(0);
  expect(sim.deltaTime(10016)).toBeCloseTo(0.016);
  send({ type: 'bk:snapshot-restore' }); scope.__loop = false;
  expect(sim.isPlaying).toBe(false);
  send({ type: 'bk:steps-set-step' });
  expect(sim.isPlaying).toBe(false);
  send({ type: 'bk:sim-play-state', playing: true }); scope.__loop = true;
  expect(sim.deltaTime(20000)).toBe(0);
 }
 sim.dispose();
 send({ type: 'bk:runtime-query' });
 expect(sent.at(-1)).toEqual({ type: 'bk:runtime-ready', reset: false });
});
