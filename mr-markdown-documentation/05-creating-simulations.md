---
index: 5
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
| `bkOnStep`, `bkOnReset`, `bkCompleteStep` | Handle the steps lifecycle, as shown above. |

These APIs are available on `window` inside the simulation iframe.

## AI-assisted authoring

The optional mr-md Agent Skill provides an assistant with simulation authoring guidance. Install it with:

```bash
bunx mr-md skill install
```

See [Agent Skills](./agent-skills.html) for details. Review and test generated simulations in the lesson just as you would code written by hand.
