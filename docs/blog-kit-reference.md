# BlogKit: current contract and studio plan

This reference describes the implementation currently in this checkout. “Planned” means a proposed next step, not an implemented feature.

## Status

The chapter compiler, config-driven engine selection, block routing, asset collection, and development rebuild path work. This is a rendering foundation. It is not yet a complete studio integration contract.

Remaining gaps include engine discovery and compatibility metadata, editor-readable settings definitions, and browser lifecycle support for switching implementations without full page loads. `tone` is accepted but currently has no visible effect.

## Complete current config surface

All root fields are optional. `{}` uses existing MrMD defaults and automatic lesson discovery. A configured engine changes how that section interprets its `settings`.

### Root and shared section fields

| Path | Accepted value | Behavior |
| --- | --- | --- |
| `$schema` | String | Editor schema reference; does not select a renderer or download code |
| `title` | Nonempty string | Chapter overview title; otherwise derived from folder name |
| `description` | String | Chapter overview description |
| `theme` | Object | Theme implementation and appearance settings |
| `content` | Object | Content implementation and chapter lesson order |
| `testing` | Object | Implementation for quiz and guided-step blocks |
| `simulation` | Object | Implementation for simulation/world/animation blocks |
| `code` | Object | Implementation for code blocks |
| `<section>.engine` | Nonempty string | `"default"`, local module path, or installed package name |
| `<section>.settings` | JSON object | Values belonging to that implementation |
| `content.lessons` | Nonempty array | Authored lesson order; omitted files are not published by that chapter build |

Local implementation files must resolve inside the chapter folder, including through symlinks. Installed packages must already be available to the build; changing the config does not install them. The built-in implementations for `content`, `code`, and `simulation` have no section settings and reject a nonempty `settings` object. `content.lessons` is still supported because it is chapter compilation data, outside `content.settings`.

The section list is fixed in code. Adding an arbitrary sixth section in JSON is not supported.

### Built-in theme settings

These paths apply when `theme.engine` is absent or `"default"`.

| Path | Accepted values | Effect / default |
| --- | --- | --- |
| `theme.settings.mode` | `light`, `dark`, `auto` | Initial reader mode; browser behavior uses auto when omitted, then respects saved reader choice |
| `theme.settings.palette` | `ink`, `field`, `ember`, `elixir`, `trunk`, `lava` | Color palette; default `ink` |
| `theme.settings.accent` | Hex color: 3, 4, 6, or 8 digits | Overrides the accent variable; otherwise palette accent |
| `theme.settings.font` | Font-family string | Body font; existing default is IBM Plex Sans |
| `theme.settings.headingFont` | Font-family string | Display font; existing default is Fraunces |
| `theme.settings.monoFont` | Font-family string | Monospace font; existing default is IBM Plex Mono |
| `theme.settings.layout` | `narrow`, `wide`, `full` | Content max-width: 720px, 1120px, or unrestricted; omission preserves standard 1024px content container |
| `theme.settings.ui` | `standard`, `neo`, `playful` | Existing UI treatments; default `standard` |
| `theme.settings.density` | `comfortable`, `compact` | Default content gap 30px; compact 22px |
| `theme.settings.tone` | `scholarly`, `studio`, `minimal` | Accepted, but currently only emits a class. No visual behavior is implemented |

Font names do not load font files. Custom font resources need to be supplied separately. Font strings are restricted to letters, numbers, spaces, commas, periods, quotes, underscores and hyphens, and at most 200 characters. The custom accent stays independent of saved palette selection.

The content container includes padding. Figures may use its available width, while prose stays constrained to its reading width. A standard simulation preview uses 16:9; an explicitly authored simulation height overrides that in its companion config.

Saved reader choices for mode, palette, and UI override corresponding configured defaults. Consequently two browsers can show different appearance from the same config.

### Built-in testing settings

| Path | Accepted value | Effect / default |
| --- | --- | --- |
| `testing.settings.retry` | Boolean | Adds a per-question “Try again” button; omitted means no retry button |
| `testing.settings.explanations` | Boolean | Allows answer explanations after answering; omitted means enabled |

These affect the existing quiz renderer. They do not add accounts, a gradebook, backend grading, persistence, or a new assessment type. Guided steps are routed through the same testing section but do not gain quiz retry behavior from these fields.

A replacement testing implementation defines its own settings; it need not support `retry` or `explanations`.

### Lesson order and current lesson overrides

```json
{
  "content": {
    "lessons": [
      "introduction.md",
      {
        "file": "experiment.md",
        "theme": { "settings": { "accent": "#0f766e", "layout": "narrow" } },
        "testing": { "settings": { "explanations": false } }
      }
    ]
  }
}
```

Each string is a relative `.md` path inside the chapter. Nested paths are supported when listed explicitly. Duplicates, missing files, escaping paths and reserved/duplicate output slugs are rejected. The order produces previous/next links and numbering. It does not reorder blocks inside a lesson.

Object entries support these fields:

| Field | Values |
| --- | --- |
| `file` | Required relative Markdown path |
| `<section>.settings` | Override individual settings of the chapter-selected implementation for this lesson |
| `theme.mode`, `theme.palette`, `theme.accent`, `theme.font`, `theme.headingFont`, `theme.monoFont` | Same values as built-in theme settings |
| `layout` | `narrow`, `wide`, `full` |
| `ui` | `standard`, `neo`, `playful` |
| `density` | `comfortable`, `compact` |
| `tone` | `scholarly`, `studio`, `minimal`; currently no visible effect |
| `learning.retry`, `learning.explanations` | Booleans, mapped to existing quiz behavior |

Use the same section and setting names at either level. Engine selection is chapter-wide. For a replacement engine, lesson settings override matching chapter keys before validation. A nested object supplied by the lesson replaces the chapter value for that key. Direct presentation fields remain supported.

Property-level theme and learning merges let a lesson change one property while inheriting the rest. Omitting the lesson list discovers top-level `.md` files in natural filename order; a complete set of positive integer frontmatter indexes preserves legacy ordering.

### Accepted legacy root fields

For compatibility the root also accepts `lessons`, `layout`, `ui`, `density`, `tone`, and `learning: { retry, explanations }`. `theme` also accepts the direct fields `mode`, `palette`, `accent`, `font`, `headingFont`, `monoFont` alongside `engine` and `settings`.

Their allowed values match the tables above. Both `lessons` and `content.lessons` together are rejected. Built-in `theme.settings` overrides matching direct/legacy appearance values. `testing.settings` replaces the inherited root `learning` object rather than merging it property by property. Avoid mixing old and new paths.

Unknown root keys and unknown built-in setting keys are rejected. Replacement settings are validated only when the replacement supplies a schema. `validateMrmdConfig` validates the outer structure; some built-in settings are validated later when resolving project presentation.

### Full section-shaped example

```json
{
  "title": "Mechanics",
  "description": "Lessons and experiments",
  "theme": {
    "engine": "default",
    "settings": {
      "mode": "auto",
      "palette": "ink",
      "accent": "#0f766e",
      "font": "IBM Plex Sans, sans-serif",
      "headingFont": "Fraunces, serif",
      "monoFont": "IBM Plex Mono, monospace",
      "layout": "narrow",
      "ui": "standard",
      "density": "comfortable"
    }
  },
  "content": {
    "engine": "default",
    "lessons": ["introduction.md", "experiment.md"]
  },
  "testing": {
    "engine": "default",
    "settings": { "retry": true, "explanations": true }
  },
  "simulation": { "engine": "default" },
  "code": { "engine": "default" }
}
```

This lists the useful built-in settings. It is not a recommended starter file: only save overrides the chapter actually needs. `tone` is omitted because it currently does nothing visible.

## What an engine is

An engine is a build-time module that implements rendering for one section. It is code, not a running service and not a separate Markdown parser. BlogKit coordinates the selected implementations.

The shared parser creates typed blocks. Many blocks carry a source path rather than fully loaded semantic data: a quiz block can contain `src: "./questions.json"`. The replacement is responsible for resolving/reading that data using the lesson's `options.contentBase`. The playground testing module does exactly that. Earlier descriptions suggesting every engine receives fully parsed questions were too broad.

### Routing

| Section | Input |
| --- | --- |
| `content` | Heading, Markdown, section, callout, columns, image, media, YouTube blocks |
| `testing` | Quiz and guided-step blocks |
| `simulation` | Simulation, world, animation blocks with normalized companion settings |
| `code` | Code text and full language/info string, e.g. `js run` |
| `theme` | Assembled lesson/chapter body, metadata, navigation, and default-shell rendering function |

Code blocks inside Markdown are dispatched by the Markdown renderer. A custom content engine must keep using that renderer or explicitly handle its own code routing; arbitrary custom HTML cannot be inspected and routed automatically.

The chapter overview currently has its own default renderer, exposed to replacement themes. A replacement content engine does not replace the chapter overview automatically.

## Hot-swappable module contract

A module needs an exported object with a synchronous `render(context)` function. ESM default export and CommonJS export are accepted by the current loader. It may also provide `schema.parse(settings)`; a Zod object schema works. Settings parsing must synchronously return an object.

```ts
interface Output {
  html: string;
  css?: string;
  js?: string;
  navItems?: {
    id: string;
    label: string;
    kind: "heading" | "section" | "quiz" | "simulation";
  }[];
}
```

`html` is required; CSS and JS are source strings, not asset paths. Distinct strings are deduplicated per page and inserted into the final document. Browser JS is emitted as module source. External imports and separate resources are the implementation author's responsibility.

Every context has `settings` and `options`:

- Content/testing/simulation: also `block`, `index`.
- Code: also `code`, `language` (full fence info, including flags).
- Theme: also `bodyHtml`, `navItems`, and `lesson` or `chapter`. Chapter rendering also provides `navHtml`. `renderDefault()` returns the existing full document shell.

The output contract must cover every block type owned by the section. A testing replacement that only handles quizzes will fail if the chapter contains guided steps; there is no per-block automatic fallback in that section.

### Working simple theme module

```js
export default {
  render({ renderDefault }) {
    return {
      html: renderDefault(),
      css: ".bk-content { line-height: 1.8; }"
    };
  }
};
```

Select it with `"theme": { "engine": "./my-theme.js" }`.

### Working code module with settings validation

```js
import { z } from "zod";

const escape = value => String(value).replace(/[&<>"']/g,
  character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;" })[character]);

export default {
  schema: z.object({ showLanguage: z.boolean().default(true) }),
  render({ code, language, settings }) {
    return {
      html: `<section class="my-code">${settings.showLanguage
        ? `<p>${escape(language)}</p>` : ""}<pre><code>${escape(code)}</code></pre></section>`,
      css: ".my-code pre { padding: 1rem; overflow: auto; }"
    };
  }
};
```

```json
{ "code": { "engine": "./my-code.js", "settings": { "showLanguage": false } } }
```

This example changes rendering only; it does not preserve runnable-code features. A replacement owns the behavior it replaces. The package exports `renderCodeBlock` when an implementation wants to delegate to the existing default code renderer.

### Swapping

1. Put the new module inside the chapter or install its package in the project.
2. Change that section's `engine` value in `mrmd.config.json`.
3. Supply settings understood by the new module; old settings are not automatically migrated.
4. Build, or let the development watcher rebuild and reload.
5. All lessons in the chapter use the replacement for the section's block types.

`"engine": "default"`, or removing the selection, restores the built-in implementation. This is build-time replacement. An open production page does not load a new server implementation without regenerating/reloading it. Local module/helper edits are reloaded during development; node_modules is excluded from the file watcher.

Custom engine pages currently use full-document navigation, rather than the default phone route bundle/client-side navigation. This ensures each page runs its returned browser modules. No generic browser `mount`, `update`, or `dispose` hooks are implemented yet.

### Backend testing

A future testing implementation can return assessment HTML plus browser JS that calls a separately deployed backend. BlogKit does not supply that backend, authentication, protected answer storage, grading, or result persistence. The current renderer is synchronous; it cannot await an async render result or fetch build data through an async lifecycle.

Do not put backend secrets into authored browser settings or emitted HTML/JS. The existing playground example contains client-side answers and is a rendering demo, not secure examination infrastructure.

## What stays in simulation configs

`mrmd.config.json` selects the chapter's simulation implementation. Each simulation's companion JSON owns its props, tunables, actions, presets, advanced controls, telemetry, measurements, dimensions, labels, captions, and supported simulation-specific behavior.

The built-in block renderer has a lesson preview and an expanded lab. It does not support interactive inline labs. `open: "inline"` is rejected. The existing `open: "workspace"` value remains accepted but can be omitted. Do not invent a second simulation settings location in the chapter config.

## Future studio: proposed flow

The studio should edit the same chapter config and simulation companion files that command-line users edit. It should not maintain a second source of truth.

1. Read chapter config and selected implementation metadata.
2. Resolve stored overrides against implementation defaults.
3. Display theme controls, ordered lessons, and per-section implementation/settings editors.
4. When editing a simulation, read/write that simulation's companion config.
5. Validate an edit before writing the relevant file.
6. Trigger a build; show preview or field errors.

Examples: dragging a lesson updates `content.lessons`; changing the chapter accent updates `theme.settings.accent`; choosing another testing implementation updates `testing.engine` and its settings; changing a slider's range updates that simulation's `tunables` in its companion file.

### Missing studio integration pieces

| Needed | Current state |
| --- | --- |
| List available implementations and human-readable descriptions | No registry or discovery API |
| Identify a module and check API compatibility | Config-selected modules have no required id/version/capability metadata |
| Generate settings forms, labels, descriptions, defaults and constraints | Optional parse method only; no required editor-readable descriptor contract |
| Autocomplete all built-in settings in JSON editors | Outer schema exists; engine settings currently use arbitrary record, so completions are incomplete |
| Migrate settings when replacing an implementation | Not implemented |
| Preserve state and clean up browser handlers on partial navigation | No generic lifecycle contract; full page navigation used |
| Stage a build and publish output atomically | Current builders write files incrementally; last-success preservation is not transactional |
| Remove unused config | `tone` remains a no-op and legacy aliases remain accepted |

An engine's parse method can reject invalid settings, but parsing alone does not tell a UI what controls to draw. A studio-ready descriptor needs a readable settings schema plus field descriptions and defaults. Those should be defined by each implementation and consumed by both validation and the studio, without adding another author-editable config file.

## Build features not yet in the JSON config

`favicon`, raw `head` injection, `strict`, `standalone`, `outDir`, and the older `preset` remain TypeScript `BuildOptions` rather than supported JSON root fields. Putting them in `mrmd.config.json` currently fails validation. This means the goal of configuring every MrMD capability from one chapter file is not fully met yet.

## Existing internal API

There is still an older TypeScript `createBlogKit({ engines })` API with `layout`, `chapter`, `content`, `learning`, `simulation`, and `media` slots, requiring names and API version 1. Config-selected modules are adapted into those slots. The public five-section model does not require those old declarations, and currently does not check a replacement's own API version. This duplication should be cleaned up before calling the plugin system a stable public contract.

## Sources

- `src/config.ts`: accepted fields, validation, aliases and merges.
- `src/compiler.ts`: discovery, order and navigation metadata.
- `src/blog-kit/sections.ts`: config-selected implementation contracts.
- `src/blog-kit/configured.ts`: module loading, routing adapters and assets.
- `src/blog-kit/engine.ts`, `contracts.ts`: older engine slots and coordination.
- `src/renderer/markdown/sanitize.ts`: nested code dispatch and sanitization.
- `src/client/presentation.ts`: configured appearance versus reader preferences.
- `src/cli/dev.ts`: file watcher, rebuilds and reload messages.
