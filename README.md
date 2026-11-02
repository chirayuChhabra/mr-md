# Mr Markdown

Mr Markdown is an opinionated Markdown framework for building interactive learning pages. It is designed for lessons that mix prose, LaTeX, simulations, media, video, and quizzes without making every author build layout and interaction chrome from scratch.

## Documentation

The official documentation, guides, and showcase are available online at [mrmarkdown.com](https://mrmarkdown.com).

## Quick Start (CLI)

The easiest way to get started is by using the CLI on a single file.

**1. Create a lesson file**
```bash
echo "# Hello World" > lesson.md
```

**2. Start the development server**
```bash
bunx mr-md dev lesson.md
```

**3. Build for production**
```bash
bunx mr-md build lesson.md
```

> **Tip:** You can also pass a directory instead of a single file to process an entire folder at once. For example, you can `cd` into a directory and run `bunx mr-md dev .` or `bunx mr-md build .`.

## CLI Commands

| Command | Description |
|---------|-------------|
| `mr-md build <path>` | Build all chapters or a specific file |
| `mr-md dev <path>` | Start local dev server with hot reloading |
| `mr-md generate <name>` | Generate a new markdown file (alias: `g`) |
| `mr-md skill install` | Install the simulation agent skill globally |
| `mr-md skill update` | Update the installed skill |
| `mr-md skill status` | Show skill installation info |
| `mr-md skill remove` | Uninstall the skill |

## Agent Skills

`mr-md` includes a built-in skill system for AI coding agents. Install the simulation skill to let your AI assistant generate context-aware, high-quality interactive simulations:

```bash
bunx mr-md skill install
```

See the [Agent Skills documentation](https://mrmarkdown.com/agent-skills) for details.

## Features

- **Interactive Simulations** — embed JavaScript/TypeScript sandboxes with theme-aware rendering
- **Quizzes** — multiple-choice quizzes from simple `.quiz.md` files
- **Math** — built-in KaTeX for inline and block LaTeX
- **Media** — images, video, audio, and YouTube embeds via Markdown syntax
- **Theming** — light/dark modes, color palettes, and UI style variants
- **Callouts** — GitHub-flavored alert blockquotes
- **Columns** — responsive side-by-side layouts
- **Hot Reloading** — instant feedback during development

---

## License

Copyright 2026 Chirayu Chhabra

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.