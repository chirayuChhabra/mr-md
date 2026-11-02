---
index: 1
title: Showcase
slug: showcase
description: A complete tour of Mr Markdown interactive components, simulations, quizzes, and modern layouts.
author: Mr-Md Team
tags: [overview, simulations, quizzes, components]
eyebrow: Tour & Modules
---

# Learn with Mr Markdown

A lesson can bring an explanation, a model, and a quick check together on the same page. Explore the examples below, then follow the [Quickstart](./quickstart.html) to make a lesson of your own.

## Explain an idea

Markdown handles the words; math and callouts give you room to make a point clear. For example, speed is distance divided by time:

$$v = \frac{d}{t}$$

> [!tip]
> Keep units consistent: metres divided by seconds gives metres per second.

## Explore a model

A simulation lets a learner change something and see what happens. This example is embedded from a JavaScript file; the [simulation guide](./creating-simulations.html) shows how to create your own.

![QCD Simulation](./sims/qcd.js)

## Check understanding

A short question can give immediate feedback while the idea is still fresh. The [quiz guide](./creating-quizzes.html) explains how to write one.

![Test your knowledge](./quizzes/sample.quiz.md)

## Try some code

When code is part of the subject, learners can edit and run it inside the lesson:

```javascript run title="Calculate speed"
const distance = 100; // metres
const time = 20; // seconds
console.log(distance / time, "m/s");
```

JavaScript and TypeScript run in a browser worker. Python loads Skulpt from a CDN, and languages such as C++ use the remote Wandbox service. Remote execution sends code and input to that service and requires a connection. See [Code in Lessons](./coding.html) for authoring syntax, challenges, and options.

## Put a lesson together

Add images, audio, video, columns, and links wherever they help the explanation. The [feature guide](./modules.html) covers the syntax; [Quickstart](./quickstart.html) takes you from a Markdown file to a built chapter.


## Compare ideas side by side

Columns help place two perspectives together:

<columns label="Two ways to learn">
  <column markdown="**Observe**\n\nChange one variable and describe what happens." />
  <column markdown="**Explain**\n\nUse the model to explain why it happens." />
</columns>

## Bring in media

A picture can give a lesson context, while video and audio can demonstrate things that are hard to describe in words.

![A landscape](./media/nature.jpg)

![Big Buck Bunny video — © Blender Foundation](https://www.w3schools.com/html/mov_bbb.mp4)

## Organize the essentials

Use tables, lists, and callouts to make an explanation easier to scan.

| Quantity | Symbol | Unit |
| --- | --- | --- |
| Distance | $d$ | metre (m) |
| Time | $t$ | second (s) |
| Speed | $v$ | metres per second (m/s) |

> [!note]
> A model is useful when its assumptions are clear. Ask learners what it includes and what it leaves out.

Readers can also open Settings to choose a theme, palette, and interface style.
