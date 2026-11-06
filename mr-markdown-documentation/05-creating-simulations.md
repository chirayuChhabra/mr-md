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
| Block | A sandbox or model alongside the text | `"type": "block"` (default) |
| Steps | A sequence of goals with instructions and feedback | `"type": "steps"` |
| World | An explorable scene entered through a portal | `"type": "world"` |

## Block simulations

To make your own, create a script next to your lesson. `bkSetup` provides a canvas and calls your drawing function on each animation frame:

```javascript
// mysim.js
window.bkSetup(800, 450, (ctx, width, height) => {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = window.bkColor("accent");
  ctx.fillRect(40, 40, 80, 80);
});
```

Embed it in your Markdown:

```markdown
![My simulation](./mysim.js)
```

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

When a user selects a preset, the host updates the active controls and dispatches `bk:props` with all bundled values, identical to standard tunable updates.

## Steps simulations

In addition to open sandboxes, `mr-md` supports **Step-by-Step Simulations**. Use steps when a learner should work through a sequence of goals. Each step can provide instructions, a hint, feedback, and optional narration:

![Orbital Slingshot Maneuver](./sims/orbital-slingshot.js)

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

### Writing the Simulation Script

The author runtime provides clean lifecycle hooks inside the canvas iframe sandbox:

```javascript
let currentStep = 0;

function setupStep(stepIndex) {
  currentStep = stepIndex;
  // Initialize objects, obstacles, or starting vectors for this step
}

// 1. Listen for Step Changes
window.bkOnStep((stepIndex, stepData, props) => {
  setupStep(stepIndex);
});

// 2. Listen for Trial Resets (e.g. Reset button or 'R' key)
window.bkOnReset(() => {
  setupStep(currentStep);
});

// 3. Main Render Loop
window.bkSetup(800, 450, function(ctx, width, height) {
  // Update physics and render canvas using window.bkColor...

  // 4. Trigger Milestone Completion when goal condition is reached:
  if (checkGoalAchieved()) {
    window.bkCompleteStep("Orbital insertion achieved!");
  }
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
| `__simProps` | Read current properties; listen for `bk:props` to react to changes. |
| `bk:action` event | Listen on `window` for action button events (`event.detail.action`). |
| `bkOnStep`, `bkOnReset`, `bkCompleteStep` | Handle the steps lifecycle, as shown above. |

These APIs are available on `window` inside the simulation iframe.

## AI-assisted authoring

The optional mr-md Agent Skill provides an assistant with simulation authoring guidance. Install it with:

```bash
bunx mr-md skill install
```

See [Agent Skills](./agent-skills.html) for details. Review and test generated simulations in the lesson just as you would code written by hand.

Action buttons accept an optional `color`: `accent` (default), `neutral`, `red`, `green`, or `amber`. For example, `"impulse": { "label": "Apply impulse", "color": "green" }`. Use color to reinforce the action’s meaning and keep the label explicit. Use a `select` for longer choices that would crowd a segmented control.
