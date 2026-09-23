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
        +--> generated host controls
        |
        v
sandboxed iframe --> window.__simProps
        ^                    |
        |                    v
        +---- bk:set-props / bk:props
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
  "height": 420,
  "label": "Interactive Lab",
  "caption": "Instructions for the learner.",
  "controls": "interactive",
  "accent": "blue",
  "dependencies": []
}
```

Control types are `range`, `number`, `text`, and `boolean`. A numeric prop
defaults to a range, a string to text, and a boolean to a toggle. Explicit
`tunables` are preferred because their labels and bounds define the intended
experience.

These generated controls are the only non-spatial input UI. Keep form fields,
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
| Injected canvas/runtime API | `src/renderer/blocks/iframe.ts` |
| Generated controls | `src/renderer/markdown/controls.ts` |
| Control-to-prop messages | `src/client/simulation.ts` |
| Activation and pause behavior | `src/client/interactive.ts` |
| Synchronized token names | `src/client/theme.ts` |

Useful examples:

- `mr-markdown-documentation/sims/pathfinder.js`
- `mr-markdown-documentation/sims/pathfinder.config.json`
- `mr-markdown-documentation/sims/qcd.js`
- `mr-markdown-documentation/sims/qcd.config.json`

Read both the script and config for a relevant example before implementing.
Notice that generated controls stay in the host while the iframe remains a
visual scene. Use `visual-quality.md` for containment, contrast, and screenshot
acceptance gates.

