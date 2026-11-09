# Measurements lab

Open `spring-lab.md` with mr-md to explore the damped spring oscillator. Drag the mass or use arrow keys, and adjust mass, stiffness, and damping in host controls. Select measurements to display scene guides, open floating graphs, and use the Timeline to inspect milestones and branch experimental runs.

From the repository root:

```sh
bun run build
bun dist/cli.js dev playground/measurements-lab/spring-lab.md
```

## Exploring the lab

- **Scene guides**: Click measurement rows (such as Velocity, Displacement, or Force) in the Measurements tab to toggle spatial guides. Multiple guides can remain visible simultaneously.
- **Floating graphs**: Open graphs by clicking graph icons next to telemetry items. Graph windows can be moved, minimized, restored, and closed. Viewing preferences survive trial resets within the session.
- **Timeline and snapshots**:
  - Click the **Capture snapshot** button in the playback bar to save the exact instantaneous physical state ($x$, $v$, $t$, controls, and energy).
  - Milestone events (such as equilibrium crossings declared in `spring.config.json`) record to the Timeline automatically.
  - In the Timeline tab, click any snapshot node to freeze time and inspect past physical conditions. The mass, sliders, and telemetry revert to the saved state.
  - To resume without branching, click **Back to live** in the Timeline panel.
  - To test an alternative hypothesis, modify any slider (e.g. increase damping), drag the mass, or click **Resume** / press `Space`. When continuing from an ancestor milestone, the system automatically creates a branch rail; continuing from the active branch head extends the current run.
  - Original futures remain preserved on their own rails and can be revisited by clicking their milestones.

## Configuration contract

Initial scene guides, graph layout, and snapshot history options are declared under `measurements` and `telemetry` in `spring.config.json`:

- `measurements.timeline`: controls milestone history and manual capture (`{ start: true, present: true, controls: true, capture: true }`).
- `telemetry.<key>.notifications`: records automatic milestone events (use `toast: false` for silent timeline checkpoints).
- Snapshot states, active branches, and graph samples are retained in memory during the active session. They reset upon trial reset (`R`) or page reload.
