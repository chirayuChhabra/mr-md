---
index: 6
title: Creating Simulations
slug: creating-simulations
description: Build inline, guided, and immersive simulations for your lessons.
author: Mr-Md Team
tags: [canvas, simulations, graphics, theme-aware]
---

# Creating Simulations

Try a simulation: drag the start and end points, or draw walls on the grid.

![Pathfinder Simulation](./sims/pathfinder.js)

A simulation is a JavaScript or TypeScript file embedded in a lesson with Markdown.

Choose the format that fits the lesson:

| Format | Use it for | Configuration |
| --- | --- | --- |
| Block | A still preview opening a dedicated experiment | `"type": "block"` (default) |
| Steps | A sequence of goals with instructions and feedback | `"type": "steps"` |
| World | An explorable scene entered through a portal | `"type": "world"` |

## File and configuration layout

Store simulation scripts and optional companion configurations relative to your lesson Markdown:

```text
lesson-directory/
├── lesson.md                  # Lesson containing Markdown embeds
└── sims/
    ├── oscillator.js          # Simulation source (JavaScript or TypeScript)
    └── oscillator.config.json # Sibling configuration ($schema, props, tunables, telemetry)
```

Embed the simulation with Markdown image syntax:

```markdown
![Damped Harmonic Oscillator](./sims/oscillator.js)
```

The host automatically pairs `oscillator.js` with `oscillator.config.json` by matching the file basename in the same directory.

## Block simulations

To create a block simulation, define a script next to your lesson. `bkSetup` configures the canvas and executes your drawing callback on each animation frame:

```javascript
// mysim.js
window.bkSetup(800, 450, (ctx, width, height) => {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = window.bkColor("accent");
  ctx.fillRect(40, 40, 80, 80);
});
```

### Playback, reset, and authoring lifecycle

Block simulations open as modal workspaces. The host supplies **Pause / Resume**
and **Reset**. Closing pauses the model and restores the lesson position and focus;
reopening preserves control values and an explicit pause. Background lesson
controls stay unavailable while the workspace is open. Escape also works from
inside the simulation iframe.

Reset restores authored props, clears measurements, and resets the model. Older
scripts continue working: the host reloads their iframe to reset private state.
For new scripts, register a reset hook to avoid reloading:

```javascript
const sim = window.defineSimulation({ props: { speed: 2 } });
let distance = 0;

sim.onPropsChange((props) => {
  // Recompute derived quantities here when parameters change.
});
sim.onReset(() => { distance = 0; });

window.bkSetup(800, 450, (ctx, width, height) => {
  distance += sim.props.speed * sim.deltaTime();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = window.bkColor("text");
  ctx.fillText(`Distance: ${distance.toFixed(2)}`, 80, 100);
});
```

`sim.deltaTime()` returns seconds, zero while paused, and caps long delays at
0.1 seconds. Call it once per draw and pass that value to model updates. A draw
can occur while paused to refresh a changed control, theme, or viewport; drawing
must not itself advance the model or append history. Reset all evolving state,
including elapsed time, traces, drag state, and completion guards.

For TypeScript simulations, `import { defineSimulation } from "mr-md/simulation"`
provides the same API with inferred prop types. `sim.props` is a readonly snapshot.
`onPropsChange`, `onReset`, and `onPlaybackChange` return unsubscribe functions;
`dispose()` removes runtime subscriptions. Existing `__simProps`, `bk:props`,
`bk:action`, and `bkTelemetry` remain supported.

### Validate configuration in your editor

The package includes a JSON Schema at `mr-md/simulation.schema.json`. In a project
with mr-md installed locally, add this field to a sibling config:

```json
{ "$schema": "../node_modules/mr-md/dist/simulation.schema.json" }
```

Adjust the relative path for the config location. The schema supplies editor
completion; builds also check cross-field constraints and report the config file
and field. Every tunable needs a matching prop default with the correct type,
numeric defaults must fit their bounds, choice defaults must match an option,
and `advancedControls` must name existing tunables. Presets and step defaults
are checked against their controls too. Invalid JSON is a build error.

### Add controls

Place `mysim.config.json` beside `mysim.js`. Properties supply initial values; tunables describe the controls displayed to the reader.

```json
{
  "type": "block",
  "props": { "speed": 2, "showGrid": true },
  "tunables": {
    "speed": { "label": "Speed", "min": 0, "max": 10, "step": 1 },
    "showGrid": { "label": "Show grid", "type": "boolean" }
  }
}
```

Read `window.__simProps` while drawing or updating your model. Values change as the reader uses the controls:

```javascript
window.bkSetup(800, 450, (ctx, width, height) => {
  const { speed, showGrid } = window.__simProps;
  // Update and draw using speed and showGrid.
});
```

### Expanded controls, presets, and actions

Simulations can offer rich, expressive host controls beyond basic sliders and toggles. mr-md supports:

- **Segmented choices** (`"type": "segmented"`): inline button group for mutually exclusive options (`options: [{ label, value }]`).
- **Dropdown menus** (`"type": "select"`): compact picker for selecting among larger option sets (`options: [{ label, value }]`).
- **Engineering units** (`unit?: string`): suffix units displayed on numeric controls (`range` and `number`), such as `unit: "N/m"`, `"kg"`, or `"N·s/m"`.
- **Organizing controls with `advancedControls`**: secondary tunables are tucked into a native `<details>`/`<summary>` "More controls" disclosure, closed initially. Author them cleanly with top-level `advancedControls?: string[]`:
  - **Preferred collective syntax**: `advancedControls: ["medium", "stiffness", "mass"]` lists keys that belong under "More controls".
  - **All unlisted controls remain primary by default**: keep controls central to prediction and manipulation in the primary visible row.
  - **Exact precedence**: `control.advanced ?? advancedControls.includes(key)`. An explicit per-control `advanced: false` overrides the list to keep a control visible, while `advanced: true` works standalone for single-control compatibility.
  - **Learning-goal selection guidance**: choose visible controls deliberately based on what teaches the core concept. Do not automatically hide controls merely by count or type, or infer importance from variable names. Setup parameters, secondary environment variations, and auxiliary visual overlays belong under secondary controls.
  - **Preserved state while closed**: controls inside the closed disclosure are part of the DOM; they initialize on page load, update synchronously when presets change, and preserve their values in `window.__simProps`.
- **Top-level presets** (`presets?: Record<string, { label: string, props: Record<string, ...> }>`): rendered as a labeled native dropdown (`<select>`) with an initial neutral "Choose preset" option. Choosing a preset atomically batch-updates all defined properties (including advanced controls) via `bk:props`. Manual adjustments to any control clear the preset selection.
- **Top-level actions** (`actions?: Record<string, { label: string }>`): restrained outlined push-buttons displayed inline with primary controls for discrete or repeatable events (e.g. impulse kick, reset) that dispatch `bk:action` window events to the sandbox.

Here is a complete, coherent experiment demonstrating these capabilities in a damped harmonic oscillator:

![Damped Harmonic Oscillator](./sims/oscillator.js)

#### Control contract example

A companion `.config.json` defines presets, actions, and typed tunables using collective `advancedControls`:

```json
{
  "type": "block",
  "props": {
    "damping": 1.5,
    "dampingMode": "viscous",
    "medium": "air",
    "stiffness": 25,
    "mass": 1.0,
    "showTrace": true,
    "showPhase": true
  },
  "advancedControls": [
    "dampingMode",
    "medium",
    "stiffness",
    "mass",
    "showTrace",
    "showPhase"
  ],
  "tunables": {
    "damping": {
      "label": "Damping (c)",
      "type": "range",
      "min": 0,
      "max": 25,
      "step": 0.5,
      "unit": "N·s/m"
    },
    "dampingMode": {
      "label": "Damping model",
      "type": "segmented",
      "options": [
        { "label": "Viscous", "value": "viscous" },
        { "label": "Quadratic Drag", "value": "quadratic" },
        { "label": "Dry Friction", "value": "friction" }
      ]
    },
    "medium": {
      "label": "Medium",
      "type": "select",
      "options": [
        { "label": "Vacuum (0.0×, c = 0)", "value": "vacuum" },
        { "label": "Air (1.0× drag)", "value": "air" },
        { "label": "Water / Light Oil (2.5×)", "value": "water" },
        { "label": "Viscous Glycerin (5.0×)", "value": "glycerin" }
      ]
    },
    "stiffness": {
      "label": "Spring Stiffness (k)",
      "type": "range",
      "min": 5,
      "max": 60,
      "step": 1,
      "unit": "N/m"
    },
    "mass": {
      "label": "Cart Mass (m)",
      "type": "number",
      "min": 0.5,
      "max": 5.0,
      "step": 0.5,
      "unit": "kg"
    },
    "showTrace": {
      "label": "Displacement Graph x(t)",
      "type": "boolean"
    },
    "showPhase": {
      "label": "Phase Space (x vs v)",
      "type": "boolean"
    }
  },
  "actions": {
    "impulse": { "label": "Apply Impulse (+Δv)" },
    "zero": { "label": "Reset to Rest" }
  },
  "presets": {
    "underdamped": {
      "label": "Underdamped",
      "props": { "dampingMode": "viscous", "medium": "air", "stiffness": 25, "damping": 1.5, "mass": 1.0 }
    },
    "critical": {
      "label": "Critical Damping",
      "props": { "dampingMode": "viscous", "medium": "water", "stiffness": 25, "damping": 4.0, "mass": 1.0 }
    },
    "overdamped": {
      "label": "Overdamped",
      "props": { "dampingMode": "viscous", "medium": "glycerin", "stiffness": 25, "damping": 5.0, "mass": 1.0 }
    }
  }
}
```

#### Responding to actions in simulation code

In your simulation script, listen for the `bk:action` event to execute discrete or repeatable actions:

```javascript
window.addEventListener("bk:action", (event) => {
  if (event.detail.action === "impulse") {
    // Deliver velocity kick to mass
    state.velocity += 2.0;
  } else if (event.detail.action === "zero") {
    state.x = 0;
    state.velocity = 0;
  }
});
```

Action buttons accept an optional `color`: `accent` (default), `neutral`, `red`, `green`, or `amber`. For example: `"impulse": { "label": "Apply impulse", "color": "green" }`. Use color to reinforce the action's meaning while keeping the label explicit.

When a user selects a preset, the host updates the active controls and dispatches `bk:props` with all bundled values, identical to standard tunable updates.
### Add live telemetry

To display live scientific calculations (such as velocity, energy, or orbital period) without cluttering the canvas, declare a `telemetry` schema in your config and call `window.bkTelemetry`:

```json
{
  "telemetry": {
    "status": { "label": "Status", "group": "State" },
    "speed": { "label": "Velocity (v)", "unit": "km/s", "precision": 2, "group": "Dynamics" }
  }
}
```

In your simulation script, publish updates whenever state changes:

```javascript
window.bkTelemetry({
  status: "In Orbit",
  speed: 29.78
});
```

Regular block simulations appear inline as still previews without controls. Click **Click to expand** (or focus it and press Enter or Space) to open the simulation and start interacting. Closing pauses the preview and preserves its control values.

Expanding a simulation opens a full-window host workspace with the scene on the left and an inspector on the right. Controls and Measurements have separate tabs when both are present. Exiting via the header's "Back to lesson" button or Escape restores the normal inline document view, prior scroll position, and focus.

## Steps simulations

In addition to open sandboxes, `mr-md` supports **Step-by-Step Simulations**. Use steps when a learner should work through a sequence of goals. Each step can provide instructions, a hint, feedback, and optional narration:

![Orbital Slingshot Maneuver](./sims/orbital-slingshot.js)

### How steps differ from blocks

Both blocks and steps appear as still previews with a **Click to expand** button.
Controls appear only in the expanded workspace. Both use the same pause and reset
button styles in the inspector, with no simulation switcher above the scene.
Steps also provide instructions, hints, progress, and optional narration. Closing
pauses the trial and narration without erasing completed steps.

Trial reset restores the current step, rather than restarting the whole activity.
Step entry, revisiting, and trial reset apply top-level props plus that step's
`initialProps`; values changed in a previous trial do not leak into the new one.
Declare common defaults at the top level and step-specific differences in
`initialProps`. Measurements clear when a new trial starts.

Use `bkOnStep` to initialize the model on step entry. Use either `bkOnReset` or
`sim.onReset` for trial reset, with one model-reset function shared by both paths.
Keep `bkCompleteStep` for success reporting and clear the model's completion
guard on every entry/reset. Use `sim.deltaTime()` or guard updates with `__loop`
so paused redraws cannot move the model or complete a goal.

### Creating a Step-by-Step Simulation

Add `"type": "steps"` and a `steps` array to the companion configuration:

```json
{
  "type": "steps",
  "label": "Orbital Slingshot Maneuver",
  "caption": "Explore orbital mechanics, Jupiter gravity assists, and Martian atmospheric aerobraking.",
  "accent": "blue",
  "steps": [
    {
      "id": "step-1-insertion",
      "title": "Step 1: Orbital Insertion",
      "target": "Target: Station Alpha",
      "instruction": "Drag the blue velocity arrow $\\vec{v}_0$ from Earth so gravity curves the flight path into **Station Alpha**.",
      "voice": "Drag the blue velocity arrow from Earth so gravity curves the flight path directly into Station Alpha.",
      "feedback": "Orbital insertion achieved! Earth's gravity curved the trajectory into an elliptical transfer arc.",
      "hint": "Try pulling the velocity vector slightly below the line of sight so gravity pulls it up into orbit."
    },
    {
      "id": "step-2-slingshot",
      "title": "Step 2: Jupiter Gravity Assist",
      "target": "Target: Deep Space Outpost",
      "instruction": "Aim the probe below **Jupiter** to execute a hyperbolic slingshot into **Outpost Gamma**.",
      "voice": "Aim the probe below Jupiter to execute a gravity assist slingshot into Deep Space Outpost Gamma.",
      "feedback": "Slingshot confirmed! The probe gained orbital momentum to achieve deep space escape velocity."
    }
  ]
}
```

### Step configuration

| Field | Purpose |
| --- | --- |
| `id` | Unique step identifier. |
| `title` | Step headline. |
| `target` | Goal shown in the target badge; supports Markdown. |
| `instruction` | Directions for the learner; supports Markdown and LaTeX. |
| `hint` | Optional hint revealed on request; supports Markdown. |
| `feedback` | Message shown on completion; supports Markdown. |
| `initialProps` | Properties applied when the step starts. |
| `audio` | Optional path or URL to recorded narration. Local files are bundled. |
| `voice` | Optional text for browser speech synthesis. |

### Programmatic Builder API

If building lessons with the TypeScript/JavaScript builder API, you can define step-by-step simulations directly:

```typescript
lesson.steps("sims/orbital-slingshot.js", {
  label: "Orbital Slingshot Maneuver",
  steps: [
    {
      title: "Step 1: Orbital Insertion",
      target: "Target: Station Alpha",
      instruction: "Reach orbital velocity to rendezvous with Station Alpha.",
      feedback: "Orbit achieved!",
    },
  ],
});
```

### Writing the Step Simulation Script

The author runtime provides lifecycle hooks inside the sandboxed iframe:

```javascript
// sims/orbital-insertion.js
const sim = window.defineSimulation({
  props: { velocity: 15, targetDistance: 320 }
});

let probeX = 60;
let reached = false;

function resetTrial() {
  probeX = 60;
  reached = false;
}

// 1. Initialize trial state when entering or switching steps
window.bkOnStep((stepIndex, stepData, props) => {
  resetTrial();
});

// 2. Reset trial when the user clicks Reset or presses R
sim.onReset(() => {
  resetTrial();
});

// 3. Render and physics loop
window.bkSetup(800, 450, (ctx, width, height) => {
  const dt = sim.deltaTime();
  const target = Number(sim.props.targetDistance);
  const v = Number(sim.props.velocity);

  // Physics advances only when playing (dt > 0)
  if (dt > 0 && !reached) {
    probeX += v * dt * 20;
    if (probeX >= target) {
      probeX = target;
      reached = true;
      window.bkCompleteStep("Orbital insertion confirmed!");
    }
  }

  // Draw scene
  ctx.fillStyle = window.bkColor("bg");
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = window.bkColor("line-strong");
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(target, 140);
  ctx.lineTo(target, 310);
  ctx.stroke();

  ctx.fillStyle = window.bkColor("accent");
  ctx.beginPath();
  ctx.arc(probeX, 225, 16, 0, Math.PI * 2);
  ctx.fill();

  // 4. Publish live measurements to the inspector
  sim.publishTelemetry({
    position: probeX.toFixed(1),
    status: reached ? "Insertion complete" : "En route"
  });
});
```

* **Keyboard Navigation**: Learners can use `←` / `→` arrow keys to change steps, `Space` to play/pause, and `R` to reset trials.
* **Clickable Dots**: Learners can click any progress dot to jump directly to that step.

---

## Immersive worlds

A world starts as a portal in the lesson and expands into an immersive view. Hold the portal to enter; use the close button, Escape, or browser Back to return to the lesson.

### Solar System Explorer

Hold the portal to explore the solar system. Drag to orbit, Shift-drag to pan,
and scroll to zoom. Select a body to explore it, or use the search panel on the
right (⌘K / Ctrl+K or `/`) to find one. The controls also let you show or hide
orbits and adjust sound.

> [!WARNING]
> The opening scene contains an intense bright flash and glare.

![Solar System Explorer](./sims/solarsystem.world.js)

### Create a world

Embed a simulation script:

```markdown
![Orbital world](./sims/orbit.js)
```

Add a sibling `orbit.config.json` with `"type": "world"` and a portal style:

```json
{
  "type": "world",
  "portal": "minimal",
  "label": "Orbital world"
}
```

The configuration selects the world experience; a `.world.js` filename alone
does not. Available portal styles are `minimal`, `wormhole`, and `pixel`.

For a 2D world, use `bkSetupWorld` instead of `bkSetup`. The callback receives the canvas context and world state, including the camera and live props:

```javascript
// orbit.js
window.bkSetupWorld((ctx, world) => {
  ctx.fillStyle = window.bkColor("bg");
  ctx.fillRect(-2000, -2000, 4000, 4000);
  ctx.fillStyle = window.bkColor("accent");
  ctx.beginPath();
  ctx.arc(0, 0, 40, 0, Math.PI * 2);
  ctx.fill();
});
```

The solar-system example uses Three.js and external resources; it requires a network connection for its configured library. For a smaller 2D example, explore the minimal portal:

![Orbital Mechanics](./sims/minimal.world.js)

## Runtime reference

| API | Purpose |
| --- | --- |
| `bkSetup(width, height, draw)` | Set up a responsive 2D canvas and animation loop. |
| `bkSetupWorld(draw)` | Set up a 2D world; the callback receives the context and world state. |
| `bkColor(name)` | Read a theme color such as `accent`, `bg`, or `text`. |
| `bkCanvasPoint(event, canvas)` | Convert pointer coordinates to canvas coordinates. |
| `bkFitCanvas(canvas, width, height, options)` | Fit a custom canvas to its container. |
| `defineSimulation({ props })` | Typed props, reset and playback subscriptions, `deltaTime()`, and telemetry publishing. |
| `__simProps` | Read current properties; listen for `bk:props` to react to changes. |
| `bk:action` event | Listen on `window` for action button events (`event.detail.action`). |
| `bkOnStep`, `bkOnReset`, `bkCompleteStep` | Handle the steps lifecycle, as shown above. |

These APIs are available on `window` inside the simulation iframe.

## What mr-md automates

mr-md manages layout, scaling, theme synchronization, and interaction infrastructure so authors can focus on the scientific model:

### Canvas framing and Retina scaling

Block and step simulations use a responsive canvas contract. The requested size is a minimum logical area. The host scales uniformly and expands callback `width` or `height` to fill available space without stretching:

```javascript
window.bkSetup(800, 450, (ctx, width, height) => {
  ctx.fillStyle = window.bkColor("bg");
  ctx.fillRect(0, 0, width, height);
  // Derive positions and safe bounds from the current width and height.
});
```

A fixed diagram can opt into `{ framing: "contain" }` as the fourth argument to preserve exact logical dimensions and proportions with letterboxing. Explicit `{ framing: "bleed" }` preserves fixed logical coordinates while exposing extended background bounds (`frame.originX`, `frame.originY`, `frame.viewportWidth`, `frame.viewportHeight`) in the fourth callback argument.

Canvas backing bitmaps scale automatically to `window.devicePixelRatio`. Pointer coordinates mapped with `window.bkCanvasPoint(event, canvas)` translate directly to current logical coordinates.

### Modal workspace and keyboard navigation

Clicking **Click to expand** on a preview opens a full-window modal lab dialog (`role="dialog"`). The host isolates the underlying lesson (`inert`), traps focus within the workspace, and restores scroll position and focus when the user exits.

Shortcuts work across the stage, the iframe sandbox, and inspector controls:
- **Space**: toggle pause and resume.
- **R**: reset the current trial or model.
- **Left Arrow / Right Arrow**: navigate previous and next steps in step simulations.
- **Escape**: return to the lesson.

Pausing displays a stage overlay with a Resume button and shortcut reminder while keeping the inspector available for inspection.

### Measurement states, events, and graphs

Measurements can declare optional behavior in the sibling config:

```json
{
  "telemetry": {
    "height": {
      "label": "Height",
      "unit": "m",
      "precision": 2,
      "graph": true,
      "scene": "height-guide",
      "changeThreshold": 2,
      "states": [
        { "when": { "op": "gte", "value": 15 }, "tone": "accent", "label": "Above 15 m" }
      ],
      "notifications": [
        { "id": "height-milestone", "when": { "op": "gte", "value": 15 }, "message": "The projectile crossed 15 metres." }
      ]
    }
  }
}
```

The first matching state sets the number's color and optional explanatory label.
Tones are `neutral`, `accent`, `success`, `warning`, and `danger`. Conditions support `gt`,
`gte`, `lt`, `lte`, `eq`, and `neq`; ordered comparisons require numbers and
equality is strict. Conditions contain data, never JavaScript expressions.

Notifications fire when a condition changes from false to true. The first sample
establishes the starting state. Each notification fires once per run by default;
set `once: false` to allow later crossings and use `cooldown` (seconds) to limit
their frequency. Use `toast: false` to record a routine event only in Timeline,
and `tone` to mark a meaningful warning or success. IDs must be unique within a measurement. Messages appear over
the scene at its top right and link to their measurement. The separate Timeline
tab preserves each message, observed value, and time after the notification
disappears.

Publish `time` in seconds alongside the measurements to timestamp events and
graphs in simulation time. Otherwise, time is measured from the host's last
reset. Graphs keep a bounded, progressively sampled record of the current run
and support multiple framework-owned floating windows. Drag each header anywhere
in the expanded viewport, including over the inspector. Minimize retains a live
readout; Maximize opens a separate browser tab with selectable graphs side by
side. The tab receives live samples while its source remains open, and retains
its last plots when the source disconnects.

Reset clears recorded samples, timeline events, notification state, and unread
indicators. It preserves scene visibility and each graph window’s measurement, position,
and minimized state. Closing and reopening the workspace
also preserves those viewing choices. Guided steps share this distinction
between trial data and viewing preferences when a new trial starts. A simulation that starts a new trial after a settings change can send
`window.parent.postMessage({ type: "bk:telemetry-reset" }, "*")` before publishing
its new values. The host checks the message against the registered iframe.

Numeric updates do not animate or flash rows. Conditional labels reserve space
so crossing a threshold does not repeatedly move neighboring values.

`changeThreshold` sets how much a numeric value must change before marking
the closed Measurements tab as updated. A count shows how many distinct measurements changed while their tab was
closed. Timeline counts new events independently; opening each tab clears its count.

Authors can configure the first view for block, steps, and world simulations:

```json
{
  "measurements": {
    "visible": ["height"],
    "graphs": [{ "key": "height", "minimized": false, "x": 24, "y": 80, "width": 420, "height": 280 }],
    "initialTab": "telemetry",
    "notifications": { "enabled": true, "minInterval": 12, "duration": 5, "maxVisible": 1 },
    "timeline": { "start": true, "present": true, "controls": true }
  }
}
```

Saved reader choices override startup defaults. Notification intervals and durations
are seconds; the global interval limits all toast rules together, including across
trial resets. Suppressed toasts still enter Timeline. Start records the initial
snapshot; Present shows current values and playback state. Settings changes enter
the timeline after the user finishes adjusting a control.

A graph can declare axes instead of `true`, for example:
`"graph": { "x": { "key": "distance", "label": "Distance", "unit": "m" }, "y": { "label": "Speed", "unit": "m/s" } }`.
The Y value is this measurement; X defaults to time in seconds. Custom X keys must
refer to declared telemetry. Authors publish values; the framework draws all plots.

The optional `scene` identifier makes the stat itself a scene-visibility toggle.
Several measurements can remain visible together. The host sends a full snapshot
of the selected measurements when a selection changes and restores it after a
reset or iframe reload. The simulation draws the selected guides using its own
geometry:

```js
window.addEventListener("message", (event) => {
  if (event.source !== window.parent || event.data?.type !== "bk:measurement-visibility") return;
  if (!Array.isArray(event.data.measurements)) return;
  visibleGuides = new Set(event.data.measurements.map((item) => item.scene));
});
```

See `playground/measurements-lab/spring-lab.md` for a spring experiment with a
draggable mass, live physical controls, and spatial measurement guides.

Within **Measurements**, switch between **Stats** and **Graphs**. Graphs lists
author-defined lesson plots and provides X/Y
selectors under **Plot your own**. Custom plots can be removed with their × control. Learners can pair numeric measurements even
when those measurements have no authored `graph` configuration. Axis labels and
units come from the telemetry schema. Plot windows can move across the entire
expanded lab, including the inspector, and can open in a separate browser tab.
Use `measurements.initialTab: "graphs"` to open Measurements in the Graphs view.

The camera button captures the rendered canvas or SVG scene alongside its exact
state. A **Saved to timeline** cue and thumbnail confirm the capture. Enter a
name and choose **Save image** to download a PNG; the timeline entry uses the
same name. Entries can be renamed later, and **Image** downloads the stored frame
again. If image capture is unavailable, the exact state remains in Timeline and
the naming form reports the image error.

**Export** in Timeline downloads JSON containing the branches, named snapshots,
exact states, embedded PNG images, measurement schema, and plot definitions.

### Controls, graphs, and timeline captures

Set `timeline: true` to enable snapshot history and the host Capture button. Declare controls in `tunables` and plots in `telemetry`:

```json
{
  "$schema": "../node_modules/mr-md/dist/simulation.schema.json",
  "type": "block",
  "props": {
    "frequency": 1.5,
    "damping": 0.12
  },
  "tunables": {
    "frequency": {
      "label": "Frequency",
      "unit": "Hz",
      "type": "range",
      "min": 0.5,
      "max": 5.0,
      "step": 0.1
    },
    "damping": {
      "label": "Damping",
      "type": "range",
      "min": 0,
      "max": 0.5,
      "step": 0.02
    }
  },
  "telemetry": {
    "time": { "label": "Time", "unit": "s", "precision": 1 },
    "displacement": {
      "label": "Displacement",
      "unit": "m",
      "precision": 2,
      "graph": true,
      "notifications": [
        {
          "id": "first-crossing",
          "when": { "op": "lt", "value": 0 },
          "message": "First crossing of equilibrium",
          "toast": false
        }
      ]
    }
  },
  "timeline": true
}
```

`props` sets defaults and `tunables` generates host controls. `graph: true`
adds a plot against time. For a phase plot, use
`graph: { "x": { "key": "displacement" } }` on the velocity measurement.

`timeline: true` enables snapshot history and the Capture button. Start and
control-change snapshots are automatic. The present state uses the latest
available capture. Use `timeline: { "capture": false }` to hide the manual
Capture button, or `timeline: false` to disable history.

Measurement `notifications` also define automatic captures. `toast: false`
records the event silently. Readers select a node to restore its state.

- **Returning to live**: Clicking **Back to live** in the Timeline panel returns the reader to the present moment of the active run without modifying history.
- **Continuing from branch head**: If the reader inspects the active run's latest snapshot and resumes playback or adjusts controls, the run continues along the existing branch without creating a new branch rail.
- **Forking from an ancestor milestone**: When a reader inspects an earlier historical checkpoint and interacts with the scene, modifies a control, or resumes playback, the framework automatically forks a new branch. The original future remains intact on its own rail and can be revisited at any time.

New snapshots appear at the top, with Start at the bottom. Each row shows its
simulation time and branch; a new branch can therefore start at an earlier
simulation time than the original future.

> [!NOTE]
> **Persistence scope**: Timeline snapshots, branches, and sample histories are maintained in memory for the duration of the current trial session. Clicking Reset (`R`) or reloading the page resets timeline history. Telemetry viewing preferences (open graphs, selected scene guides, and active tab) persist across resets in session storage.

### Simulation snapshot registration and author contract

Simulations opt into exact, reversible state captures by registering snapshot handlers. This enables readers to click any milestone in the Timeline to inspect past simulation states, and branch off into new experimental runs.

#### Registering snapshot handlers

Inside your simulation script, register snapshot lifecycle functions with `window.bkRegisterSnapshot`:

```javascript
const sim = window.defineSimulation({
  props: { frequency: 1.5, damping: 0.12 }
});

let x = 1.0;
let v = 0.0;
let time = 0.0;

// Opt into exact state restoration
window.bkRegisterSnapshot({
  capture: () => ({ x, v, time }),
  restore: (snapshotState, props, snapshotTime) => {
    x = snapshotState.x;
    v = snapshotState.v;
    time = snapshotTime ?? snapshotState.time;
  }
});
```

#### Author implementation responsibilities

To guarantee glitch-free time travel and branching, simulations must adhere to the following contract:

1. **Synchronous execution**: `capture()` and `restore()` handlers must be strictly synchronous. Do not return unresolved Promises or defer state application to future ticks.
2. **Cloneable state objects**: `capture()` must return a plain, serializable object composed of numbers, strings, booleans, plain objects, and arrays. Never return DOM elements, functions, circular structures, Three.js meshes, or WebGL buffers. The runtime clones state via `structuredClone` with a `JSON` fallback.
3. **Seeded randomness and determinism**: Unseeded `Math.random()` calls will diverge on branch replay. If your model uses stochastic behavior (such as Brownian motion or Monte Carlo sampling), include the pseudo-random generator's seed or state index in `capture()` and re-seed it in `restore()`.
4. **Physics guard during restoration**: Inspect `window.__bkRestoring` during your setup/draw loop. When true, treat elapsed delta time as zero (`dt = 0`), pause physics advancement, and suppress `sim.publishTelemetry` calls to prevent publishing intermediate restoration frames.
5. **In-place reset**: Register an `instance.onReset` or `window.bkOnReset` callback to reset all internal state variables and cancel any in-progress drag or interaction flags when a trial resets.

#### Publishing telemetry and restore guard

Publish live telemetry on each simulation tick. Guard against advancing time or publishing during state restoration by inspecting `window.__bkRestoring`:

```javascript
window.bkSetup(800, 450, (ctx, width, height) => {
  const isRestoring = Boolean(window.__bkRestoring);
  const dt = isRestoring ? 0 : sim.deltaTime();

  if (dt > 0) {
    time += dt;
    // Advance physics model ...
  }

  if (!isRestoring) {
    sim.publishTelemetry({ time, displacement: x });
  }

  // Draw scene ...
});
```

#### Host-to-iframe communication contract

Communication between the mr-md host workspace and the simulation iframe follows a strict `postMessage` protocol:

| Direction | Message Type | Payload | Description |
| --- | --- | --- | --- |
| Host → Iframe | `bk:snapshot-query-capabilities` | `{}` | Inquires if the simulation supports exact snapshot capture and restoration. |
| Iframe → Host | `bk:snapshot-capabilities` | `{ supported: boolean, capabilities: { exactState: boolean, customProps: boolean }, reason?: string }` | Broadcast upon registration or in response to capability query. |
| Host → Iframe | `bk:snapshot-capture` | `{ id: string, time?: number, label?: string }` | Requests an exact state capture from the simulation at the specified moment. |
| Iframe → Host | `bk:snapshot-data` | `{ id: string, success: boolean, isExact: boolean, state?: unknown, telemetry?: Record<string, unknown>, time?: number, props?: Record<string, unknown>, error?: string }` | Returns cloned simulation internal state and props to store in timeline snapshot. |
| Host → Iframe | `bk:snapshot-restore` | `{ id: string, snapshot: SimulationSnapshot, resumePlayback?: boolean }` | Orders simulation to restore historical state and props. Sets `window.__bkRestoring = true` during restore. |
| Iframe → Host | `bk:snapshot-restored` | `{ id: string, success: boolean, isExact: boolean, time?: number, props?: Record<string, unknown>, error?: string }` | Confirms snapshot restoration complete and state synchronized. |
| Iframe → Host | `bk:telemetry` | `{ data: Record<string, unknown> }` | Delivers real-time numerical readings to host meters and graphs. |
| Iframe → Host | `bk:telemetry-reset` | `{}` | Instructs host to clear trial history and graphs when starting a new run. |
| Iframe → Host | `bk:scene-interaction` | `{}` | Reports a spatial interaction. The first spatial interaction with a restored snapshot creates a branch. |

### Inspector layout and live telemetry

Block and step simulations share a structured inspector column beside the canvas:

- **Settings tab**: Tunables organize by `group` with declared order preserved. Unlisted controls appear under Parameters or Options. Secondary controls declared in `advancedControls` tuck into "More controls".
- **Measurements tab**: Live measurements published via `sim.publishTelemetry` or `window.bkTelemetry` coalesce with host `requestAnimationFrame` cycles to prevent layout thrashing. Values appear in aligned instrument rows with units and precision. Clicking a scene-enabled stat toggles its persistent scene guide. A separate graph control opens its floating window. Missing or null values display as `—` rather than placeholder zeros.
- **Timeline tab**: Recorded events include their simulation time and observed value. Selecting an event opens its measurement without hiding an already-visible scene guide.
- **Continuation cue**: Scrollable panels display a clickable cue to scroll down, offering "Back to top" at the end.

## Compatibility guide

mr-md maintains compatibility between authoring patterns, existing simulations, and step modes:

### Legacy simulation scripts

Existing simulations using `window.__simProps` and `window.addEventListener("bk:props", ...)` continue to function without changes. The runtime initializes `window.__simProps` before execution and dispatches `bk:props` whenever host controls or presets update.

### In-place reset and reload fallback

New simulations register an in-place reset callback via `sim.onReset` or `window.bkOnReset`. If an older block simulation does not register a reset callback, the host automatically falls back to reloading the iframe sandbox when the user clicks Reset.

### Control visibility precedence

Secondary controls support both individual `advanced: true` definitions and top-level `advancedControls: ["key"]` arrays. The host resolves visibility using:

```javascript
control.advanced ?? advancedControls.includes(key)
```

Setting `advanced: false` on a specific tunable explicitly overrides the collective list to keep that control visible.

### Block previews and steps coexistence

Both block and step simulations render inline still previews and expand into the shared full-window modal workspace. Steps simulations retain their guided milestone navigation, target badges, instructions, and hints without receiving duplicate block playback controls. Trial reset resets top-level props plus step `initialProps` in place, preserving student progress and narration across trials.

## AI-assisted authoring

The mr-md Agent Skill assists with simulation design, context grounding, and review. Install the skill into compatible coding assistants:

```bash
bunx mr-md skill install
```

See [Agent Skills](./agent-skills.html) for details. Review and test generated simulations in the lesson just as you would code written by hand.
