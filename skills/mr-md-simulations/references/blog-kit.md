# Blog Kit rendering

Use this workflow for chapter-wide renderer work. For a lesson experiment,
keep the script and its sibling config as the authoring surface.

`mrmd.config.json` selects the chapter engine. `simulation.engine` receives
block simulations, worlds, and animations. `testing.engine` receives quizzes
and guided steps. Omit the engine or select `"default"` to use the built-in
renderer. Built-in `simulation.settings` accepts no custom keys. For a
replacement, chapter and lesson `settings` supply engine-specific values.
The sibling config still owns each simulation's props, tunables, actions,
presets, telemetry, measurements, dimensions, label, and caption.
An authored block `height` sets the collapsed preview height in pixels.
Without it the preview is 16:9. `open: "workspace"` is accepted and optional.
`open: "inline"` is invalid.

A replacement module exports a synchronous `render({ block, index, settings,
options })` returning `{ html, css?, js?, navItems? }`. The block carries the
normalized companion fields. An optional synchronous `schema.parse(settings)`
validates the engine's own settings. Local module paths resolve within the
chapter directory. A package engine must already be installed. Custom
implementations run at build time, and their HTML and module JS run in the
browser. Escape authored text in output and keep secrets out of browser assets.

Inspect which behavior the replacement owns before relying on built-in
sandboxing, host controls, measurement windows, device rules, or workspace
navigation. Chapters with replacement engines use full-document navigation so
each lesson loads the selected assets. Verify a build, direct navigation,
and previous/next transitions with the intended engine.

In the mr-md checkout, read `docs/blog-kit.md`, `docs/blog-kit-reference.md`,
`src/blog-kit/sections.ts`, and `src/blog-kit/configured.ts`. See
`playground/blog-kit/compare/` for stock and replacement chapter builds.
