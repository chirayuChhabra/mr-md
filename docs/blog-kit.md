# Blog Kit

Blog Kit reads a lesson once, routes its parsed blocks to the selected implementations, and assembles the final HTML document. Blocks keep their authored order. A chapter's `mrmd.config.json` selects implementations and supplies their settings.

## Configure a chapter

```json
{
  "$schema": "./node_modules/mr-md/dist/config.schema.json",
  "title": "Mechanics",
  "content": {
    "lessons": ["forces.md", "pendulums.md"]
  },
  "theme": {
    "settings": { "mode": "auto", "accent": "#2563eb" }
  },
  "testing": {
    "engine": "./testing.js",
    "settings": { "label": "Check your understanding" }
  }
}
```

Omit sections and settings to use the defaults. `engine` is a chapter-relative module path or an installed package name; `"default"` selects the built-in implementation. Local modules must remain inside the chapter folder. Engine selection applies to the entire chapter.

| Section | Receives |
| --- | --- |
| `theme` | The assembled body, lesson or chapter metadata, navigation, and a function to render the default page shell |
| `content` | Headings, paragraphs, callouts, columns, and media blocks |
| `testing` | Question and guided-step blocks |
| `simulation` | Simulation, world, and animation blocks, including their parsed companion settings |
| `code` | Fenced code text and its language |

`content.lessons` defines lesson order and previous/next navigation. It does not rearrange blocks inside a lesson. Omitting it discovers top-level Markdown files in filename order, while complete legacy frontmatter indexes retain their ordering. Entries can be filenames or objects such as `{ "file": "forces.md", "theme": { "settings": { "accent": "#0f766e" } } }` for lesson overrides. Each section accepts lesson-specific settings for the implementation selected by the chapter. Engine selection remains chapter-wide.

Run `mr-md build .` or `mr-md dev .`. Saving the config rebuilds the preview. Invalid configuration reports the field that failed. `mr-md generate intro` adds the generated lesson to `content.lessons` in new projects. Existing root-level lesson lists remain supported for compatibility.

## Write a replacement

An implementation exports an object with `render`. It returns HTML and, optionally, CSS and browser module JavaScript. Each distinct CSS or JavaScript string is included once in the resulting document.

```js
export default {
  render({ block, index, settings, options }) {
    return {
      html: '<section class="custom-test"><button type="button">Submit</button><p role="status"></p></section>',
      css: '.custom-test { padding: 1rem; }',
      js: `document.querySelectorAll('.custom-test button').forEach(button => {
        button.addEventListener('click', () => {
          button.nextElementSibling.textContent = 'Submitted';
        });
      });`
    };
  }
};
```

This minimal example demonstrates the output contract. The runnable implementation in `playground/blog-kit/testing.js` reads the lesson's existing question JSON, renders its questions, and handles answers. Its label comes from `testing.settings.label`.

The render context contains the selected section's `settings` and resolved build `options`. Block implementations also receive `block` and its `index`. The code implementation receives `code` and `language`. The theme implementation receives `bodyHtml`, `navItems`, `lesson` or `chapter`, and `renderDefault()`. A theme can return `{ html: renderDefault(), css: "..." }` to keep the default shell.

Implementations may export a `schema` with a `parse(value)` method, such as a Zod object schema. Blog Kit validates the section's settings before rendering and reports failures against that section. Replacement implementations define their own settings; they do not have to implement the built-in settings.

Modules run as trusted build-time code. Only return browser-safe values in HTML, CSS, and JavaScript. Settings are not automatically copied into page presentation data; explicitly including credentials in an engine's output would still expose them. Escape user-supplied text before inserting it into HTML.

Pages with replacements use full-document navigation so each page runs its implementation's browser assets. Existing default chapters retain their standard navigation behavior.

## Built-in settings

The default theme accepts `mode` (`light`, `dark`, `auto`), `palette` (`ink`, `field`, `ember`, `elixir`, `trunk`, `lava`), hex `accent`, and font-family strings `font`, `headingFont`, and `monoFont` in `theme.settings`. It also accepts `layout` (`narrow`, `wide`, `full`), `ui` (`standard`, `neo`, `playful`), `density` (`comfortable`, `compact`), and `tone` (`scholarly`, `studio`, `minimal`). Custom fonts must be loaded separately. Reader-selected mode and palette remain browser-local preferences.

The default testing implementation accepts `retry` and `explanations` in `testing.settings`. `retry` shows a retry button after answering; `explanations` controls answer explanations. A replacement defines its own settings instead.

Existing direct theme fields and root presentation fields remain accepted for compatibility. New engine settings belong to their section.

## Simulation settings stay with the simulation

A simulation script keeps its companion `<name>.config.json`:

```json
{
  "type": "block",
  "height": 420,
  "controls": "interactive"
}
```

Embed it with `![Experiment](./experiment.js)`. Dimensions, controls, props, presets, telemetry, and measurements stay in `experiment.config.json`. The built-in renderer shows a preview in the lesson and keeps controls in the expanded lab. The chapter's `simulation` section selects the rendering implementation and its chapter-wide settings.

## Build API

```ts
import { compileProject, buildProject } from "mr-md";

const document = compileProject("./mechanics");
buildProject("./mechanics", { outDir: "./public" });
```

The compiler resolves lesson sources and presentation settings. The build loads configured implementations and writes lesson pages, the chapter overview, and shared assets. Existing parse/render/build exports remain available.

Run the example with `bun dist/cli.js dev playground/blog-kit`.
