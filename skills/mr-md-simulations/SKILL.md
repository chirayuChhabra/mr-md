---
name: mr-md-simulations
description: Create, integrate, debug, and review context-aware interactive canvas simulations for mr-md lessons. Use when a task mentions an mr-md simulation, interactive lab or diagram, JavaScript or TypeScript lesson embed, sibling .config.json controls, bkSetup, bkColor, __simProps, or changes to the mr-md simulation runtime and UI. Grounds notation, terminology, formulas, units, labels, and interactions in the target lesson and surrounding course context.
compatibility: Requires an mr-md lesson project. Bun is required to compile TypeScript simulation sources and to run the mr-md repository's development and test commands.
metadata:
  author: chirayuChhabra
  version: "1.4.0"
---

# Build mr-md simulations

Create simulations that behave like part of the lesson, not isolated canvas
demos. Ground every visible term and model choice in the material being taught.
Prefer mr-md's host controls, theme tokens, responsive canvas helpers, and
lifecycle over custom alternatives.

Clipping, unreadable contrast, duplicated in-canvas form controls, and a UI mode
that changes information density are release blockers. A build that compiles
but has not been rendered and inspected is not complete.

Use a modern, neat, clean visual baseline informed by excellent contemporary
product design. Teenage Engineering and Apple are useful reference points:
combine functional industrial clarity, disciplined grids, restrained playful
accents, careful hierarchy, crisp rendering, and purposeful motion. Extract
those principles; do not copy either company's branding, products, or trade
dress. Let mr-md own the small interface details around the scene.

## Establish the task

Before writing code:

1. Locate and read the complete target lesson, not only the simulation embed or
   the user's summary.
2. Identify the local section where the simulation appears and what has already
   been introduced before it.
3. Read the containing chapter or course index, relevant glossary or notation
   pages, and adjacent lessons when they define terms used here.
4. Search the project for repeated uses of important symbols, formulas, and
   domain terms to discover local conventions.
5. Identify the learning objective in one sentence.
6. Decide what the learner manipulates and what visible consequence teaches the
   objective.
7. Locate nearby simulations and the installed or checked-out mr-md version.
8. Determine whether the task changes lesson content or mr-md's runtime.

The target lesson is part of the implementation specification. Do not begin
with a generic textbook simulation and rename it afterward.

## Ground the simulation in lesson context

Before implementation, create a compact context brief using
`references/context-grounding.md`. At minimum, extract:

- the exact concept and learning objective at this point in the lesson;
- assumed prior knowledge and concepts not yet introduced;
- the author's exact terminology, capitalization, and preferred synonyms;
- every relevant symbol, formula, variable definition, unit, range, sign
  convention, coordinate convention, and initial condition;
- the derivation or formulation the lesson uses when several valid formulations
  exist;
- the narrative voice and way the author explains cause and effect; and
- what the next paragraph or lesson expects the learner to notice.

Apply that brief to:

- config prop names where practical;
- generated control labels and units;
- canvas labels, legends, annotations, equations, and instructions;
- default values, bounds, constants, and reset state;
- captions and surrounding prose; and
- code comments that explain the domain model.

Preserve meaningful distinctions. Do not replace `displacement` with
`distance`, `speed` with `velocity`, `mass` with `weight`, or the lesson's
chosen `y = mx + c` with `y = mx + b`. If the course calls an object, stage, or
operation by a local name, use that name exactly instead of a more standard
synonym.

Generated control labels are plain text, not LaTeX. Translate notation
faithfully with readable Unicode where appropriate, such as `Initial velocity
(v₀)`, and keep the full LaTeX formulation in lesson prose when needed.

If the lesson is missing, the relevant notation is undefined, or two nearby
sources conflict, stop and ask one specific question. Do not silently choose a
generic convention. Explicit user direction has priority, but surface a
conflict when following it would make the simulation disagree with the target
lesson.

When this skill is used inside the mr-md repository, treat the implementation
as the source of truth. Inspect these files before changing the runtime:

- `src/renderer/blocks/iframe.ts`
- `src/renderer/blocks/simulation.ts`
- `src/renderer/markdown/controls.ts`
- `src/client/simulation.ts`
- `src/client/interactive.ts`
- `src/client/theme.ts`
- `src/types.ts`

Do not assume a documented API exists when the checked-out implementation
differs. Reconcile the documentation and tests with any intentional contract
change.

## Choose the integration

For a Markdown lesson, place the simulation beside the lesson or in a local
`sims/` directory:

```text
lesson.md
sims/
├── orbit.js
└── orbit.config.json
```

Embed it with Markdown image syntax:

```markdown
![Explore how orbital speed changes the path](./sims/orbit.js)
```

For the builder API, use `.lab()` for an interactive simulation:

```ts
lesson.lab("./sims/orbit.ts", {
  label: "Orbital Motion",
  caption: "Drag the body and vary its initial speed.",
});
```

Do not use `.add()` for a JavaScript or TypeScript simulation; that call is
intentionally ambiguous and rejected by mr-md.

## Build the simulation

Start from `assets/simulation.js` and
`assets/simulation.config.json` when useful, but copy and rename them in the
lesson project. Do not edit the installed skill's assets as project source.

Follow this order:

1. Define a stable logical coordinate system, commonly `800 × 500`, plus a safe
   content rectangle inside it.
2. Read initial values from `window.__simProps`.
3. Listen for `bk:props` and update local state when host controls change.
4. Register pointer listeners once, during initialization.
5. Convert pointer coordinates with `window.bkCanvasPoint`.
6. Render with `window.bkSetup`; do not add a competing
   `requestAnimationFrame` loop.
7. Obtain host colors through `window.bkColor` on every draw.
8. Obtain the current visual language through `window.bkUi` on every draw.
9. Clamp elapsed time after pauses so resumed simulations do not jump.

Read `references/runtime-and-ui.md` for the host contract and
`references/ui-language.md` for required visual adaptation. Read
`references/visual-quality.md` before planning the viewport.

## Connect controls to behavior

Put author-facing defaults and controls in the sibling config:

```json
{
  "props": {
    "speed": 1,
    "showVectors": true
  },
  "tunables": {
    "speed": {
      "label": "Speed",
      "type": "range",
      "min": 0.1,
      "max": 3,
      "step": 0.1
    },
    "showVectors": {
      "label": "Show Vectors",
      "type": "boolean"
    }
  }
}
```

Use generated controls for all non-spatial input, including `range`, `number`,
`text`, and `boolean` values. Reserve direct canvas interaction for spatial
actions such as dragging a body, drawing a ray, or selecting a cell.

Every tunable must:

- have a matching default in `props`;
- cause an immediate, observable change;
- use the lesson's exact educational term, notation, and unit rather than an
  internal variable name or generic synonym;
- have meaningful bounds and a usable step size; and
- preserve its value type when handled by the simulation.

Do not build a second form or toolbar inside the iframe. This prohibition
includes sliders, toggles, text fields, number fields, selects, ordinary action
buttons, and control cards. Reshape the interaction around host props when
possible. For example, represent a set editor with a host text prop such as
`Set members` and a membership query with `Test element`, then visualize the
result on canvas. Do not draw fake input boxes on the canvas.

If the learning objective genuinely requires a control the current config
cannot express, stop and ask whether to simplify the interaction or extend
mr-md's host-control contract. Do not silently create a parallel UI system in
the simulation. The iframe is sandboxed and cannot directly manipulate the
host lesson DOM.

## Plan and contain the viewport

Treat the canvas as a diagram or experimental scene, not a second application
shell. The host already owns the lab title, controls, fullscreen action, and
caption. Do not repeat them inside the canvas.

Keep the scene visually current and focused:

- establish one obvious focal point and a quiet supporting hierarchy;
- prefer negative space, alignment, and grouping over extra containers;
- use crisp typography and concise labels rather than decorative headings;
- use motion to explain state or causality, not as ambient decoration;
- avoid gratuitous gradients, glassmorphism, glow, badges, emoji, skeuomorphic
  controls, and card-within-card layouts; and
- do not add a panel, border, or shadow when the host frame already supplies
  that separation.

Before drawing, write down:

1. the logical width and height;
2. a safe content rectangle with at least 6% inset on every edge;
3. regions for the primary model, labels, legend, and readouts;
4. the maximum expected item count and label length; and
5. the layout behavior for empty, minimum, typical, and maximum data.

Then enforce these rules:

- derive positions and sizes from the logical width, height, and safe rectangle;
- keep every essential mark, label, shadow, and pointer target within that
  rectangle in every state;
- account for stroke width, shadow offset, text ascent/descent, and pulse or
  animation extent when calculating bounds;
- use `measureText()` and wrapping, truncation, or a bounded grid for dynamic
  labels instead of guessing their width;
- clamp draggable objects to the safe rectangle;
- separate model, layout, and rendering so styling cannot accidentally change
  the data layout; and
- preserve the same layout and information density across UI modes.

Do not solve overflow by shrinking all text until it is unreadable. Reduce
decoration, restructure the layout, cap displayed detail with an explained
summary, or ask for a product decision. See `references/visual-quality.md` for
layout and screenshot gates.

## Match mr-md's UI

Use only supported theme tokens:

- `bg`
- `paper`
- `line`
- `line-strong`
- `text`
- `text-light`
- `accent`
- `accent-soft`

Treat theme, palette, and UI mode as three independent dimensions:

- `bkThemeMode()` identifies light or dark contrast.
- `bkColor()` supplies the active palette's synchronized surfaces, lines, text,
  and accents.
- `bkUi()` controls the simulation's complete visual language.

Current palettes are `ink`, `field`, `ember`, `elixir`, `trunk`, and `lava`.
Do not hard-code a substitute accent for any of them. Read `bkColor()` during
every draw so palette changes update immediately.

Domain colors are allowed when color itself carries meaning—for example,
particle color charge or start/end states—but they must remain legible against
every palette and must have a second signal such as shape, label, icon, or line
style. Use palette tokens for all non-semantic chrome.

Use safe token pairings by default: draw `text` on `bg` or `paper`, and use
`accent` primarily for outlines, indicators, and highlights. Do not fill an
object with `text` and then label it with `text`, and do not assume `text`
contrasts with `accent`. Normal text must reach a 4.5:1 contrast ratio; large
text and essential non-text strokes must reach 3:1. Hard-coded black and white
are not substitutes for semantic tokens.

A simulation must visibly belong to every supported UI mode. Do not stop after
changing its colors. Adapt shape geometry, corner treatment, stroke weight,
line caps and joins, shadows, typography, decoration, and motion character.

Current modes follow these broad rules:

- `standard`: restrained geometry, moderate corners, thin strokes, and subtle
  depth;
- `neo`: square or polygonal geometry, mitered joins, moderately stronger
  outlines, one restrained hard-offset shadow on emphasized objects, and direct
  motion; and
- `playful`: circles and generous rounding, soft or chunky depth, friendly
  weight, and elastic motion where motion is not part of the scientific model.

UI mode changes rendering vocabulary, not scale or information density. Keep
semantic object bounds, label size, spacing, and hit targets the same across
modes except for small optical adjustments. In particular, `neo` does not mean
making everything larger, heavier, or shadowed. Do not stack shadows or combine
a thick border, nested frames, and a large offset shadow on the same element.

All modes share the same modern baseline. `standard` is calm and precise, `neo`
is sharper and more graphic, and `playful` is warmer and more rounded—not
juvenile or toy-like. Mode styling must reinforce the lesson rather than compete
with it.

For example, a decorative round marker may become an outlined square in `neo`
and a soft circle in `playful`. Preserve circles only when roundness encodes a
real concept, such as a radius or spherical body; adapt its outline, shadow,
line treatment, and surrounding chrome instead.

Centralize these decisions in one `getUiStyle()` or equivalent helper rather
than scattering string checks throughout the model. Call it while drawing, not
only at startup, because users can change the UI live.

Read `references/ui-language.md` before implementing or reviewing a visual
simulation. It derives the rules from the Pathfinder and QCD examples.

Make the simulation understandable without color alone. Use shape, position,
line style, labels, or a nearby prose explanation as a second signal.

Provide a descriptive Markdown alt/caption and explain non-obvious gestures in
the lesson. Pointer targets must remain usable on touch screens. Use pointer
events rather than separate mouse and touch implementations.

## Keep the model trustworthy

The visual model must preserve the concept it claims to teach:

- use the target lesson's formulation, notation, units, terminology, and sign
  conventions consistently;
- avoid introducing a concept or vocabulary before the lesson introduces it;
- separate pedagogical simplifications from implementation shortcuts;
- keep units and ranges internally consistent;
- make resets deterministic when comparison matters;
- avoid decorative motion that implies a false causal relationship; and
- label approximations in the lesson or caption.

Prefer the smallest interaction that exposes the important relationship. A
simulation is successful when the learner can form and test a prediction, not
when the canvas contains the most animation.

## Validate

For a lesson project:

1. Build the relevant lesson with `bunx mr-md build <lesson-or-directory>`.
2. Run it with `bunx mr-md dev <lesson-or-directory>`.
3. Inspect the browser console and the visible iframe error state.
4. Compare every visible label, symbol, formula, unit, and default against the
   context brief and target lesson.
5. Exercise every generated control and pointer gesture.
6. Inspect rendered screenshots at normal and maximized sizes and at narrow and
   wide viewports. Reject any clipped, overlapping, off-frame, or unreadable
   content.
7. Check the full cross-product of light/dark themes, all supported palettes,
   and every supported UI mode. Confirm that palettes update surfaces and
   accents while visual language—not layout scale—changes between UI modes.
8. Scroll the frame off screen and back; resumed motion must stay stable.
9. Exercise empty, minimum, typical, maximum, and long-label data states.

Visual inspection is mandatory for visual work. Automated builds and tests
cannot prove that content fits or has usable contrast. If a browser or
screenshot workflow is unavailable, say that visual validation remains undone
and do not report the simulation as complete. Use
`references/review-checklist.md` as the final acceptance checklist.

For changes to the mr-md repository:

1. Add or update focused tests for the changed contract.
2. Run `bun run test`.
3. Build and inspect the documentation example with `bun run build:docs` or
   `bun run dev:docs`.
4. When adding or redefining a global UI mode, update every bundled simulation,
   the starter asset, relevant screenshots or examples, and the visual-language
   reference in the same change.

Use `references/review-checklist.md` before declaring the work complete.

## Report the result

State:

- which lesson and simulation files changed;
- which lesson sections, glossary entries, or neighboring material established
  the notation and terminology;
- which controls and interactions were added;
- any intentional scientific or pedagogical approximation; and
- the build, tests, and browser states actually checked.

Do not claim visual validation if only a build or unit test was run.

