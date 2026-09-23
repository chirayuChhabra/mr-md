# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Agent Skill System**: First-class simulation skill for AI coding agents (`skills/mr-md-simulations/`)
- **Skill CLI**: `mr-md skill install|update|status|remove` commands for managing agent skills
- **Theme color helper**: Exported `bkThemeColors()` utility for consistent theme token mapping

### Fixed
- **Canvas fitting**: Simulations now use `Math.min` scaling to prevent clipping and overflow
- **Dark-mode text contrast**: Theme bridge reads `--ink` and `--muted` CSS properties instead of undefined `--text` / `--text-light`
- **Iframe background sync**: Simulation iframe background now syncs to host `--bg` color on theme change

### Changed
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

[Unreleased]: https://github.com/chirayuChhabra/mr-md/compare/v3.1.1...HEAD
[3.1.1]: https://github.com/chirayuChhabra/mr-md/compare/v3.1.0...v3.1.1
[3.1.0]: https://github.com/chirayuChhabra/mr-md/compare/v3.0.2...v3.1.0
[3.0.2]: https://github.com/chirayuChhabra/mr-md/compare/v3.0.1...v3.0.2
[3.0.1]: https://github.com/chirayuChhabra/mr-md/compare/v3.0.0...v3.0.1
[3.0.0]: https://github.com/chirayuChhabra/mr-md/compare/v1.0.1...v3.0.0
