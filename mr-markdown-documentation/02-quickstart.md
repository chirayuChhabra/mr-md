---
index: 2
title: Quickstart
slug: quickstart
description: Get up and running in seconds. From single-file markdown notes to production-ready multi-page chapters.
author: Mr-Md Team
tags: [getting-started, cli, workflow, setup]
eyebrow: Fast Track
---

# Quickstart

Getting started with `mr-md` does not require complex boilerplate. You can create a single interactive lesson or build a multi-page course.

## 1. Single File Project

For isolated documents, you can run the development server directly against a single Markdown file. 

First, create a new Markdown file and add some content (you can use the command below, or create your own `lesson.md` manually):

```bash
echo "# Hello World" > lesson.md
```

Then, start the development server:

```bash
bunx mr-md dev lesson.md
```

Open the URL printed by the server. Edits trigger a rebuild and browser reload; pass `--open` to open the page automatically.

## 2. Multi-Page Chapter

To build a structured chapter with multiple lessons, first create and enter a new directory for your project (or use an existing one).

> [!note]
> The name of your directory will automatically be used as the title for your chapter! For example, a folder named \`01-getting-started\` becomes a chapter titled **Getting Started**.
```bash
mkdir my-chapter && cd my-chapter
```

Next, use the `generate` command to scaffold a new lesson. 

```bash
bunx mr-md generate intro
```

> [!tip]
> You can use the `g` alias instead of `generate`. For example: `bunx mr-md g intro`.

This command automatically calculates the next available numeric index in the directory, generating a file such as `01-intro.md`. It pre-populates YAML frontmatter with the index and a title heading, so you do not need to manually append numeric prefixes.

Finally, start the development server for the entire folder:

```bash
bunx mr-md dev .
```

Each top-level lesson must have a positive `index` in its YAML frontmatter. Indexes must be unique and consecutive, starting at 1. The generated files already include an index; for a hand-written lesson, add:

```yaml
---
index: 1
title: Introduction
---
```

`mr-md` orders the chapter by these indexes and generates navigation. Keep quiz files in a subdirectory such as `quizzes/`, since top-level Markdown files are treated as lessons.

## AI-Assisted Simulations

`mr-md` ships with a built-in agent skill that lets AI coding assistants generate interactive simulations for your lessons. To install the skill globally:

```bash
bunx mr-md skill install
```

Once installed, your AI coding agent can create context-aware simulations that integrate with the `mr-md` theme system, canvas API, and host-controlled UI — out of the box.

See the [Agent Skills](./agent-skills.html) guide for details.

---

## Building for Production

When the content is ready to be published, you can compile the Markdown files into a static HTML bundle.

```bash
bunx mr-md build .
```

The generated site is written to `out/` inside the target directory (or next to a single input file). Deploy the contents of `out/` to a static host. Some interactive features need a network connection; see [Modules and Features](./modules.html).

For a background preview use `bunx mr-md dev . -d`, then `bunx mr-md stop .` to stop it.
