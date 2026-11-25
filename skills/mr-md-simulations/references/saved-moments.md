# Saved moments and exact restoration

Opt in only when revisiting or comparing a state helps the lesson. A built-in
lab needs declared telemetry, timeline configuration, and exact snapshot
handlers for restorable saved states. The authoring key is still `timeline`
and the inspector is labeled Saved. The host puts Save moment beside playback.

```json
{
  "type": "block",
  "timeline": true,
  "telemetry": {
    "time": {
      "label": "Elapsed time",
      "unit": "s",
      "saveStates": [
        {
          "id": "five-seconds",
          "name": "At five seconds",
          "when": { "op": "gte", "value": 5 }
        }
      ]
    }
  }
}
```

Use `timeline: false` to disable the feature, or an object with `start: false`
to skip the initial card or `capture: false` to hide manual saving. The latter
still permits automatic saves. `measurements.timeline` is equivalent and takes
precedence when both are supplied. The schema also accepts `present` and
`controls` options from the timeline contract. Check the client before relying
on them for Saved UI behavior.

Telemetry `saveStates` rules use `id`, `name`, and `when`, with optional
`once` and `cooldown` in seconds. A rule saves once per Live run by default.
With `once: false`, later false-to-true crossings can save again. An already
matching value can trigger an automatic save once capture is available. A
notification rule and a saved-state rule have separate purposes.

## Register model state

Register after initializing the state, because registration attempts to capture
the initial snapshot. Both functions must run synchronously. Use plain,
cloneable data. Capture everything needed to draw and continue the same model,
such as positions, velocities, time, solver accumulators, persistent visual
state, and the seeded random generator state where applicable. Restore from a
copy. Recompute derived quantities from restored state and props. Clear
transient pointer capture and keyboard flags tied to the original input.

```js
const sim = window.defineSimulation({ props: { speed: 1 } });
let position = 0;
let time = 0;

sim.onReset(() => {
  position = 0;
  time = 0;
});

window.bkRegisterSnapshot({
  capture: () => ({ position, time }),
  restore: (state) => {
    position = state.position;
    time = state.time;
  },
});

window.bkSetup((ctx, width, height, frame) => {
  const dt = sim.deltaTime();
  time += dt;
  position = (position + sim.props.speed * dt) % 4;

  ctx.fillStyle = window.bkColor("bg");
  ctx.fillRect(frame.originX, frame.originY, frame.viewportWidth, frame.viewportHeight);
  ctx.fillStyle = window.bkColor("accent");
  const screenX = width * (0.1 + 0.8 * position / 4);
  ctx.fillRect(screenX, height / 2 - 10, 20, 20);

  if (!window.__bkRestoring) sim.publishTelemetry({ time });
});
```

The host restores props before calling `restore(state, props, snapshotTime)`.
The runtime sets `window.__bkRestoring` through the restore redraw. Keep that
draw free of telemetry, new samples, completion events, and other model side
effects. `sim.deltaTime()` already returns zero during restore. Custom loops
must also honor pause, restore, and zero elapsed time on resume.

## Preserve Live and saved history

A saved card holds exact state, settings, an independent measurement history,
and a scene image when available. Canvas and SVG frames can produce downloadable
PNGs. Image capture can fail independently of state capture. Saves leave
playback running and persist locally in IndexedDB across resets and page
reloads. Cards support rename, delete with Undo, and image download.

Opening a card pauses at the saved state. Live restores the working run and
its prior playback state. Playing from a saved card replaces Live with a copy
of that state and history. A direct scene edit or setting change can continue
the saved state while keeping automatic motion paused. The saved copy remains
available. Reset clears the Live run; it preserves saved cards and viewing
preferences. Older saves may have exact state without graph history.
When changing a model's saved payload, account for older records that may
still be available to learners.

Verify initial capture, manual and automatic saves, exact time and prop
restoration, paused edits, returning to both paused and running Live, continued
graph history, and reset and reload persistence. Check that saved histories
retain annotations. For runtime changes, inspect `src/renderer/blocks/snapshot-runtime.ts`,
`src/client/telemetry.ts`, `src/client/measurement-timeline.ts`, and
`src/client/saved-experiments-store.ts`. Use the bundled oscillator and
`playground/measurements-lab/` as examples.
