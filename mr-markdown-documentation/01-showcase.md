---
index: 1
title: Showcase
slug: showcase
---

# Showcase

Welcome to `mr-md` version 4! This page is a kitchen sink of all the features and modules available in the framework.

## Simulations

Embed interactive JavaScript/TypeScript sandboxes natively. Simulations are theme-aware and fully responsive:

![QCD Simulation](./sims/qcd.js)

## Quizzes

Inject interactive multiple-choice quizzes using a modular markdown file:

![Test your knowledge](./quizzes/sample.quiz.md)

## Columns Layout

Structure your content side-by-side with responsive column components:

<columns label="Compare">
  <column markdown="**Left Side**: This text is rendered in the left column." />
  <column markdown="**Right Side**: And this text goes on the right." />
</columns>

## Media

Embed images natively using Markdown syntax:

![Nature](./media/nature.jpg)

Embed audio or video files directly by using their extensions:

![Demo Video: Big Buck Bunny - © Blender Foundation](https://www.w3schools.com/html/mov_bbb.mp4)


Embed YouTube videos instantly:

![Mr Markdown Tutorial](https://youtube.com/watch?v=dQw4w9WgXcQ)

## Math

KaTeX is built-in. Inline math looks like this: $E = mc^2$.
Block math looks like this:

$$
f(x) = \int_{-\infty}^\infty \hat f(\xi)\,e^{2 \pi i \xi x} \,d\xi
$$

## Callouts

Use native GitHub-flavored blockquotes to highlight important information:

> [!note]
> This is a standard note callout.

> [!tip]
> Pro tip: You can use these to highlight shortcuts!

> [!warning]
> Be careful, this is a warning callout.

> [!important]
> Critical alerts use the important format.

> [!caution]
> Proceed with caution when performing irreversible actions.

## Rich Prose and Typography

Standard Markdown is fully supported, including **bold**, *italics*, and inline code like `const x = 42;`.

### Lists

1. Ordered item
2. Another ordered item
   - Nested unordered
   - Nested unordered

### Tables

| Syntax      | Description |
| ----------- | ----------- |
| Header      | Title       |
| Paragraph   | Text        |
