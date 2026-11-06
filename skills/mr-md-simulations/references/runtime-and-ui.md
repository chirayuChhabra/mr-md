# mr-md simulation runtime and UI contract

Use this reference for current mr-md simulation authoring. If working in a
different mr-md version, inspect that version's implementation before relying
on details that may have changed.

## Data flow

```text
sibling .config.json
        |
        v
Markdown parser or builder
        |
        +--> generated host controls (tunables, presets, actions)
        |
        v
sandboxed iframe --> window.__simProps
        ^                    |
        |                    v
        +---- bk:props / bk:action
```

The host owns the controls. The iframe owns simulation state and drawing.

## Embedding and configuration

A standalone Markdown image whose source ends in `.js` or `.ts` becomes a
simulation block:

```markdown
![Meaningful description](./sims/example.js)
```

The optional sibling config uses the simulation basename:

```text
example.js
example.config.json
```

Supported config fields correspond to `SimulationConfig`:

```json
{
  "props": {},
  "tunables": {},
  "advancedControls": [],
  "actions": {},
  "presets": {},
  "height": 420,
  "label": "Interactive Lab",
  "caption": "Instructions for the learner.",
  "controls": "interactive",
  "accent": "blue",
  "dependencies": []
}
```

Generated host controls support:
- `range`: numeric slider (`min`, `max`, `step`, optional `unit?: string`);
- `number`: numeric input field (`min`, `max`, `step`, optional `unit?: string`);
- `text`: single-line string input;
- `boolean`: toggle switch;
- `segmented`: inline segmented choices (`options: Array<{ label: string, value: string | number | boolean }>`);
- `select`: compact dropdown picker (`options: Array<{ label: string, value: string | number | boolean }>`).

Organize primary vs secondary controls with `advancedControls`:
- **Preferred authoring syntax**: top-level `advancedControls?: string[]` lists tunable keys to place under the native `<details>`/`<summary>` "More controls" disclosure (closed by default).
- **Default visibility**: all unlisted controls remain primary and visible by default alongside presets and actions.
- **Precedence**: `control.advanced ?? advancedControls.includes(key)`. Setting `advanced: false` on an individual control explicitly overrides the list to keep it visible; `advanced: true` works standalone for backwards compatibility.
- **Learning-goal selection guidance**: select visible controls deliberately based on what teaches the core learning objective. Keep parameters central to prediction and manipulation visible as primary; place auxiliary overlays, fine-tuning constants, and environment setups in `advancedControls`. Do not automatically hide controls by count or type, or infer importance from variable names.
- **Closed state lifecycle**: controls inside the closed disclosure are fully mounted in the DOM; they initialize on page load, update synchronously when presets change, and preserve their values in `window.__simProps`.

Top-level configuration options:
- `actions?: Record<string, { label: string }>`: push-button actions rendered inline with primary controls. Outlined restrained buttons dispatch `bk:action` events to the iframe (`event.detail.action`). Useful for repeatable impulses, triggers, or resets.
- `presets?: Record<string, { label: string, props: Record<string, string | number | boolean> }>`: named parameter bundles rendered as a labeled native select with an initial neutral "Choose preset". Selecting a preset updates active controls (including hidden advanced controls) and applies properties via `bk:props`. Manual adjustments clear the preset selection.

Do not add playback controls (play/pause/step) to block simulations; steps simulations already own playback.

For block/steps, these generated controls are the non-spatial input UI. Keep form fields,
toggles, selects, ordinary action buttons, and control panels out of the iframe.
When possible, reshape a task into declarative props—for example,
comma-separated text for a collection—then use the canvas to show the result.
If the required interaction cannot be represented, propose a host-control
extension instead of implementing a parallel form system in the frame.

`controls: "observe"` hides generated controls. Accent values supported by the
block type are `neutral`, `blue`, `teal`, `amber`, `rose`, and `violet`.

External script dependencies can be listed as URLs in `dependencies`. They are
loaded before the simulation script. Add a dependency only when it materially
reduces complexity, and consider offline behavior and third-party trust.

## Globals available inside the iframe

### `window.__simProps`

Contains the initial props before the simulation script executes:

```js
let speed = Number(window.__simProps?.speed ?? 1);
```

Host control changes replace or merge values and dispatch `bk:props`:

```js
window.addEventListener("bk:props", (event) => {
  speed = Number(event.detail.speed ?? speed);
});
```

Treat values defensively. Keep the previous valid value when an update is
missing or invalid.

### `bk:action` window event

Dispatched when the learner clicks an action button defined in `actions`:

```js
window.addEventListener("bk:action", (event) => {
  if (event.detail.action === "impulse") {
    applyVelocityKick();
  }
});
```

### `window.bkSetup(width, height, draw)`

Creates and fits the existing `#c` canvas, configures high-DPI rendering, and
invokes:

```js
draw(context, logicalWidth, logicalHeight);
```

The callback initially draws once. The host starts and pauses continuous
drawing by posting lifecycle messages as the frame is activated or leaves the
viewport. Do not start another animation loop around `bkSetup`.

The requested dimensions define logical coordinates, not a license to place
content at their edges. Keep essential content inside a safe rectangle inset by
at least 6% on every side. Include text, strokes, shadows, animation extent, and
hit-target padding in layout bounds. Validate both normal and maximized frame
states; compile-time checks cannot detect cropping or overlap.

### `window.bkCanvasPoint(event, canvas)`

Maps a pointer event into the logical coordinates requested by `bkSetup`:

```js
const point = window.bkCanvasPoint(event, event.currentTarget);
```

Use it instead of calculating device-pixel-ratio or CSS transforms again.

### `window.bkFitCanvas(canvas, width, height, options)`

Fits a custom canvas and configures its bitmap. Most 2D simulations should use
`bkSetup`; call `bkFitCanvas` directly only for a custom rendering path such as
WebGL.

### `window.bkSetupWorld(loopFn)`

Bootstraps a 2D world configured with `type: "world"`.
Provides an infinite spatial canvas, automatic high-DPI scaling, and camera
management:

```js
window.bkSetupWorld(function(ctx, world) {
  // world: { width, height, camera: { x, y, zoom }, isWorld: boolean, props }
  // Center of world (0, 0) is automatically placed at viewport center.
  // Panning (drag), zooming (wheel), and flying (WASD) are applied automatically.
});
```

### `window.bkWorld`

When inside an explorable World simulation, `window.bkWorld` provides camera
telemetry and coordinate transformation functions:

- `camera`: `{ x: number, y: number, zoom: number }`
- `toWorld(clientX, clientY)`: converts screen coordinates to world units
- `toScreen(worldX, worldY)`: converts world coordinates to screen pixels
- `resetCamera()`: restores camera to origin and 1.0x zoom
- `setCamera(x, y, zoom)`: programmatically moves the world camera
- `active`: boolean indicating whether the reader is in full-screen immersion

### Theme helpers

`bkColor(name)` returns a synchronized theme color. Current names are:

```text
bg, paper, line, line-strong, text, text-light, accent, accent-soft
```

`bkThemeMode()` returns `light` or `dark`. `bkUi()` returns `standard`, `neo`,
or `playful`.

The runtime dispatches `bk:theme-changed` after a host update. `bkSetup`
automatically redraws a paused canvas after this event. A custom renderer must
handle the event itself.

The synchronized host state has three appearance dimensions:

- theme: `light` or `dark`;
- palette: `ink`, `field`, `ember`, `elixir`, `trunk`, or `lava`; and
- UI: `standard`, `neo`, or `playful`.

Palette selection is intentionally consumed through semantic `bkColor()` tokens
rather than palette-name branches. This lets a new or adjusted palette flow
into simulations without rewriting them.

Do not cache `bkUi()` or `bkColor()` results during initialization. Read them
while drawing so a live host appearance change updates the simulation. `bkUi()`
is not just a choice of corner radius: use it to select a coherent set of
geometry, stroke, shadow, typography, decoration, and non-semantic motion
traits. See `ui-language.md`.

## Interaction lifecycle

The simulation iframe uses `sandbox="allow-scripts"`. It does not receive
same-origin access to the host page.

The host:

- adds an activation overlay;
- allows only one interactive frame to be active at a time;
- sends `bk:play` when a simulation is activated;
- sends `bk:pause` when it is deactivated or leaves the observed area; and
- restarts animations when they return to the viewport.

Because a frame can be paused for an arbitrary duration, compute and clamp
frame deltas:

```js
const now = performance.now();
const dt = Math.min((now - previousTime) / 1000, 0.1);
previousTime = now;
```

## Source-of-truth implementation

Inside the mr-md repository:

| Concern | File |
| --- | --- |
| Simulation type and config fields | `src/types.ts` |
| Config merge behavior | `src/builder/utils.ts` |
| Builder entry points | `src/builder/LessonBlocks.ts` |
| Markdown image detection | `src/parser/mdx.ts` |
| Host block and iframe creation | `src/renderer/blocks/simulation.ts` |
| World block creation & portal | `src/renderer/blocks/world.ts` |
| Injected canvas/runtime API | `src/renderer/blocks/iframe.ts` |
| Generated controls | `src/renderer/markdown/controls.ts` |
| Control-to-prop messages | `src/client/simulation.ts` |
| World portal expansion controller | `src/client/world.ts` |
| Activation and pause behavior | `src/client/interactive.ts` |
| Synchronized token names | `src/client/theme.ts` |

Useful examples:

- `mr-markdown-documentation/sims/cosmos.world.js`
- `mr-markdown-documentation/sims/cosmos.world.config.json`
- `mr-markdown-documentation/sims/pathfinder.js`
- `mr-markdown-documentation/sims/pathfinder.config.json`
- `mr-markdown-documentation/sims/qcd.js`
- `mr-markdown-documentation/sims/qcd.config.json`

Read both the script and config for a relevant example before implementing.
Notice that generated controls stay in the host while the iframe remains a
visual scene. Use `visual-quality.md` for containment, contrast, and screenshot
acceptance gates.


## Presentation-specific contracts

Read [steps.md](steps.md) for guided-step schema, completion, reset, and narration.
Read [worlds.md](worlds.md) for portals, camera transforms, custom WebGL rendering,
and world lifecycle. The fixed-canvas signature of `bkFitCanvas` above does not
apply to worlds: their helper is `bkFitCanvas(canvas)` and fits the viewport.
World rendering does not generate the standard tunable control panel; do not
assume a field present in a shared type guarantees visible controls.

Action buttons accept an optional `color`: `accent` (default), `neutral`, `red`, `green`, or `amber`. For example, `"impulse": { "label": "Apply impulse", "color": "green" }`. Use color to reinforce the action’s meaning and keep the label explicit. Use a `select` for longer choices that would crowd a segmented control.
