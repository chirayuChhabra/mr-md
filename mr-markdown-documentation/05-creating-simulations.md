---
index: 5
title: Creating Simulations
slug: creating-simulations
description: Mount theme-aware 2D/3D JavaScript and TypeScript interactive canvas sandboxes with zero external dependencies.
author: Graphics & Engine Team
tags: [canvas, simulations, graphics, theme-aware]
---

# Creating Simulations

`mr-md` embeds interactive JavaScript simulations natively within a secure, sandboxed `iframe`. These simulations can respond to user inputs, adapt to dark/light mode themes seamlessly, and are optimized for high-DPI displays.

Check out this interactive pathfinding simulation built with the `mr-md` API:

> [!TIP]
> **Interactive:** Drag the **START** (Green) or **END** (Red) nodes to move them. Click and drag on empty space to draw **WALLS**.

![Pathfinder Simulation](./sims/pathfinder.js)

---

## 1. AI-Assisted Creation

The fastest and most robust way to build a simulation is to let an AI coding assistant (like **Claude Code**, **Cursor**, **Codex**, or **Antigravity**) do the heavy lifting.

`mr-md` provides an official Agent Skill that teaches AI exactly how to use the `mr-md` runtime API, handle `.config.json` properties, and match the framework's visual style.

Just install the skill in your project:

```bash
bunx mr-md skill install
```

Once installed, simply ask your AI agent:
> "Create a simulation of the A* pathfinding algorithm. Let the user click to toggle walls on the grid, and animate the search path when they press a start button."

The AI will automatically write the script, wire up the interactive UI controls, hook into the live theming engine, and embed it using the correct Markdown syntax!

See the [Agent Skills](./agent-skills.html) guide for full details on the skill system.

---

## 2. Manual Creation

If you prefer to write simulations by hand, it involves two pieces: a JavaScript file that contains your simulation logic, and a simple Markdown embed to display it.

### Step 1: Write your Simulation Script
Create a new file called `mysim.js` (or `.ts`) in your project. We'll use the `mr-md` global API to draw a simple rectangle:

```javascript
// mysim.js
window.bkSetup(1280, 720, function(ctx, width, height) {
  // Clear the canvas every frame
  ctx.clearRect(0, 0, width, height);
  
  // Use dynamically synced theme colors!
  ctx.fillStyle = window.bkColor("accent");
  
  // Draw something
  ctx.fillRect(10, 10, 50, 50);
});
```

### Step 2: Embed in Markdown
Embed the simulation using the standard Markdown image syntax, pointing to your `.js` or `.ts` file:

```markdown
![My First Simulation](./mysim.js)
```

That's it! `mr-md` automatically wraps your script in a sandbox, provisions a high-DPI canvas, and runs your render loop.

---

## 3. Configuration & Interactive UI (`.config.json`)

One of the most powerful features of `mr-md` simulations is the ability to expose **interactive controls** (sliders, toggles) directly to the reader without writing any UI code.

If you place a JSON file next to your script with the same name (e.g., `mysim.config.json` for `mysim.js`), `mr-md` will parse it, generate a UI block above the simulation, and pass the properties to your script at runtime.

### Example: `mysim.config.json`

```json
{
  "props": {
    "mazeDensity": 25,
    "diagonal": false,
    "showStats": true
  },
  "tunables": {
    "mazeDensity": { 
      "label": "Maze Density (%)", 
      "min": 0, 
      "max": 50, 
      "step": 1 
    },
    "diagonal": { 
      "label": "Allow Diagonal", 
      "type": "boolean" 
    },
    "showStats": {
      "label": "Show Stats",
      "type": "boolean"
    }
  }
}
```

- **`props`**: The default values that are passed to your simulation.
- **`tunables`**: Describes how `mr-md` should render the UI. A range slider will be generated for `mazeDensity`, and toggle switches for `diagonal` and `showStats`.

### Accessing Props in your Script

Inside your simulation script, you can access these values—which update in real-time as the user interacts with the UI—via the `window.__simProps` object:

```javascript
window.bkSetup(1280, 720, function(ctx, width, height) {
  const density = window.__simProps.mazeDensity;
  const allowDiag = window.__simProps.diagonal;
  
  // Use 'density' and 'allowDiag' in your simulation logic!
});
```

---

## 4. Interactive Step-by-Step Simulations (`type: "steps"`)

In addition to open sandboxes, `mr-md` supports **Step-by-Step Simulations**. These share the exact same 16:9 aspect ratio and design language as standard simulations (`.bk-object`), while guiding learners through multi-step milestones with goals, instructions, voiceover narration, hints, and instant milestone feedback:

![Orbital Slingshot Maneuver](./sims/orbital-slingshot.js)

### Creating a Step-by-Step Simulation

A step-by-step simulation is defined in exactly one way: a standard simulation file (`mysim.js`) with a companion `mysim.config.json` declaring `"type": "steps"`:

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

### Step Configuration Schema

* `id` *(string)*: Unique identifier for the milestone.
* `title` *(string)*: Step headline shown in the banner.
* `target` *(string, Markdown supported)*: Target indicator badge (e.g. `Goal: Cancel Signal`).
* `instruction` *(string, Markdown & LaTeX supported)*: Pedagogical instruction explaining what the student needs to do.
* `audio` *(string, optional)*: Path to a custom recorded audio file (e.g. `./audio/step-1.mp3`, `.wav`, or external URL). `mr-md` bundles and fingerprints the asset automatically into `out/assets/`. This is the recommended first-class option for clean, natural voiceover.
* `voice` *(string, optional)*: Opt-in text for browser speech synthesis (`window.speechSynthesis`). This is strictly opt-in and will never automatically speak unprompted; if neither `audio` nor `voice` is specified, the simulation is completely silent and the audio control is hidden.
* `feedback` *(string, Markdown supported)*: Success toast shown upon milestone completion.
* `hint` *(string, Markdown supported)*: Optional hint revealed when the learner clicks the 💡 hint button.
* `initialProps` *(object)*: Step-specific parameters passed into `window.__simProps` when entering this step.

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

## 5. The `bk` API Reference

To ensure simulations scale perfectly and match the host's theme seamlessly, `mr-md` injects several `bk` (BlogKit) global functions into the iframe sandbox.

### `window.bkSetup(width, height, loopFn)`
Bootstraps a 2D canvas simulation. 
- It automatically creates an internal canvas.
- It sets up DPI scaling for retina displays.
- It handles window resizing dynamically.
- It invokes your `loopFn(ctx, width, height)` on every animation frame.

> **Tip:** You don't need to write a `requestAnimationFrame` loop. `bkSetup` handles the run loop for you automatically!

### `window.bkOnStep(callback)`
Registers a callback invoked whenever the user switches steps (via arrows, dot clicks, or initial mount).
```javascript
window.bkOnStep((stepIndex, stepData, props) => {
  console.log("Current step:", stepIndex);
});
```

### `window.bkOnReset(callback)`
Registers a callback invoked when the user resets the current step trial (via the reset button or pressing `R`).
```javascript
window.bkOnReset(() => {
  resetSimulationState();
});
```

### `window.bkCompleteStep(stepIndexOrMsg, feedbackMsg)`
Notifies the parent lesson card that the current milestone has been achieved. Automatically triggers the celebration chime, success badge, and optional feedback toast.
```javascript
// Simple message for current step
window.bkCompleteStep("Orbital insertion achieved!");

// Or explicit step index and message
window.bkCompleteStep(currentStep, "Excellent trajectory!");
```

### `window.bkColor(name)`
Fetches a dynamically synced color from the `mr-md` theme system. If the user toggles dark mode on your site, these colors update automatically!

```javascript
const accentColor = window.bkColor("accent");
const bgColor = window.bkColor("bg");
const textColor = window.bkColor("text");
```

### `window.bkCanvasPoint(event, canvas)`
Translates raw DOM pointer coordinates (like `event.clientX`) into the logical coordinate space of the DPI-scaled canvas. Essential for handling mouse and touch interactions accurately.

```javascript
// Access the underlying canvas created by bkSetup
const canvas = document.getElementById("c");

canvas.addEventListener("pointermove", (e) => {
  const pt = window.bkCanvasPoint(e, canvas);
  console.log("Mouse X:", pt.x, "Mouse Y:", pt.y);
});
```

### `window.bkFitCanvas(canvas, requestedW, requestedH, options)`
If you are doing custom canvas rendering (like WebGL instead of the 2D context provided by `bkSetup`), call this manually to apply the CSS scaling transforms needed to make your canvas responsive inside the `mr-md` layout container.
