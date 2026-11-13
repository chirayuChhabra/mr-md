# Mobile and tablet experience

## Phone reading and navigation

Course builds share versioned CSS, a client bundle, and a phone route bundle. The phone shell navigates without reloading HTML and keeps visited lesson DOM, editor drafts, output, and scroll positions. Continue learning returns to the last lesson. Next and Previous replace the lesson history entry, so browser Back returns to the course. Search and drawer overlays have separate history entries and close before changing the underlying route.

The toolbar uses the selected page palette. Lessons have Back at the left; Appearance and Search retain their positions on the right across the homepage and lessons. Scrolling down hides the toolbar; scrolling up, focusing an editor, or opening a control reveals it. Small scroll movements do not toggle it.

Contents appears only inside lessons, as a floating pill 48px above the bottom safe area. It lists headings from the current lesson. Drawers lock background scrolling, trap keyboard focus, support dismissal, and restore focus to their trigger.

Search opens in a popup over the current page. Its screen anchor stays fixed when the keyboard opens; the available results height shrinks. Homepage search covers the course; lesson search covers the current lesson. Results group by lesson, rank matching sections, highlight query words, and navigate to the matching passage. Closing, Escape, browser Back, and result selection preserve route history.

Standalone lessons retain their existing toolbar, theme control, and contents drawer. Shared chapter pages use a course-root base so nested lesson paths retain assets and navigation after route changes. Hash-only navigation resolves against the current lesson. Build output rejects slugs that escape the output directory.

## Lesson content

Simulations show an Open on desktop notice on phones. The route bundle removes their runtime frames and preserves ordinary video embeds and inert quiz data. Quiz behavior remains unchanged.

Code uses the desktop code-surface colors against the selected page background. Phone editors wrap lines, retain 16px touch input text, and run inline. The compact header puts language and title beside Run, Compile, or Check Answer. Hint, Reset, and Copy are in a three-dot popover. Touch targets remain at least 44px. Reduced-motion settings disable navigation and popup motion.

## Tablet simulations

Expanded simulations cover the viewport without theme card borders, shadows, or rounded corners. Source-checked frame messages report canvas dimensions; the host fits the authored aspect ratio. Portrait tablets place controls below the scene, while landscape tablets place them beside it. Closing restores navigation, focus, and scrolling.

## Release verification

`bun run test` passes: 343 tests across 39 files, followed by TypeScript checking. Coverage includes 320px and 390px phones, phone landscape, tablet portrait and landscape, desktop simulation workspaces, search scope and history, editor draft/reset behavior, compact actions, keyboard viewport anchoring, nested assets, standalone controls, output path boundaries, and video preservation.

`bun run lint` passes with 11 non-blocking warnings. `git diff --check` passes. Light and dark phone layouts were inspected in the shared browser. Physical-device Safari validation remains outstanding; keyboard anchoring is covered with a simulated visual viewport in managed Chromium.
