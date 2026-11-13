# Simulation regression audit

Scope: shared block and guided simulation runtime, expanded workspace, inspector assets, saved states, graph visibility, navigation, and desktop/tablet layout. The audit includes the two regressions reported in screenshots and their related integration paths.

## Confirmed defects repaired

| Defect | Cause and repair | Regression coverage |
| --- | --- | --- |
| Browser-default Measurements and Saved controls | Chapter pages loaded only the base CSS. Shared assets now contain the same combined stylesheet as standalone pages. | `page-packaging.test.ts` checks the generated stylesheet equals `pageCSS()`. |
| Simulation confined to a horizontal strip | Host CSS forced the iframe to its original aspect ratio. The runtime now receives the full available viewport; logical coordinates and uniform drawing scale are preserved. | Fixed canvas and tablet browser tests. |
| Sidebar covered the canvas and graph windows | Expanded workspaces inherited the open lesson sidebar. Entry now closes it temporarily, and exit restores its prior state. Explicit reopening remains available. | Workspace lifecycle browser test, including desktop and tablet restoration. |
| Invisible desktop navigation retained keyboard focus | Desktop collapse changed presentation without making the sidebar inert. Toggle, legacy collapse, and expand controls now synchronize accessibility state. | Workspace lifecycle browser test. |
| Same-page links failed to leave the simulation correctly | Breadcrumb capture swallowed real links, while the router's hash branch skipped workspace cleanup. Links now reach the router, close the workspace, replace its temporary history entry, and reach the requested section. | Workspace lifecycle browser test checks hash, scrolling, and history cleanup. |
| Restored state retained later measurements | Snapshot restoration left the old telemetry cache in place. A successful restore now replaces it before redraw. Failed handlers leave the cache unchanged. | Both block and guided snapshot browser tests. |
| Exact restoration advanced the model during redraw | `deltaTime()` advanced while the runtime was restoring. It now returns zero and clears its clock during restoration. | Deterministic browser regression for both frame variants. |
| Numeric setup accepted invalid canvas dimensions | Numeric overloads lacked the callback overload's validation. All setup forms now reject non-positive and non-finite dimensions. | Canvas setup tests cover all overloads. |
| Invalid image data could throw during snapshot download | The PNG data URL check accepted malformed Base64. It now rejects invalid grouping and padding before decoding. | Measurement file validation tests and snapshot export browser tests. |
| Tabs could erase saves or resurrect deleted states | Each timeline wrote its full stale collection. Built-in storage now applies changed and deleted IDs in one IndexedDB transaction. Unchanged stale pagehide writes do nothing. Queued saves retain their own baselines. | Cross-tab saves, deletion, stale rename/pagehide, and queued concurrent saves. |

## Verification

`bun run test` passes: framework build, documentation build, 429 tests across 64 files (3,106 assertions), and TypeScript checking. `git diff --check` passes.

The generated documentation examples were exercised across 1440 × 1000, 1024 × 768, and 820 × 1180 viewports. Four block/guided examples, two themes, six palettes, and three UI modes produced 432 layout checks with no JavaScript runtime errors. These checks cover iframe fill and workspace overflow; they are not contrast measurements. The rebuilt oscillator workspace was also inspected visually with its graph and Measurements panel visible.

Managed Puppeteer Chromium ran headlessly with `--no-sandbox`, `--disable-gpu`, and `--disable-dev-shm-usage`.

The local preview remains available at http://localhost:4173/creating-simulations.html. The shared computer-use browser host was unavailable; visual inspection used managed Chromium screenshots.

Cross-tab saved-state lists refresh after a local mutation or reload. The storage fix protects saved data without adding live cross-tab UI synchronization.
