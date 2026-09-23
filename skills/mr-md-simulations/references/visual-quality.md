# Simulation visual-quality gates

Use these gates before considering an mr-md simulation complete. They are
requirements, not optional polish.

## Use a modern, restrained baseline

The scene should feel current, intelligent, precise, energetic, and easy to
scan. Use excellent contemporary physical and digital product design as the
quality bar, not a generic back-office dashboard.

Treat Teenage Engineering and Apple as examples of design principles, not
templates to copy:

- a clear focal point and obvious visual hierarchy;
- disciplined grids, alignment, and spacing;
- crisp typography with few sizes and weights;
- functional forms whose purpose is visually understandable;
- restrained, playful accent colors used to distinguish meaning;
- generous but efficient negative space;
- restrained use of depth and accent color;
- immediate, direct interaction feedback; and
- smooth, purposeful motion that communicates a change.

Teenage Engineering contributes industrial precision, visible function,
compact organization, and controlled playfulness. Apple contributes clarity,
hierarchy, finish, and restraint. Do not copy either company's branding,
products, control layouts, icons, or trade dress. Do not translate “modern”
into translucent panels everywhere, blurred glass, gradients on every object,
glowing edges, floating cards, or excessive animation. Those are trends, not a
design system.

Prefer removing chrome over decorating it. A simulation usually needs one
primary scene, a small number of labels or readouts, and no internal app shell.
Avoid card-within-card compositions, repeated outlines, ornamental headings,
emoji, achievement badges, and childish mascot styling unless the lesson
explicitly requires them.

mr-md owns the surrounding title, control layout, inputs, fullscreen action,
frame, caption, theme, palette, and UI mode. Use generated controls and semantic
tokens so those details remain synchronized. The canvas owns only the
educational scene and direct spatial interaction.

## Keep controls in the host

The simulation frame is a visualization surface. The host already renders the
lab title, controls, fullscreen action, and caption.

Use sibling-config tunables for every non-spatial input:

| Need | Host control |
| --- | --- |
| Continuous value | `range` |
| Exact numeric value | `number` |
| Text, formula, query, or comma-separated values | `text` |
| On/off mode | `boolean` |

Do not add DOM or canvas-drawn form fields, toggles, selects, toolbars, or
ordinary action buttons inside the frame. Do not visually imitate an input.
Direct canvas interaction is for spatial acts such as dragging, placing,
drawing, tracing, or selecting a visual object.

Adapt the interaction to the host contract. A set simulation, for example, can
accept `Set members` as comma-separated text and `Test element` as another text
prop. It should render the set and membership result, not implement another set
editor inside the canvas.

If the available controls cannot express the essential interaction, stop and
surface that limitation. Extending mr-md once is preferable to inventing a
different in-frame control system in every simulation.

## Establish a layout contract

Before rendering, define a safe rectangle:

```js
const insetX = width * 0.08;
const insetY = height * 0.08;
const safe = {
  left: insetX,
  top: insetY,
  right: width - insetX,
  bottom: height - insetY,
};
```

Six percent per edge is the minimum. Use 8% when labels, hard shadows, animated
pulses, or maximized display make edge contact likely. The safe rectangle is
not a border to draw; it is the region that must contain all essential content.

For each visual element, include all of these in its bounds:

- shape extent;
- half the stroke width;
- shadow offset and blur;
- label width, ascent, and descent;
- animation or pulse amplitude; and
- pointer target padding.

Clamp draggable objects using those complete bounds, not only their center.
Decorative background marks may cross the safe rectangle only when losing them
does not alter meaning.

## Layout dynamic content deliberately

Canvas coordinates are not a layout system. Build one small layout pass before
the draw pass:

1. normalize the model values;
2. measure text with the final font;
3. calculate rows, columns, and bounded element boxes;
4. resolve label placement and collisions;
5. verify every complete bound is inside the safe rectangle; and
6. render from that layout without changing positions.

Test at least:

- empty state;
- one item;
- typical state;
- maximum supported item count;
- longest realistic label or notation;
- minimum and maximum numeric values; and
- every toggle combination.

Use a bounded grid, wrapping, truncation with an explained full value, or a
summary such as `+ 8 more` when data exceeds the available region. Never let a
loop keep adding marks beyond the frame, and never hide overflow by making text
too small to read.

The host frame can change size or enter maximized mode. The logical model must
remain stable and the complete scene must remain visible. Do not stretch model
coordinates independently in $x$ and $y$, and do not reset learner state on
resize.

## Preserve layout across UI modes

`standard`, `neo`, and `playful` are rendering vocabularies over the same
information architecture. Switching modes must not move content out of frame,
remove data, or materially change density.

Use these default budgets unless the host CSS or a bundled reference requires a
different value:

| Trait | Budget |
| --- | --- |
| Normal outline | 1.5–2 logical px |
| Emphasized outline | 3 logical px; 4 maximum |
| Hard shadow offset | 4 logical px; 6 maximum |
| Corner/style optical size change | no more than 5% |
| Typography size change between modes | none |
| Hard shadows | one silhouette per emphasized object |

For `neo`:

- prefer square corners, miter joins, strong but bounded outlines, and a small
  hard offset;
- do not enlarge every object;
- do not shadow every nested child;
- do not stack multiple hard shadows;
- do not combine a heavy outer frame, heavy inner frame, and heavy object
  shadow; and
- ensure the shadow is included in layout bounds.

For `playful`, generous rounding and friendly depth still obey the same bounds.
Bounce or pulse amplitude must be included in layout calculations and must not
distort scientific motion.

Inspect the actual Pathfinder and QCD sources when they are available. Copy
their restraint and separation of semantic geometry from UI treatment, not
their subject-specific coordinates.

## Enforce contrast

Use semantic token pairs:

- `bg` or `paper` for surfaces;
- `text` for text on those surfaces;
- `line` or `line-strong` for structure; and
- `accent` for emphasis, selection, and outlines.

Do not assume `text` is readable on `accent`, or that a domain color is readable
on every palette. Never use the same token for a fill and the label drawn over
it. Avoid hard-coded `#000`, `black`, `#fff`, and `white` for non-semantic UI;
they commonly fail after a theme or palette change.

Acceptance thresholds:

- normal text: contrast ratio of at least 4.5:1;
- large text: at least 3:1;
- essential boundaries, vectors, focus marks, and graph lines: at least 3:1
  against adjacent colors; and
- information carried by color: a second signal such as shape, label, pattern,
  or line style.

Read `bkColor()` during drawing. Check contrast in both themes and all palettes;
do not infer dark-mode behavior from a light screenshot.

## Screenshot gate

Build success is necessary but not sufficient. Render and inspect the result.

Minimum visual matrix:

1. light and dark themes;
2. every supported palette;
3. `standard`, `neo`, and `playful`;
4. normal and maximized frame states;
5. narrow and wide page widths; and
6. typical plus worst-case data.

Use representative screenshots to cover the full matrix efficiently, but every
combination must be exercised. Compare modes side by side so accidental scale,
spacing, or density changes are obvious.

Reject the simulation if any of these are true:

- essential content touches or crosses the frame;
- a title, caption, fullscreen action, or host control is duplicated in canvas;
- unnecessary cards, panels, borders, gradients, glows, or decorations compete
  with the educational model;
- the visual tone is unintentionally juvenile or styled like a dense admin
  dashboard without a lesson-specific reason;
- text overlaps a shape, another label, or a frame edge;
- dark or light mode makes text disappear;
- a palette change leaves hard-coded decorative chrome behind;
- `neo` becomes a collection of oversized boxes and stacked shadows;
- a mode change alters the data layout rather than its visual language;
- long labels or maximum data overflow;
- a pointer target extends outside the usable scene; or
- the result was never viewed in a browser.

If browser inspection is unavailable, report the work as awaiting visual
validation rather than complete.
