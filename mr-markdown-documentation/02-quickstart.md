---
index: 2
title: Quickstart
slug: quickstart
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

Your lesson will be available in the browser with hot-module reloading on edits.

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

This command automatically calculates the next available numeric index in the directory, generating a file such as `01-intro.md`. It pre-populates the correct YAML frontmatter and title heading, so you do not need to manually append numeric prefixes.

Finally, start the development server for the entire folder:

```bash
bunx mr-md dev .
```

`mr-md` will map your files to routes and generate navigation for the chapter based on your file structure.

## AI-Assisted Simulations

`mr-md` ships with a built-in agent skill that lets AI coding assistants generate interactive simulations for your lessons. To install the skill globally:

```bash
bunx mr-md skill install
```

Once installed, your AI coding agent can create context-aware simulations that integrate with the `mr-md` theme system, canvas API, and host-controlled UI — out of the box.

See the [Agent Skills](./agent-skills) guide for details.

---

## Building for Production

When the content is ready to be published, you can compile the Markdown files into a static HTML bundle.

```bash
bunx mr-md build .
```

The output will be prepared for deployment to a static hosting provider (e.g., Vercel, Netlify, or GitHub Pages).
