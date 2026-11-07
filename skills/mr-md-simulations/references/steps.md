# Guided steps

Use `type: "steps"` in the sibling config and embed the script normally, or use
`lesson.steps(path, options)`. `lesson.lab` also routes a steps config.
Copy `assets/steps.js` and `assets/steps.config.json` as a working starting pair.

## Authoring contract

Top-level fields include `steps`, `props`, `tunables`, `label`, `caption`,
`height`, `accent`, `dependencies`, `kicker`, `voice`, and `audio`.
Each step can supply:

- `id`, `title`, `target` (alias `badge`), and `instruction` (alias `prompt`);
- `hint` and `feedback`;
- `initialProps`, applied on entry and trial reset;
- `audio`, a recorded narration path or URL; and
- `voice`, speech-synthesis text.

Instructions, targets, hints, and feedback support rendered Markdown; instructions
can include LaTeX. Keep spoken text free of markup. Local step audio resolves
relative to the simulation and is bundled through the asset pipeline. Recorded
audio takes precedence over speech. Top-level `audio: false` removes recorded audio and hides narration controls;
`voice: false` removes speech and also hides narration controls. Check `src/renderer/blocks/steps.ts` for fallback
text generation before promising silence or automatic narration.

## Runtime hooks and state

Register `bkOnStep((index, step, props) => ...)` and `bkOnReset((index, step) => ...)`
once. The index is zero-based. Step selection and trial reset restore top-level props plus the current step
`initialProps`. Define common defaults at the top level and every step-dependent
difference explicitly; previous trial edits are discarded on entry/reset. Initialize model
state from the supplied props, not only from module-start values. Reset position,
velocity, elapsed time, drag state, and the local completion guard on each trial.

Use `bkSetup` for drawing. A draw also occurs while paused: advance the model only
when `window.__loop` is true. Report success once per trial with
`bkCompleteStep("feedback")`; object form supports `{stepIndex, feedback, voice}`.
Do not emit completion on every rendered frame. Completion records success; do
not assume it automatically advances the learner to the next step.

The host supplies play/pause, trial reset, hints, narration, and navigation.
Space toggles playback, R resets, arrows navigate, and progress dots allow jumps.
Do not implement a competing set of controls or assume strict sequential gating.

## Verify

Build and inspect the actual lesson. Test first entry, every step, arbitrary jumps,
revisits, reset before and after success, repeated success, pause/resume, host prop
updates, and long instructions. Verify the host controls match step defaults.
Test audio enabled/muted, blocked playback, and unavailable speech synthesis;
visible instructions must be sufficient. Listen to narration before claiming
sound quality. Check console, narrow/fullscreen layouts, and live appearance.

Source: `src/types.ts`, `src/renderer/blocks/steps.ts`, `steps-iframe.ts`,
`src/client/steps.ts`, and `test/steps.test.ts`.


## Shared workspace and typed runtime

Keep steps inline interactive with their instructions, hints, and progress.
Do not convert them into block-style thumbnails as a side effect of shared
workspace changes. Expansion isolates the lesson and contains keyboard focus;
closing pauses the trial and narration without erasing solved progress.

The optional `defineSimulation` runtime works in steps too. `sim.onReset` adapts
the existing trial-reset lifecycle, receiving current trial props. Continue to
use `bkOnStep` for step initialization and `bkCompleteStep` for success. Register
one reset path per model, rather than both `bkOnReset` and `sim.onReset` for the
same callback. `sim.deltaTime()` keeps physics paused during redraws. Never
reload a steps iframe for a normal trial reset: that would lose the activity
lifecycle and its model callbacks.
