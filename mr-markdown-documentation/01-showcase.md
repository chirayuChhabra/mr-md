---
index: 1
title: Showcase
slug: showcase
---

# Showcase

Welcome to `mr-md` version 3! This page is a kitchen sink of all the features and modules available in the framework.

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

## Callouts

Version 3 uses native GitHub-flavored blockquotes for callouts:

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

## Math

KaTeX is built-in. Inline math looks like this: $E = mc^2$.
Block math looks like this:

$$
f(x) = \int_{-\infty}^\infty \hat f(\xi)\,e^{2 \pi i \xi x} \,d\xi
$$

## Media

Embed images natively using Markdown syntax:

![Nature](./media/nature.jpg)

Embed audio or video files directly by using their extensions:

![Demo Video](https://www.w3schools.com/html/mov_bbb.mp4)

Embed YouTube videos instantly:

![Mr Markdown Tutorial](https://youtube.com/watch?v=dQw4w9WgXcQ)

## Quizzes

Inject multiple-choice quizzes using a modular markdown file:

![Test your knowledge](./quizzes/sample.quiz.md)

## Simulations

Embed interactive JavaScript sandboxes natively:

![QCD Simulation](./sims/qcd.js)

## Columns Layout

You can structure your content in responsive columns:

<columns label="Compare">
  <column markdown="**Left Side**: This text is rendered in the left column." />
  <column markdown="**Right Side**: And this text goes on the right." />
</columns>
