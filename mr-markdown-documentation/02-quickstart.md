---
title: Quickstart
slug: quickstart
description: Get up and running in seconds. From single-file markdown notes to production-ready multi-page chapters.
author: Mr-Md Team
tags: [getting-started, cli, workflow, setup]
eyebrow: Fast Track
---

# Quickstart

Mr. Markdown builds single interactive lessons and chapters of linked lessons.

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

This generates a file such as `01-intro.md` and appends it to the `lessons` list in `mrmd.config.json`. The configuration array determines lesson order.

Finally, start the development server for the entire folder:

```bash
bunx mr-md dev .
```

Set the lesson order in `mrmd.config.json`:

```json
{
  "lessons": ["01-intro.md", "forces.md", "energy.md"],
  "theme": { "accent": "#2563eb" }
}
```

The folder is one chapter. The list controls lesson numbering, navigation, and previous/next links. Titles come from each lesson's frontmatter or first heading. An entry can be an object with `file` and lesson-specific settings when an override is needed.

Omitting the list enables discovery of top-level `.md` files in filename order. Existing folders where every lesson has a positive integer `index` retain their legacy ordering. An explicit list always takes precedence and includes only the listed files.


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
