---
name: mr-md-simulations
description: Author, debug, and review mr-md lesson simulations and their host runtime. Covers block labs, guided steps, immersive worlds, companion configs, measurement graphs, scene guides, saved moments, and Blog Kit simulation renderers.
metadata:
  author: chirayuChhabra
  version: "1.6.0"
---

# Build mr-md simulations

Read the complete target lesson and the relevant chapter, notation, glossary,
and adjacent material. Identify what the learner should predict, change, and
observe at the embed. Use the lesson's terminology, equations, units, signs,
bounds, and initial conditions in the model, labels, graphs, and controls. Use
[context-grounding.md](references/context-grounding.md) for the context brief.
Preserve the author's existing prose, examples, equations, and formatting. When
adding a simulation, change the lesson only where the embed belongs. Flag
possible source errors for the author.

Check the mr-md version the lesson uses and read a nearby example with its
companion config. In the runtime repository, use the implementation and tests
to resolve discrepancies between older docs and current behavior.

## Choose the presentation

| Format | Use it when | Authoring path |
| --- | --- | --- |
| Block | The learner explores a bounded model or diagram | `"type": "block"`, `lesson.lab()`, `bkSetup` for 2D |
| Steps | The learner works through goals, hints, and feedback | `"type": "steps"`, `lesson.steps()` or `lesson.lab()`, [steps reference](references/steps.md) |
| World | The learner navigates an explorable space entered through a portal | `"type": "world"`, `lesson.world()`, `bkSetupWorld` for 2D or a custom renderer, [worlds reference](references/worlds.md) |

Embed a JavaScript or TypeScript source with descriptive Markdown image syntax,
such as `![Explore orbital motion](./sims/orbit.js)`. Put its explicit `type`
and settings in the same directory in `orbit.config.json`. Copy the
corresponding pair from `assets/` into the lesson project when useful.

Choose the renderer independently of presentation. A canvas scene with projected
3D geometry can still use a block lab and `bkSetup`, as the bundled oscillator
does. Use a custom renderer when the scene needs WebGL or its own camera and
drawing loop. See [runtime and UI](references/runtime-and-ui.md) for supported
APIs, device behavior, and the source map. When a task changes chapter-wide
rendering in `mrmd.config.json`, read [Blog Kit rendering](references/blog-kit.md).

In the bundled examples under `mr-markdown-documentation/sims/`, use
`circular-motion.js` for a block without an inspector, `pathfinder.js` for
spatial editing, and `oscillator.js` for a projected apparatus and measurement
graphs. Use `minimal.world.js` for host-managed 2D and
`solarsystem.world.js` for a custom world.

## Build the scene

- Keep conditions, model units, and simulated time independent of viewport
  dimensions. `bkSetup(draw)` normally uses a fixed 800 × 450 logical scene,
  scales it uniformly, and exposes the full background bounds in the fourth
  draw argument. Read the framing contract before choosing custom dimensions.
- Use `defineSimulation` for new block and step scripts. Register one reset
  path and initialize listeners once. Use `sim.deltaTime()` once per draw.
  A paused redraw can reflect a direct edit, setting change, or new appearance
  while leaving simulation time and automatic motion frozen.
- Use generated settings, actions, and presets for parameters and other
  non-spatial inputs. Keep primary controls tied to the learning goal and put
  secondary controls in `advancedControls`. Use the scene for spatial actions
  such as dragging or picking, with pointer cancellation and keyboard access
  where applicable. Playback and reset belong to the host.
- Use host Measurements for computed values, time plots, X/Y plots, threshold
  states, and events. Draw optional guides where they explain the scene. Read
  [measurements and graphs](references/measurements.md) for the config and
  publishing contract. For exact inspection and continuation, read
  [saved moments](references/saved-moments.md) before implementing model state
  capture.
- Use semantic `bkColor` tokens and live `bkUi` styling. Preserve geometry
  that carries scientific meaning, scene bounds, label sizes, and target sizes
  across appearance modes. Give essential colors a second signal such as
  line style, shape, or text. Plan content bounds and visual checks with
  [visual quality](references/visual-quality.md) and
  [UI language](references/ui-language.md).

## Verify in the lesson

Build with `bunx mr-md build <lesson-or-directory>` and preview with
`bunx mr-md dev <lesson-or-directory>`. In the mr-md repository, use focused
tests for runtime changes and run `bun run test` for the full build, docs,
test, and typecheck workflow. Use [the review checklist](references/review-checklist.md)
to exercise the actual scene, controls, lifecycle, and appearance.

Check collapsed and expanded states, a narrow supported layout, and tablet
touch and rotation when applicable. Phones display an Open on desktop notice
and defer simulation frames. On visual changes, inspect the rendered result
and open the local preview for the user. Report the lesson and simulation files
changed, teaching assumptions that affect the model, and the browser and
automated checks completed.
