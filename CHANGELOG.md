# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Sidebar State Persistence**: Sidebar collapsed state is now remembered across page reloads and transitions in `localStorage`, with an early initialization script to eliminate layout flickering.
- **Keyboard Navigation**: Pressing `Escape` now cleanly closes/dismisses maximized object views.
- **Dev server keyboard shortcuts**: While `mr-md dev` is running in a TTY, press `u` to reprint the URL box, `o` to open the browser, `c` to clear the console, `q` to quit, or `h` for shortcut help.
- **Dev server `--open` flag**: Automatically opens the browser on startup (`mr-md dev --open`).
- **Detached mode (`-d` / `--detach`)**: Run the dev server as a background process. The parent prints the URL box and a `tail -f` log hint, then exits immediately (`mr-md dev -d <target>`).
- **`mr-md stop` command**: Stops a background dev server by reading the PID file and sending `SIGINT` (`mr-md stop <target>`).
- **Cross-platform browser opener**: `openBrowser(url)` helper in `src/cli/utils.ts` using the appropriate OS command (`open`, `xdg-open`, `start`).

### Changed
- **Sidebar & Header Layout**:
  - Removed redundant tags and author initials badge from the sidebar for cleaner, focused navigation.
  - Reorganized lesson hero header: tags are displayed neatly in an eyebrow row with a `+N` badge for overflow tags, and the author is presented with an explicit byline below.
  - Aligned sidebar collapse and expand toggle buttons to the same vertical position.
  - Fixed subtle hover reflow under the "Back to Chapter" button.
- **Neo UI Theme Polish**:
  - Eliminated the visual glitch of sharp outer corners and curved inner borders on Neo timeline cards and nodes.
  - Refined Neo segmented controls, setting panels, and tag pill styling.
- **Dev server serve box**: Replaced the tall multi-line box with a compact wide 2-column layout (URLs on the left, keyboard shortcuts on the right).
- **Dev server HTTP logging**: Static assets (`.css`, `.js`, images, fonts, etc.) are now silenced from terminal output by default. Use `--verbose` / `-v` to restore full logging.

### Fixed
- **Router Popstate Navigation**: In-page hash navigation via browser back/forward no longer triggers a full PJAX re-fetch or page flash.
- **Scroll Container Anchor Handling**: Initial URL hash scrolling correctly targets the `.bk-main` container instead of `window`.
- **Iframe Pointer Trapping**: Window scroll capture now properly adds `.bk-is-scrolling` during `.bk-main` scrolls, preventing embedded iframes from capturing mouse events.
- **Simulation Theme Sync**: Newly mounted simulation iframes now reliably receive the current theme on PJAX page transitions.
- **Maximized View Lifecycle**: Maximized containers are automatically cleaned up when navigating to another page via PJAX.
- **Quiz Parsing**: Added whitespace trimming prior to Base64 decoding in quiz parser to prevent decode crashes on untrimmed markup.
- **Clipboard Fallback**: Added a document fallback copy mechanism for non-secure / HTTP environments where `navigator.clipboard` is unavailable.
- **YouTube Embed Interactivity**: Removed intrusive global mousemove blur handler from YouTube embeds.
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
