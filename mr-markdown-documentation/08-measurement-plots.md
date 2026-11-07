---
index: 8
title: Measurement Plots
slug: measurement-plots
description: Configure responsive telemetry plots, streaming traces, and vector fields in simulation workspaces.
author: Mr-Md Team
tags: [telemetry, measurements, plots, graphs, visualization, simulations]
---

# Measurement Plots

The mr-md measurement framework provides built-in, accessible telemetry plotting inside the expanded simulation workspace inspector. Authors configure plots declaratively in the simulation's sibling `.config.json` without adding third-party charting libraries, canvas overlays, or complex layout code.

Try the framework in the oscillator. Open Measurements, then use the arrow buttons or swipe to switch between displacement, velocity, and phase-space plots.

![Damped Harmonic Oscillator](./sims/oscillator.js)

Colors describe the sign of displacement in this example; they do not indicate a correct or incorrect result.

```json
{
  "measurements": {
    "badge": "count",
    "plots": [
      {
        "id": "kinematics",
        "title": "Kinematics over Time",
        "type": "line",
        "x": "time",
        "series": [
          { "y": "displacement", "label": "Displacement x (m)" },
          { "y": "velocity", "label": "Velocity v (m/s)" }
        ],
        "xLabel": "Time t (s)",
        "yLabel": "Kinematic Values",
        "maxPoints": 300
      },
      {
        "id": "phase-portrait",
        "title": "Phase Space (x vs v)",
        "type": "scatter",
        "x": "displacement",
        "y": "velocity",
        "xLabel": "Displacement x (m)",
        "yLabel": "Velocity v (m/s)",
        "xMin": -1.3,
        "xMax": 1.3,
        "yMin": -5,
        "yMax": 5
      }
    ]
  }
}
```

---

## Configuration Contract

Declare measurement plots under the top-level `measurements` key in your simulation's sibling `.config.json`.

### Top-Level `measurements` Object

| Field | Type | Description |
| --- | --- | --- |
| `badge` | `'off' \| 'dot' \| 'count'` | Display badge indicator style on the inspector's Measurements tab. Defaults to `'off'`. |
| `plots` | `MeasurementPlot[]` | Ordered list of plot cards displayed in the measurement carousel. |

### `MeasurementPlot` Object

| Property | Type | Description |
| --- | --- | --- |
| `id` | `string` | **Required.** Unique identifier for the plot card. |
| `title` | `string` | Optional header title displayed above the graph. Defaults to `id`. |
| `type` | `'line' \| 'scatter' \| 'bar' \| 'vector-field'` | Visualization renderer type. |
| `x` | `string` | Telemetry key providing scalar x-coordinates for streaming plots. When omitted, an auto-incrementing sample counter is used. |
| `y` | `string` | Telemetry key providing scalar y-coordinates for a single-trace streaming plot. |
| `series` | `Array<{ y: string, label?: string }>` | Multiple y series bindings sharing the same x-axis. Automatically renders a color-coded legend. |
| `data` | `string` | Telemetry key providing a full dataset array (for batch updates or vector fields). |
| `xLabel` | `string` | Human-readable label and units for the horizontal axis (e.g., `Time t (s)`). |
| `yLabel` | `string` | Human-readable label and units for the vertical axis (e.g., `Velocity v (m/s)`). |
| `xMin` | `number` | Explicit minimum horizontal axis limit. |
| `xMax` | `number` | Explicit maximum horizontal axis limit. |
| `yMin` | `number` | Explicit minimum vertical axis limit. |
| `yMax` | `number` | Explicit maximum vertical axis limit. |
| `maxPoints` | `number` | Maximum history or dataset buffer length. Defaults to `300`; clamped between `2` and `1000`. |
| `sampleMs` | `number` | Optional throttle duration in milliseconds between recorded samples. |

---

## Data Binding Models

The framework supports two complementary data binding mechanisms:

### 1. Streaming Scalar Binding

Use streaming scalar binding when your simulation continuously outputs real-time physical variables via `window.bkTelemetry(...)`.

```javascript
// Inside simulation animation loop:
window.bkTelemetry({
  time: state.time,
  displacement: state.x,
  velocity: state.v
});
```

- **Single trace:** Configure `x` and `y`.
- **Multiple traces:** Configure `x` and an array of `series`. Each series generates a distinct SVG path styled with `.bk-measurement-series-0`, `.bk-measurement-series-1`, etc.
- **Omitted x:** If `x` is omitted, the runtime tracks sample index (`0, 1, 2, ...`).

#### Safe Missing Point and Gap Handling

When `window.bkTelemetry` publishes non-finite values (`null`, `undefined`, `NaN`, `Infinity`), the plotting engine **never fabricates zeros**. For line charts, it breaks the SVG path into disjoint segments (`M ... L ...`) so missing intervals appear honestly as gaps rather than false dives to zero.

### 2. Dataset Binding

Use dataset binding for distributions, histograms, mode energies, or directional vector fields where the simulation publishes an array of points at once.

```javascript
// Publishing a mode energy spectrum (bar chart):
window.bkTelemetry({
  modes: [
    { x: 1, y: 12.4 },
    { x: 2, y: 8.1 },
    { x: 3, y: 3.2 }
  ]
});

// Publishing a flow field (vector field):
window.bkTelemetry({
  flowField: [
    { x: 0.5, y: 0.5, u: 1.0, v: 0.2 },
    { x: 1.0, y: 0.5, u: 0.8, v: 0.5 }
  ]
});
```

#### Dataset Point Shapes

| Plot Type | Required Fields | Optional Fields | Description |
| --- | --- | --- | --- |
| `line` / `scatter` | `x: number`, `y: number` | — | Ordered point coordinates. |
| `bar` | `x: number`, `y: number` | — | Bar center `x` and height `y` anchored at 0. |
| `vector-field` | `x: number`, `y: number` | `u: number`, `v: number` | Position `(x, y)` and directional vector components `(u, v)`. |

---

## Security and Expression Limits

To preserve safety and deterministic execution:

- **No executable expressions:** Configurations do **not** accept JavaScript expressions, anonymous functions, mathematical strings (`"x * 2"`), or template interpolation.
- **Safe scalar binding:** Keys match exact properties on the telemetry object.
- **Strict sanitization:** All text labels and unit strings are rendered via `textContent` or escaped attributes, preventing cross-site scripting (XSS).
- **Hard bounded memory:** The history buffer is strictly capped at `1000` points regardless of configuration values.

---

## Carousel and Interaction

When multiple plots are declared, mr-md presents them in a carousel:

- **Focused density:** Exactly one graph is visible at a time to prevent cognitive overload.
- **Keyboard navigation:** Focus the carousel and navigate with `ArrowLeft`, `ArrowRight`, `Home`, and `End`.
- **Touch swipe with scroll preservation:** Horizontal swipes navigate between plots, but touch movements with dominant vertical delta pass through untouched so the learner can scroll the page naturally.
- **Reduced motion:** When the operating system prefers reduced motion, transitions switch instantly without animation.
- **Screen readers:** Navigation buttons feature descriptive `aria-label` attributes and the position counter uses `aria-live="polite"` (updated only on slide changes, never on animation frames).

---

## Extending the runtime

The runtime exports an internal `registerMeasurementPlotRenderer(type, renderer)` hook in `src/client/measurement-plots.ts`. Framework developers can register SVG renderers in the host client bundle. This source module is not a public package import or an iframe API. The JSON schema currently supports the four built-in plot types; adding a new type requires extending that schema and the host bundle together.

Vector-field arrows show direction with capped display lengths, not an absolute physical magnitude scale.

## Readout colors and notifications

Rules on individual `telemetry` entries control color, status text, and notifications. Numeric `min` is inclusive and `max` is exclusive; the first matching rule wins. Use `equals` for a string, number, or boolean status. `tone` can be `neutral`, `success`, `warning`, or `danger`.

```json
{
  "telemetry": {
    "temperature": {
      "label": "Temperature",
      "unit": "°C",
      "notify": "range-change",
      "ranges": [
        { "max": 60, "tone": "success", "label": "Within target" },
        { "min": 60, "max": 80, "tone": "warning", "label": "Warm" },
        { "min": 80, "tone": "danger", "label": "Above target" }
      ]
    }
  },
  "measurements": { "badge": "count" }
}
```

`notify: "change"` tracks value changes; `"range-change"` tracks transitions between rules. Notifications default to `"off"`. The badge counts distinct unseen measurements, clears when Measurements opens, and ignores the initial frame. Use `badge: "dot"` for an indicator without a count.
