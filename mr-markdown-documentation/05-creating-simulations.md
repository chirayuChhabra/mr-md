---
index: 5
title: Creating Simulations
slug: creating-simulations
---

# Creating Simulations

`mr-md` embeds interactive JavaScript simulations natively within a secure, sandboxed `iframe`. These simulations can respond to user inputs, adapt to dark/light mode themes seamlessly, and are optimized for high-DPI displays.

Whether you're building a simple interactive diagram or a complex physics sandbox, `mr-md` provides a simple yet powerful API to get you up and running quickly.

Check out this interactive pathfinding simulation built with the `mr-md` API:

![Pathfinder Simulation](./sims/pathfinder.js)

---

## 1. Getting Started

Creating a simulation involves two pieces: a JavaScript file that contains your simulation logic, and a simple Markdown embed to display it.

### Step 1: Write your Simulation Script
Create a new file called `mysim.js` (or `.ts`) in your project. We'll use the `mr-md` global API to draw a simple rectangle:

```javascript
// mysim.js
window.bkSetup(800, 500, function(ctx, width, height) {
  // Clear the canvas every frame
  ctx.clearRect(0, 0, width, height);
  
  // Use dynamically synced theme colors!
  ctx.fillStyle = window.bkColor("primary");
  
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

## 2. Configuration & Interactive UI (`.config.json`)

One of the most powerful features of `mr-md` simulations is the ability to expose **interactive controls** (sliders, toggles) directly to the reader without writing any UI code.

If you place a JSON file next to your script with the same name (e.g., `mysim.config.json` for `mysim.js`), `mr-md` will parse it, generate a UI block above the simulation, and pass the properties to your script at runtime.

### Example: `mysim.config.json`

```json
{
  "props": {
    "mazeDensity": 25,
    "diagonal": false
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
    }
  }
}
```

- **`props`**: The default values that are passed to your simulation.
- **`tunables`**: Describes how `mr-md` should render the UI. A range slider will be generated for `mazeDensity`, and a toggle switch for `diagonal`.

### Accessing Props in your Script

Inside your simulation script, you can access these values—which update in real-time as the user interacts with the UI—via the `window.__simProps` object:

```javascript
window.bkSetup(800, 500, function(ctx, width, height) {
  const density = window.__simProps.mazeDensity;
  const allowDiag = window.__simProps.diagonal;
  
  // Use 'density' and 'allowDiag' in your simulation logic!
});
```

---

## 3. The `bk` API Reference

To ensure simulations scale perfectly and match the host's theme seamlessly, `mr-md` injects several `bk` (BlogKit) global functions into the iframe sandbox.

### `window.bkSetup(width, height, loopFn)`
Bootstraps a 2D canvas simulation. 
- It automatically creates an internal canvas.
- It sets up DPI scaling for retina displays.
- It handles window resizing dynamically.
- It invokes your `loopFn(ctx, width, height)` on every animation frame.

> **Tip:** You don't need to write a `requestAnimationFrame` loop. `bkSetup` handles the run loop for you automatically!

### `window.bkColor(name)`
Fetches a dynamically synced color from the `mr-md` theme system. If the user toggles dark mode on your site, these colors update automatically!

```javascript
const primaryColor = window.bkColor("primary");
const bgColor = window.bkColor("background");
const textRed = window.bkColor("red");
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
