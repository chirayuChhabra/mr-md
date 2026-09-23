# Simulation review checklist

Use the sections relevant to the task. Record what was actually checked rather
than marking untested behavior as complete.

## Lesson context

- The complete target lesson was read before implementation.
- The simulation's position in the lesson and teaching sequence is understood.
- Relevant chapter, glossary, notation, and adjacent lesson context was checked.
- A context brief records exact terms, symbols, formulas, units, conventions,
  defaults, and intended takeaway.
- Visible labels and instructions use the author's terms and capitalization.
- Formulas use the lesson's exact formulation and variable names.
- Units, coordinate orientation, signs, constants, and initial conditions match
  the lesson.
- The simulation does not introduce unexplained vocabulary or future concepts.
- Local terminology is preserved even when a more common synonym exists.
- Ambiguity or conflicting source material was clarified rather than guessed.

## Learning experience

- The lesson states a specific learning objective.
- The learner can predict, manipulate, and observe a meaningful relationship.
- The simulation does not imply false precision or causality.
- Simplifications and unusual units are explained.
- The caption or surrounding prose explains non-obvious gestures.

## mr-md integration

- The lesson embeds the local `.js` or `.ts` source with descriptive text.
- The sibling config basename matches the simulation basename.
- Every tunable has a correctly typed default prop.
- Every tunable uses the lesson's exact terminology, notation, and unit.
- Generated host controls are used for settings and modes.
- Text and numeric input use generated host controls too.
- No form fields, toggles, selects, ordinary buttons, toolbars, or fake inputs
  are drawn or mounted inside the simulation frame.
- Spatial interactions remain inside the canvas.
- The simulation does not attempt to access the host DOM.

## Runtime behavior

- `bkSetup` owns the drawing lifecycle.
- Event listeners are registered only once.
- Pointer positions use `bkCanvasPoint`.
- Pointer capture or cancellation cannot leave drag state stuck.
- Frame deltas are clamped after pause/resume.
- Prop changes have an immediate visible result.
- Resize does not reset important learner state unexpectedly.
- Errors are absent from both the host and iframe consoles.

## Visual and accessible communication

- The scene has a modern, neat, restrained baseline informed by excellent
  contemporary product design.
- Teenage Engineering and Apple are treated as principle-level reference points
  for industrial clarity, controlled playfulness, hierarchy, and polish—not as
  branding or trade-dress templates.
- The educational model is the obvious focal point.
- Hierarchy comes from alignment, spacing, type, and restrained emphasis rather
  than unnecessary containers or decoration.
- The simulation avoids gratuitous glass, gradients, glow, nested cards, emoji,
  badges, and ambient animation.
- `playful` remains warm, deliberate, and precise rather than arbitrary.
- The host title, controls, fullscreen action, and caption are not duplicated
  inside the canvas.
- A safe content rectangle of at least 6% per edge was defined before layout.
- Every essential shape, stroke, shadow, label, animation extent, and hit target
  remains inside the safe rectangle.
- Empty, one-item, typical, maximum-data, and long-label states fit without
  overlap or clipping.
- Dynamic text is measured and wrapped, truncated, or laid out in a bounded
  grid.
- Colors come from supported `bkColor` tokens where appropriate.
- `text` is drawn on `bg` or `paper` by default; fill and label never use the
  same token.
- Normal text reaches 4.5:1 contrast and large text or essential strokes reach
  3:1.
- Light and dark themes remain legible in every palette and UI mode.
- `ink`, `field`, `ember`, `elixir`, `trunk`, and `lava` visibly update
  simulation surfaces, lines, text, and accents.
- Decorative colors do not override the active palette.
- Domain-specific colors have a non-color signal and sufficient contrast in
  every palette.
- Every supported UI mode has an intentional visual treatment.
- Switching UI mode visibly updates geometry, strokes, corners, and depth—not
  only colors.
- `neo` uses deliberate sharp or polygonal forms, bounded outlines, and at most
  one restrained hard shadow per emphasized object.
- `neo` does not enlarge all content, stack shadows, or combine heavy nested
  frames.
- `playful` uses deliberate rounding and softer or chunkier depth where domain
  geometry permits.
- UI modes preserve the same layout, type size, information density, and usable
  bounds.
- Scientifically meaningful geometry remains accurate while its visual
  treatment adapts.
- UI decisions are centralized rather than scattered through model code.
- UI and theme values are read during drawing so live changes redraw correctly.
- Meaning is not conveyed by color alone.
- Text has adequate size and contrast.
- Targets are usable with touch and at narrow viewport sizes.
- Motion is purposeful and not unnecessarily distracting.

## Performance

- Per-frame code avoids avoidable allocation and repeated DOM queries.
- Expensive calculations run only when their inputs change.
- The simulation pauses and resumes without a large state jump.
- External dependencies are justified and load before use.

## Verification

- The relevant lesson builds successfully.
- Every visible term, symbol, formula, and unit was compared with the context
  brief and source lesson.
- Every control boundary and toggle state was exercised.
- Pointer gestures were checked with mouse and a narrow/touch-like viewport.
- The light/dark × palette × standard/neo/playful matrix was checked.
- Rendered screenshots were inspected at normal and maximized sizes.
- Screenshots include representative worst-case data and long labels.
- No visual work is reported complete when browser inspection was unavailable.
- Repository tests were run when the runtime contract changed.
- The final report distinguishes automated checks from visual inspection.


