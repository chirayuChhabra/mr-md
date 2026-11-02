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
once. The index is zero-based. Step selection merges props rather than clearing
all old values: define every step-dependent default explicitly. Initialize model
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
