# Simulation visual-language contract

An mr-md simulation is part of the page's UI. It must react to a UI-mode change
as thoroughly as cards, controls, callouts, and navigation do.

Every mode starts from a modern, neat, restrained baseline. Aim for the clarity
and finish associated with high-quality contemporary product design. Teenage
Engineering and Apple are reference points for functional industrial clarity,
disciplined organization, controlled playfulness, strong hierarchy, crisp
typography, purposeful motion, and very little accidental chrome. Extract those
principles without imitating either company's branding or trade dress, and do
not apply glass, gradients, blur, and floating cards indiscriminately.

Theme, palette, and UI language are independent:

| Host setting | Simulation API | What it changes |
| --- | --- | --- |
| Theme | `bkThemeMode()`, `bkColor()` | Light/dark contrast |
| Palette | `bkColor()` | Backgrounds, surfaces, lines, text, and accents |
| UI mode | `bkUi()` | Shape, corners, outlines, depth, type, decoration, and motion character |

Current palettes are:

```text
ink, field, ember, elixir, trunk, lava
```

Use semantic color tokens instead of branching on those names. Palette changes
then propagate through `bkColor("bg")`, `bkColor("paper")`,
`bkColor("line")`, `bkColor("line-strong")`, `bkColor("text")`,
`bkColor("text-light")`, `bkColor("accent")`, and
`bkColor("accent-soft")`.

Do not implement UI-mode reactivity as a color swap, and do not defeat palette
reactivity with hard-coded decorative colors.

## Current visual languages

Use the host CSS in `src/styles/theme.css` as the source of truth. At the time
this reference was written, the modes translate into these canvas traits:

| Trait | `standard` | `neo` | `playful` |
| --- | --- | --- | --- |
| Geometry | Clean, restrained, moderately rounded | Square, angular, or polygonal | Circular and generously rounded |
| Corners | Small or moderate radius | Zero radius | Large radius |
| Outlines | Thin and quiet | Thick and high contrast | Chunky but softer |
| Line caps/joins | Usually round | Square and miter | Round |
| Depth | Minimal or soft blur | Hard offset shadow | Soft or chunky offset depth |
| Typography | Neutral medium weight | Bold, compact, or mono where useful | Friendly heavy weight |
| Motion | Restrained easing | Direct, stepped, or minimal overshoot | Elastic or bouncy when pedagogically safe |
| Decoration | Sparse | Graphic blocks and strong borders | Friendly shapes and soft accents |

These are semantic design rules, not permission to exaggerate a mode. Match the
current host CSS rather than copying this table forever.

`playful` may be warm, rounded, and lively while remaining deliberate and
precise. `neo` may be bold and graphic, but not a dense brutalist dashboard.
`standard` should be quiet and polished, not generic or unfinished.

The model layout, information density, type size, and hit-target bounds stay
stable across modes. As a default budget, use 1.5–2 logical pixels for normal
outlines, 3 for emphasis, and no more than 4. Keep a hard shadow near 4 logical
pixels and never above 6. Optical size adjustments should remain within 5%.
Render at most one hard-shadow silhouette per emphasized object.

In particular, `neo` does not mean “make every object large and black.” Do not
stack shadows, shadow nested children, or combine thick outer and inner frames
with thick object borders. Prefer a `paper` fill, `accent` or `line-strong`
outline, and `text` label over a same-color fill-and-label pair. Include the
shadow in the object's layout bounds.

## Lessons from the bundled examples

### Pathfinder

`mr-markdown-documentation/sims/pathfinder.js` demonstrates several levels of
adaptation:

- walls use a thick rectangular outline and hard offset shadow in `neo`;
- cells use rounded rectangles in `playful`;
- standard cells remain flat and restrained;
- start/end markers become circles in `playful`, outlined squares in `neo`, and
  inset squares in `standard`; and
- path lines use square caps and miter joins in `neo`, versus rounded treatment
  elsewhere.

This is the target principle: the grid algorithm and learner state remain the
same while the rendering vocabulary changes.

### QCD

`mr-markdown-documentation/sims/qcd.js` shows how to preserve domain meaning
while adapting style:

- the proton shell becomes an angular polygon in `neo` instead of a smooth
  circle;
- quarks retain meaningful particle geometry but gain a hard offset shadow and
  strong outline in `neo`; and
- standard rendering uses blurred depth and an inner highlight instead.

Not every circle must become a square. If circular geometry carries scientific
meaning, preserve it and change its border, shadow, highlight, label, and
surrounding structure.

## Implementation pattern

Centralize mode decisions in a style descriptor:

```js
function getUiStyle() {
  switch (window.bkUi()) {
    case "neo":
      return {
        markerShape: "square",
        cornerRadius: 0,
        lineWidth: 3,
        lineCap: "square",
        lineJoin: "miter",
        shadow: "hard",
        shadowOffset: 4,
        motionScale: 0,
      };
    case "playful":
      return {
        markerShape: "circle",
        cornerRadius: 18,
        lineWidth: 3,
        lineCap: "round",
        lineJoin: "round",
        shadow: "chunky",
        shadowOffset: 5,
        motionScale: 1.5,
      };
    default:
      return {
        markerShape: "rounded-square",
        cornerRadius: 8,
        lineWidth: 2,
        lineCap: "round",
        lineJoin: "round",
        shadow: "soft",
        shadowOffset: 3,
        motionScale: 1,
      };
  }
}
```

Call the helper from the draw path. Keep model calculations independent from
the returned style. Drawing helpers should accept the descriptor rather than
querying `bkUi()` repeatedly in unrelated branches.

Split visual elements into two categories:

1. **Semantic geometry** represents the concept: an orbit, vector direction,
   graph coordinate, particle radius, or measured angle. Do not distort it.
2. **UI geometry** communicates interaction and hierarchy: handles, markers,
   cards, labels, walls, selection rings, shadows, and decoration. Adapt it
   fully.

## Adding or redefining a host UI mode

A core UI-mode change is incomplete until simulations change with it:

1. Inspect the new mode in `BuildOptions["ui"]`, `src/styles/theme.css`, and
   `src/client/theme.ts`.
2. Write down its geometry, corner, stroke, depth, type, and motion rules.
3. Ensure `bkUi()` exposes the mode to iframes.
4. Add an explicit branch to every bundled simulation and starter asset.
5. Update this reference and public simulation documentation.
6. Test each simulation in the complete theme × palette × UI matrix.

An authored simulation may use `standard` as a safe fallback for an unknown
future mode. When changing mr-md core to add that mode, relying on the fallback
is not acceptable; bundled simulations must handle it intentionally.
