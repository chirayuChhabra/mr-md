# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Measurement Graphs and Scene Guides**:
  - Stats and Graphs views with author-defined plots and learner-created X/Y plots from numeric telemetry.
  - Draggable, minimizable floating graph windows and a separate browser tab for comparing live plots, with bounded sample history.
  - Measurement rows that toggle scene guides, with session-persisted visibility and graph layout preferences across trial resets.
  - Conditional measurement colors and labels, threshold-based unread counts, and configurable event notifications with cooldowns and toast limits.
  - `measurements` startup configuration for visible guides, graph windows, initial inspector tab, notifications, and timeline options.
- **Simulation Timeline and Snapshots**:
  - Opt-in `timeline` configuration with automatic start, control-change, and measurement-event captures, plus a manual Capture button when exact snapshots are supported.
  - Exact state capture and restoration through `window.bkRegisterSnapshot`, with a restoration guard exposed as `window.__bkRestoring`.
  - Select saved moments to restore and pause the simulation; return with Back to live or continue from the restored state by resuming, changing a control, or interacting with the scene.
  - Linear capture history preserving saved moments after continuation and trimming later plot samples from the active run.
  - Named canvas and SVG captures with thumbnails and PNG downloads; JSON export including timeline entries, exact states, embedded images, measurement schema, and plot definitions.
- Spring measurements playground with draggable mass, physical controls, scene guides, graphs, and snapshot registration; expanded simulation authoring documentation.
- Unified full-width topbar with single breadcrumb navigation (`[ ◨ ] Parent / Current`) and stationary sidebar toggle button across all themes.
- **Full-Window Simulation Workspace & Inspector**:
  - Modal lab dialog (`role="dialog"`, `aria-modal="true"`) expanding inline block and step simulations into a focused stage and inspector column.
  - Background isolation setting non-active elements `inert`, accessible focus trapping within the dialog, and restoring lesson scroll position and prior focus upon exit.
  - Dual-tab inspector layout separating `Controls` and `Measurements` when telemetry is present, with continuation cues for scrollable panels.
  - Centered playback controls with Pause/Resume and in-place Reset buttons.
  - Pause overlay on the stage with a Resume trigger and keyboard hints.
  - Global keyboard shortcuts: `Space` to toggle play/pause, `R` to reset model or trial, `←` / `→` for step navigation, and `Escape` to close the workspace.
- **Abstract Live Telemetry**:
  - Companion config `telemetry` schema defining named outputs with `label`, `unit`, `precision`, `group`, `description`, and `display` (`metric`, `status`, or `row`).
  - Runtime publishing via `sim.publishTelemetry()` and global `window.bkTelemetry()`.
  - Host-side update coalescing with `requestAnimationFrame` to avoid layout thrashing during animation frames.
  - Readout formatting with unit badges and explicit `—` placeholders for unpublished or null values.
- **Typed Authoring SDK & Configuration Schema**:
  - Packaged `mr-md/simulation` module and global `window.defineSimulation({ props })` runtime providing typed `props`, `isPlaying`, `onPropsChange`, `onReset`, `onPlaybackChange`, `publishTelemetry`, `deltaTime()`, and `dispose()`.
  - Frame delta calculation via `deltaTime()` returning elapsed seconds while active, zero while paused, and capped at 0.1s after delays.
  - Exported JSON Schema (`mr-md/simulation.schema.json`) for IDE completion in sibling `.config.json` files.
  - Ahead-of-time configuration validation (`validateSimulationConfig`) reporting invalid fields, missing defaults, out-of-bounds ranges, and unknown advanced controls with file and path diagnostics.
- **Responsive Canvas Framing**:
  - Responsive canvas contract in `bkSetup` sizing to a minimum logical coordinate area and expanding callback dimensions uniformly without coordinate distortion.
  - Optional `{ framing: "contain" }` preserving fixed aspect ratios with letterboxing, and `{ framing: "bleed" }` exposing expanded background bounds through callback arguments.
  - Immediate canvas background synchronization eliminating white flash during theme switches.
- **Expanded Host Controls Contract**:
  - Segmented button groups (`type: "segmented"`) and compact pickers (`type: "select"`).
  - Numeric unit suffixes (`unit: "N/m"`, `"kg"`).
  - Discrete push-button actions (`actions`) with configurable color tokens (`accent`, `neutral`, `red`, `green`, `amber`) dispatching `bk:action` window events.
  - Parameter bundles (`presets`) updating all configured properties atomically.
  - Collective `advancedControls` array placing secondary tunables inside a native disclosure, resolving visibility via `control.advanced ?? advancedControls.includes(key)`.

### Fixed
- Restore close controls, fullscreen breadcrumbs, navigation history, and lesson scroll position when leaving lab and world simulations.
- Synchronize playback state when restoring simulation snapshots.
- Wait for snapshot restoration to finish before continuing from a saved moment.
- Improve syntax highlighting and line number contrast in light-mode code editors.
- Preserve CodeMirror editor styles across dev server live reloads.

### Changed
- Move timeline export into the More menu and keep measurement view controls visible.
- Replace the oscillator example's canvas plots with host measurement graphs, add displacement, velocity direction, and near-critical damping states, and enable exact timeline snapshots.
- Rename the simulation inspector's Controls tab to Settings, arrange measurements in aligned instrument rows, and add a separate Timeline tab.
- Clear trial samples, timeline history, and notification state on reset while preserving graph layout, scene visibility, and the active inspector tab.
- Streamlined sidebar header by eliminating duplicate document titles and redundant branding.
- Converted sidebar toggle button into a clean, borderless icon with matching 24px height and vertical alignment with breadcrumbs across all themes (Standard, Neo, Playful).
- Updated guided step simulations (`type: "steps"`) to integrate with the shared modal workspace, isolating trial parameter resets (`initialProps`) without reloading iframes.
- In-place model reset via `sim.onReset` or `window.bkOnReset`, with automatic iframe reload fallback for legacy simulations.
- Instruct the simulation skill to preserve existing lesson content and flag potential inaccuracies without editing them unless asked.

## [4.0.0-alpha.2] - 2026-11-02

### Added
- Show a light or dark coming-soon screen on mobile and tablet-sized displays, with a prompt to use desktop for now.
- **Immersive Simulation Worlds (`type: "world"`)**:
  - Full-screen explorable scenes with hold-to-enter portals (`minimal`, `wormhole`, and `pixel`), exit controls, Escape handling, and browser Back integration.
  - Host-managed 2D worlds with pan, cursor-centered zoom, keyboard navigation, and coordinate conversion helpers; custom WebGL / Three.js renderers are also supported.
  - Companion `.config.json` configuration and the `lesson.world()` builder API, with minimal, matrix, cosmos, and solar-system documentation examples.
- Modern simulation authoring skill with guided-step, host-managed 2D world, and custom 3D world starters; lifecycle, navigation, appearance, and validation references.
- **CodeMirror 6 AST-Backed Code Editor & Autocomplete (`.bk-code-runner`)**:
  - Interactive CodeMirror 6 code editor engine with real-time Lezer AST parsing, custom syntax highlighting matching the mr-md theme, and line gutters.
  - Context-aware autocomplete for JavaScript, TypeScript, Python, C++, and Rust:
    - Smart module import gating (suggests module members such as `math.` or `random.` only when explicitly imported in Python).
    - Scope and namespace completions (e.g. `std::` namespace members in C++, `Vec::` in Rust).
    - Interpolation awareness (permits completions inside Python f-string replacement braces `{expr}` and JavaScript template literal expressions `${expr}` while suppressing inside comments and raw string literals).
    - In-buffer identifier harvesting, built-in global suggestions, and multi-language snippets (`clg`, `def`, `main`, `println!`).
  - Dual-layer fallback engine (`BkAutocomplete`) providing auto-closing brackets, skip-over typing, and completion popups in non-CodeMirror environments.
  - Editor state synchronization with run, reset, copy, and Wandbox compilation cache invalidation.
- **Unified Syntax Theme as Single Source of Truth**:
  - Custom Shiki TextMate theme (`mrMdShikiTheme`) in `src/renderer/markdown/syntax-theme.ts` emitting CSS variable references (`var(--accent)`, `var(--blue)`, `var(--teal)`, `var(--amber)`, `var(--violet)`, `var(--rose)`, `var(--faint)`, `var(--text-code)`) directly into inline styles, allowing pre-rendered static blocks to dynamically react to light/dark modes and custom themes with zero client runtime overhead.
  - Shared `getLanguageDisplay()` mapping for consistent language labels and pill badges (`C++`, `JavaScript`, `Python`, `TypeScript`, `Bash`, etc.) across both static blocks and interactive runners.
  - Static code block chrome modernization with pill badges (`.bk-code-badge`) and action header bars containing a declarative copy button matching `.bk-runner-header`.
- **Interactive Step-by-Step Simulations (`type: "steps"`)**:
  - Guided interactive labs with milestones, progressive objectives, LaTeX and Markdown instructions, hint drawers, and success feedback toasts.
  - Companion `.config.json` schema with `"type": "steps"`, step definitions, target badges, and custom per-step parameters (`initialProps`).
  - First-class custom audio asset bundling (`audio: "./path.mp3"`) with fingerprinting to `out/assets/`, alongside opt-in text-to-speech (`voice`).
  - Dedicated step runner controls with keyboard shortcuts (`Space` to toggle play/pause, `R` to reset trial, `←` / `→` arrow keys to navigate steps, and clickable milestone progress dots).
  - Programmatic Builder API: `lesson.steps()` and automatic routing in `lesson.lab()` when the config specifies `"type": "steps"`.
  - Author runtime hooks: `window.bkOnStep(cb)`, `window.bkOnReset(cb)`, and flexible `window.bkCompleteStep(feedback)`.
  - Seamless theme adaptation for Standard, Neo, and Playful design systems.
- **Interactive Runnable Code Blocks (`.bk-code-runner`)**: Embed and execute live code blocks natively within Markdown lessons using the `run` or `runnable` fence flags.
- **Client-Side Sandbox Runners (JavaScript & TypeScript)**: Execute code directly in browser-native Web Workers with circular-safe custom console streaming and TypeScript type stripping.
- **In-Browser Python Engine**: Instantaneous zero-server Python 3 compilation and execution via Skulpt with stdlib support and runaway execution timeouts.
- **Dual-Layer Live Syntax Highlighting**: Lightweight Prism server-side pre-tokenization and 60fps client synchronizer with pixel-perfect line numbers and synchronized scrolling.
- **IDE Shortcuts & Editing Ergonomics**:
  - `Cmd + /` / `Ctrl + /` line and multi-line comment toggling across 17+ programming languages with preserved native undo/redo history.
  - Multi-line `Tab` indent and `Shift + Tab` unindent.
  - Smart indentation on `Enter` (matching indentation and auto-indenting after `{`, `:`, `[`, `(`).
  - Bracket & quote pair auto-wrapping and matched backspace deletion.
- **Two-Stage Ahead-of-Time Compilation (`two-step` mode)**: Compiles C++, C, Rust, Go, Java, Zig with Wandbox, caches binary output, and provides instant machine code execution (`$ ./a.out`) to teach learners the speed difference between ahead-of-time compilation and execution.
- **Interactive Programming Quizzes & Challenges**:
  - Clean YAML frontmatter authoring (`challenge` flag) with `title`, `expected`, `match`, `hint`, and `stdin`, automatically parsed and stripped from the student's starter code.
  - Support for `exact`, `regex` (for dynamic or random outputs like dice rolls), and `contains` evaluation strategies.
  - Collapsible hint drawers, celebratory success banners, and structured expected vs. actual comparison cards.
- **Compiled Language Challenges**: Algorithmic challenges in C++, Rust, Go, and C with single-action automated compilation, stdout capture, and compiler error diagnostics.
- **Modern Full-Width Topbar**: Introduced a persistent top navigation bar spanning the entire width above the layout, housing breadcrumb context, navigation controls, and quick settings.
- **Dynamic Contextual Breadcrumbs**:
  - Displays hierarchical navigation (`<Course / Chapter Title> / <Lesson Title> / <Active Section>`), dynamically resolving the parent chapter/course title (e.g. `Mr Markdown Documentation`) instead of generic placeholders.
  - Interactive breadcrumbs: parent link navigates back to chapter overview, lesson title smoothly scrolls the page back to the top, and active section dynamically updates on scroll and jumps to heading anchors.
- **Dedicated Sidebar Panel Toggle**: Replaced generic hamburger drawer lines with a modern developer-focused panel toggle icon (`panel-left` rect with vertical divider).
- **Quick Theme Toggle in Topbar**: Added a topbar dark/light mode toggle with smooth sun/moon SVG transitions for one-click theme switching without needing to open the full settings panel.
- **Top Bar Reading Progress**: Added a minimal reading progress indicator along the bottom edge of the topbar that updates dynamically during lesson reading.
- **Configurable Eyebrow & Metadata**: Added full support for custom eyebrow headers (`eyebrow` in frontmatter), optional disabling, author bylines, descriptions, and tag badges with `+N` overflow counters.
- **Sidebar State Persistence**: Sidebar collapsed state is now remembered across page reloads and transitions in `localStorage`, with an early initialization script to eliminate layout flickering.
- **Responsive Mobile Drawer**: Sidebar expands into an off-canvas drawer with smooth backdrop dismissal on screens under 800px.
- **Keyboard Navigation**: Pressing `Escape` now cleanly closes/dismisses maximized object views.
- **Dev server keyboard shortcuts**: While `mr-md dev` is running in a TTY, press `u` to reprint the URL box, `o` to open the browser, `c` to clear the console, `q` to quit, or `h` for shortcut help.
- **Dev server `--open` flag**: Automatically opens the browser on startup (`mr-md dev --open`).
- **Detached mode (`-d` / `--detach`)**: Run the dev server as a background process. The parent prints the URL box and a `tail -f` log hint, then exits immediately (`mr-md dev -d <target>`).
- **`mr-md stop` command**: Stops a background dev server by reading the PID file and sending `SIGINT` (`mr-md stop <target>`).
- **Cross-platform browser opener**: `openBrowser(url)` helper in `src/cli/utils.ts` using the appropriate OS command (`open`, `xdg-open`, `start`).

### Changed
- Refreshed the showcase, quickstart, feature and quiz guides; added a dedicated coding guide with runnable examples, challenges, compiled languages and connectivity requirements.
- **Dependencies Update**:
  - Upgraded `katex` to `^0.19.1` and updated KaTeX CSS CDN link in page templates to `0.19.1`.
  - Upgraded `isomorphic-dompurify` to `^4.6.0`, `marked` to `^18.1.2`, `shiki` to `^4.5.0`, and `zod` to `^4.6.7`.
  - Upgraded dev dependencies: `@biomejs/biome` to `^2.6.3`, `@types/node` to `^26.6.5`, `lint-staged` to `^17.6.0`, and `puppeteer` to `^25.16.0`.
- **Code Block Typography & Aesthetic Parity**:
  - Aligned typography metrics between `.bk-code-block pre` and `.bk-code-runner`: `font-size: 13.5px`, `line-height: 1.6`, and `tab-size: 2`.
  - Aligned code block header bars to `min-height: 44px`, `padding: 8px 14px`, and glass background tint across both static code blocks and runners.
  - Removed outdated `.hljs-*` CSS rules and obsolete `html[data-theme='dark'] .shiki span { color: var(--shiki-dark) !important; }` overrides.
- **Unified Sidebar Across All Pages**: Restored consistent sidebar navigation on the course/chapter dashboard (`index.html`), maintaining uniform layout and muscle memory across both lesson reading and course browsing.
- **Motionless Topbar Controls**: Enforced stable, motionless hover and active states (`transform: none`, no jump or spring cubic-bezier) on topbar icon buttons across standard, neo, and playful themes.
- **Playful UI Layout Alignment**: Removed the radius gap between playful sidebar and topbar, rendering sidebar flush against the topbar border for a cohesive visual structure.
- **Sidebar & Header Layout**:
  - Restored display settings gear icon to the sidebar footer for easy access.
  - Removed redundant tags and author initials badge from the sidebar for cleaner, focused navigation.
  - Reorganized lesson hero header: tags are displayed neatly in an eyebrow row with a `+N` badge for overflow tags, and the author is presented with an explicit byline below.
- **Neo UI Theme Polish**:
  - Eliminated the visual glitch of sharp outer corners and curved inner borders on Neo timeline cards and nodes.
  - Refined Neo segmented controls, setting panels, and tag pill styling.
- **Dev server serve box**: Replaced the tall multi-line box with a compact wide 2-column layout (URLs on the left, keyboard shortcuts on the right).
- **Dev server HTTP logging**: Static assets (`.css`, `.js`, images, fonts, etc.) are now silenced from terminal output by default. Use `--verbose` / `-v` to restore full logging.

### Fixed
- Keep autocomplete suggestions open and repositioned when typing scrolls the editor; make the browser regression start from a deterministic editor state.
- Run CI for pull requests targeting `immersive_simulation_world_view`.
- **Cross-Engine Syntax Highlighting Parity**:
  - Resolved function call scope leakage in Shiki where arguments and base objects (`console`, `sample`, `col`, `matrix`, `row`) were incorrectly colored as functions by narrowing TextMate scope to `meta.function-call.generic`.
  - Aligned C++ template type argument angle brackets (`vector<int>`) to `punctuation` (`var(--faint)`) in Prism runner via a dedicated `generic-type` grammar matching Shiki's TextMate delimiter conventions.
  - Aligned Python return type annotations (`->`) as a unified operator (`var(--violet)`) in both Prism and Shiki.
  - Aligned JavaScript template string interpolations (`${result}`) by explicitly scoping embedded expressions to `var(--text-code)` and interpolation delimiters (`${`, `}`) to `var(--faint)`.
- **Runner Code Copy Detachment**: Added an exclusion guard in `bkInitCodeCopy()` preventing global code-block copy containers from wrapping and displacing `.bk-code-runner` highlight layers.
- **Premature Compilation Abort Bug**: Added a double-click debounce guard in two-step compilation mode and separated timeout events from manual user aborts so compiling never gets erroneously canceled.
- **Challenge Header Cohesion**: Removed cluttered goal pills from the header, merged duplicate language and challenge tags into clean unified badges, and enforced single-line baseline alignment with `white-space: nowrap;` across all action buttons.
- **Chapter Overview Routing**: Generated both `index.html` and `${slug}.html` on chapter builds to prevent 404 errors when navigating back from lesson breadcrumbs.
- **Breadcrumb Hierarchy Naming**: Corrected breadcrumb parent title resolution to inherit the actual course/chapter title rather than static `"Overview"`.
- **Router Popstate Navigation**: In-page hash navigation via browser back/forward no longer triggers a full PJAX re-fetch or page flash.
- **Scroll Container Anchor Handling**: Initial URL hash scrolling correctly targets the `.bk-main` container instead of `window`.
- **Iframe Pointer Trapping**: Window scroll capture now properly adds `.bk-is-scrolling` during `.bk-main` scrolls, preventing embedded iframes from capturing mouse events.
- **Simulation Theme Sync**: Newly mounted simulation iframes now reliably receive the current theme on PJAX page transitions.
- **Maximized View Lifecycle**: Maximized containers are automatically cleaned up when navigating to another page via PJAX.
- **Quiz Parsing**: Added whitespace trimming prior to Base64 decoding in quiz parser to prevent decode crashes on untrimmed markup.
- **Clipboard Fallback**: Added a document fallback copy mechanism for non-secure / HTTP environments where `navigator.clipboard` is unavailable.
- **YouTube Embed Interactivity**: Removed intrusive global mousemove blur handler from YouTube embeds.
- **YouTube URL Parser**: Resolved video ID corruption when URLs are quoted or contain trailing quotes/hash fragments, ensuring both standard watch URLs (`youtube.com/watch?v=...`) and short URLs (`youtu.be/...`) embed reliably.
- **YouTube Timestamps & Formats**: Supported timestamp/start offsets (`?t=...`, `&start=...`), live stream URLs (`youtube.com/live/...`), and YouTube Shorts across the parser and builder.
- **Router prefetch**: `prefetchLink` no longer attempts to prefetch the current page when hovering in-page hash (`#`) anchor links.

## [4.0.0-alpha.1] - 2026-09-24

### Added
- **Agent Skill System**: First-class simulation skill for AI coding agents (`skills/mr-md-simulations/`)
- **Skill CLI**: `mr-md skill install|update|status|remove` commands for managing agent skills
- **Theme color helper**: Exported `bkThemeColors()` utility for consistent theme token mapping

### Fixed
- **Markdown video parsing**: Fix parser failing to extract video media elements due to trailing text in the same paragraph
- **Heading parsing**: Parse inline markdown in headings and strip formatting for TOC, using DOMPurify to sanitize text and satisfy CodeQL
- **Simulation size**: Standardize all simulation logical size to 1280×720 (16:9)
- **Skill CLI**: Pin skill source to exact git tag for reliability
- **Canvas fitting**: Simulations now use `Math.min` scaling to prevent clipping and overflow
- **Dark-mode text contrast**: Theme bridge reads `--ink` and `--muted` CSS properties instead of undefined `--text` / `--text-light`
- **Iframe background sync**: Simulation iframe background now syncs to host `--bg` color on theme change

### Changed
- **UI styles**: Overhauled pathfinder HUD and simulation theme styles
- **Dependencies & Logging**: Updated dependencies and refined CLI logs
- **Documentation**: Various documentation improvements, standardizing AI assistant names, adding cross-references, and grouping media embeds
- **License**: Changed from PolyForm Noncommercial 1.0.0 to Apache License 2.0

---

## [3.1.1] - 2026-09-15

### Fixed
- Finalize v3.1.1 release

## [3.1.0] - 2026-09-14

### Added
- Assembly language support and aliases for code block syntax highlighting

### Fixed
- Use AST parsing to reliably preload language styles for code blocks
- Support case-insensitive and broad language syntax highlighting in code blocks

## [3.0.2] - 2026-08-28

### Fixed
- Resolve js-yaml version conflict for npm publish
- Increase test timeout for puppeteer in CI

## [3.0.1] - 2026-08-20

### Fixed
- Resolve Netlify SPA routing, timeline scrolling, and smooth view transitions

## [3.0.0] - 2026-08-18

### Added
- Complete rewrite with modular renderer architecture
- Built-in KaTeX math rendering (inline and block)
- Native GitHub-flavored callouts/alerts
- Interactive quiz system (`.quiz.md` files)
- Interactive simulation embeds (`.js` / `.ts` files with `.config.json`)
- Live theming engine with light/dark modes, color palettes, and UI styles
- Responsive columns layout component
- Media embeds for images, video, audio, and YouTube
- CLI commands: `build`, `dev`, `generate`
- Hot-module reloading dev server
- Multi-OS CI/CD pipeline with automated npm publishing
- Husky + lint-staged for pre-commit formatting

### Changed
- Migrated to ESM modules
- Migrated to Bun runtime
- Replaced gray-matter with @11ty/gray-matter for js-yaml v4 support

[Unreleased]: https://github.com/chirayuChhabra/mr-md/compare/v4.0.0-alpha.1...HEAD
[4.0.0-alpha.1]: https://github.com/chirayuChhabra/mr-md/compare/v3.1.1...v4.0.0-alpha.1
[3.1.1]: https://github.com/chirayuChhabra/mr-md/compare/v3.1.0...v3.1.1
[3.1.0]: https://github.com/chirayuChhabra/mr-md/compare/v3.0.2...v3.1.0
[3.0.2]: https://github.com/chirayuChhabra/mr-md/compare/v3.0.1...v3.0.2
[3.0.1]: https://github.com/chirayuChhabra/mr-md/compare/v3.0.0...v3.0.1
[3.0.0]: https://github.com/chirayuChhabra/mr-md/compare/v1.0.1...v3.0.0
