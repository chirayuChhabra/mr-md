# Measurements, graphs, and scene guides

Use the sibling config for measurement semantics and the iframe for
computation. The built-in block and steps inspectors render Settings and
Measurements where applicable. Measurements has Stats and Graphs views.
The world portal has no standard lab inspector. Check a replacement renderer's
output before assuming it supplies any of these views.

## Declare and publish

```json
{
  "type": "block",
  "telemetry": {
    "time": { "label": "Time", "unit": "s" },
    "displacement": {
      "label": "Displacement (x)",
      "unit": "m",
      "precision": 3,
      "graph": true,
      "scene": "equilibrium-guide"
    },
    "velocity": {
      "label": "Velocity (v)",
      "unit": "m/s",
      "precision": 3,
      "graph": {
        "x": { "key": "displacement" },
        "y": { "label": "Velocity", "unit": "m/s" }
      }
    }
  },
  "measurements": {
    "initialTab": "graphs",
    "visible": ["displacement"],
    "graphs": [{ "key": "displacement", "width": 420, "height": 280 }]
  }
}
```

Publish the values together via `sim.publishTelemetry({ time, displacement,
velocity })` or `window.bkTelemetry({...})`. Send native typed values and let the
host format them. Use `null` for a quantity that is unavailable. Include numeric
`time` in seconds for a reproducible clock that freezes when paused and resets
or restores with the model. The host uses elapsed time when no explicit clock
is published. Avoid appending model-owned history on passive redraws. Publish
a changed paused value at the same simulation time for a direct edit.

`label`, `unit`, `precision`, `group`, `description`, and
`display: "metric" | "status" | "row"` configure the stat.
`changeThreshold` sets the minimum numeric change for the Measurements unread
count. Keep plotted values finite and publish both custom axes in the same
sample. `graph: true` plots the measurement against time. An object can set the
plot label and axis labels/units. `graph.x.key` selects a declared telemetry
key. The current measurement is always Y. The learner can also create X/Y
plots from numeric measurements without an authored plot. The host owns
sampling, floating windows, and the separate browser tab for comparing plots.

`measurements.visible` lists telemetry keys and `measurements.graphs` lists
graph-enabled keys with optional `x`, `y`, `width`, `height`, and `minimized`.
Valid `initialTab` values are `controls`, `telemetry`, `graphs`, and `timeline`
for Settings, Measurements Stats, Measurements Graphs, and Saved,
respectively. Pick a view the lab exposes. Session preferences can override
these startup settings. Reset clears Live samples and rule state while keeping
the active view, graph windows, and guide selections.

## Draw selected guides and label edits

A telemetry item's `scene` names a guide drawn by the simulation. The host
sends the complete selection after a toggle, reset, or iframe reload. Read
`item.scene` for drawing and use the telemetry key in `measurements.visible`.

```js
let visibleGuides = new Set();
window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  if (event.data?.type !== "bk:measurement-visibility") return;
  if (!Array.isArray(event.data.measurements)) return;
  visibleGuides = new Set(event.data.measurements.map((item) => item.scene));
});
```

The host annotates direct pointer and keyboard edits as well as settings,
presets, and actions. Add `data-bk-interaction-label` to a scene element to name
a pointer gesture. For edits outside the automatic tracking, call
`window.bkBeginInteraction?.(label)` and invoke its returned cleanup when the
edit ends, including cancellation. Time plots mark the interval. X/Y plots
mark the affected samples, including edits made while paused. Saved histories
retain the labels.

## Configure conditions and notifications

Use `states: [{ "when": { "op": "gt", "value": 0 }, "tone": "accent",
"label": "Moving right" }]` on the relevant telemetry item. The first match
sets the tone and optional label. Ordered comparisons (`gt`, `gte`, `lt`,
`lte`) use finite numbers. `eq` and `neq` compare typed values strictly.
Available tones are `neutral`, `accent`, `success`, `warning`, and `danger`.

A `notifications` rule has an `id`, `when`, and `message`, plus optional
`tone`, `toast`, `once`, and `cooldown`. The first measurement seeds the
rule. A later false-to-true crossing fires once per run by default. Set
`once: false` for repeated crossings and use `cooldown` in seconds. Set
`toast: false` for an event without a toast. The host applies
`measurements.notifications` options `enabled`, `minInterval`, `duration`,
and `maxVisible` to toasts. Choose a meaningful milestone over a noisy threshold.
Use [saved moments](saved-moments.md) when a condition should save a restorable
state.

For an explicit new trial triggered inside the model, send
`window.parent.postMessage({ type: "bk:telemetry-reset" }, "*")` before
publishing new samples. The host checks the sender against the registered iframe.

## Check the result

Use the oscillator under `mr-markdown-documentation/sims/` for displacement,
velocity, and energy plots and `playground/measurements-lab/` for a spring with
guide toggles, startup windows, and notifications. Read each script and config
together. In the repository, inspect `src/simulation-config.ts`,
`src/renderer/markdown/telemetry.ts`, `src/client/telemetry.ts`, and
`src/client/measurement-graphs.ts`.

Verify units and axes, empty and null values, guide toggles during pause,
authored and learner-created plots, repeated edits at the same time, and
reset behavior. Open, move, minimize, and close a graph. Check the separate
tab if the task affects that path.
