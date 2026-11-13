# Oscillator timeline audit

The canonical documentation source is `mr-markdown-documentation/sims/oscillator.js`
and its sibling config. `05-creating-simulations.md` embeds that source twice.
`scripts/copy-doc-assets.ts` copies textures only; it does not generate or replace
oscillator assets. No copy-script change is needed.

The learning objective remains comparing spring-mass motion under different damping
regimes and repeated impulses. Existing displacement x (m), velocity v (m/s), mass
(kg), stiffness (N/m), damping (N·s/m), and damping ratio conventions are preserved.
The existing numerical physics model is unchanged.

## Confirmed defects and fixes

- Config omitted `timeline`, and neither snapshot handler existed. The new browser
  regression initially failed with `undefined` for both timeline opt-in and the
  restore handler. Config now explicitly enables timeline. Capture and restore
  include model parameters, time, trajectory history, impulse highlight, and drag
  appearance. Props and history are copied. Live pointer capture is released on
  restore; playback clears a historical drag appearance without resuming a gesture.
- Direct `bkTelemetry` calls bypassed the snapshot cache. The new regression found
  `saved.telemetry.displacement === undefined`. Publishing through
  `sim.publishTelemetry` records measurements alongside exact state.
- After `bk:pause`, `bk:snapshot-restore` with `resumePlayback: true` started the
  canvas loop but left `defineSimulation`'s private playing flag false. A fixed-clock
  browser repro recorded 0.224 seconds both before and after resumed draws.
  `src/simulation.ts` now synchronizes playback and clears its delta clock on restore.

## Verification

- New browser harness: explicit opt-in, both handlers, capability query, foreign
  source rejection, five reset/restore cycles, identical restored PNG data, copied
  trajectory state, deterministic continuation, telemetry presence, and resumed time.
- New lifecycle harness: 30 cycles covering pause/play/reset, foreign reset rejection,
  restored playback, guided-step handoff, runtime-ready query, disposal, and delta
  clamping semantics. Existing runtime and measurement snapshot suites also pass.
- Framework and documentation builds pass. Type checking passes.
- Full suite: 352 pass, one E2E failure. The E2E hard-codes port 3005; the preview
  occupied it, so readiness accepted the wrong server and lesson navigation returned
  404. After moving preview to port 3015, the isolated E2E rerun passed (13 assertions).
- Managed headless Chromium uses `--no-sandbox --disable-gpu
  --disable-dev-shm-usage`. Live documentation workspace, Timeline tab, and camera
  capture rendered successfully. Camera produced a Saved snapshot with measurements.
- Shared preview screenshot timed out twice; managed Puppeteer supplied visual
  inspection. Preview is left running at http://localhost:3015/creating-simulations.html.

## Audit scope and remaining checks

Snapshot and authoring-runtime messages reject sources other than the parent.
Host telemetry resolves messages to registered iframe windows before consuming them.
No new injection, path traversal, credentials, or authorization surface was added.

The lifecycle harness covers SDK step/world playback notifications, not complete
browser navigation between steps and worlds. Reload/route theme persistence and
full theme/palette/UI combinations were not exhaustively exercised. No defect in
those paths is claimed. Workspace/router/world and inspector files were not edited.
