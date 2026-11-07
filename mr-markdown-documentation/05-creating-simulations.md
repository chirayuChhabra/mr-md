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

### Inspector layout and live telemetry

Block and step simulations share a structured inspector column beside the canvas:
- **Controls tab**: Tunables organize by `group` with declared order preserved. Unlisted controls appear under Parameters or Options. Secondary controls declared in `advancedControls` tuck into "More controls".
- **Measurements tab**: Live measurements published via `sim.publishTelemetry` or `window.bkTelemetry` coalesce with host `requestAnimationFrame` cycles to prevent layout thrashing. Values format into two-column metric cards or full-width status rows with units and precision. Missing or null values display as `—` rather than placeholder zeros.
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
