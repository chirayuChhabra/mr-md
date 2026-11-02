---
index: 3
title: Modules and Features
slug: modules
description: "Deep dive into all supported blocks: Callouts, KaTeX math, GitHub Flavored Markdown, and Shiki syntax highlighting."
author: Mr-Md Team
tags: [syntax, math, katex, shiki, callouts]
---

# Modules and Features

Use familiar Markdown for the lesson, then add interactive elements where they help explain an idea. This guide shows the syntax for each feature.

## Simulations

Embed interactive JavaScript/TypeScript sandboxes natively using a link to a `.js` or `.ts` file:

> [!important]
> A sibling configuration file such as `orbit.config.json` supplies settings for `orbit.js`. Its `props` values are available to the simulation as `window.__simProps`.

Learn how to build and interact with these sandboxes in the [Creating Simulations](./creating-simulations.html) guide.

**Syntax:**
```markdown
![QCD Simulation](./sims/qcd.js)
```

**Result:**

![QCD Simulation](./sims/qcd.js)

---

## Quizzes

To embed an interactive quiz, create a `.quiz.md` file containing the quiz configuration, and link to it like an image:

```markdown
![Test your knowledge](./quizzes/sample.quiz.md)
```

Quizzes are written using a simple markdown syntax! See the [Creating Quizzes](./creating-quizzes.html) guide for details.

**Result:**

![Test your knowledge](./quizzes/sample.quiz.md)

---

## Columns Layout

When you need side-by-side layouts, use the `<columns>` tag. You can pass raw markdown, code, or LaTeX into individual columns via attributes.

**Syntax:**
```html
<columns label="Compare">
  <column markdown="**Classical Mechanics**\n\nClassical mechanics describes the motion of macroscopic objects, from projectiles to parts of machinery, and astronomical objects." />
  <column markdown="**Quantum Mechanics**\n\nQuantum mechanics describes the physical properties of nature at the scale of atoms and subatomic particles." />
</columns>
```

**Result:**

<columns label="Compare">
  <column markdown="**Classical Mechanics**\n\nClassical mechanics describes the motion of macroscopic objects, from projectiles to parts of machinery, and astronomical objects." />
  <column markdown="**Quantum Mechanics**\n\nQuantum mechanics describes the physical properties of nature at the scale of atoms and subatomic particles." />
</columns>

---

## The Live Theming Engine

`mr-md` features a built-in, real-time theming engine. Click the **Settings Gear** in the corner of your screen to customize the visual presentation of your course.

Readers can choose light, dark, or automatic mode, a color palette, and a UI style in Settings.

---

## Media

Instead of using HTML or shortcodes, `mr-md` extends the standard Markdown image syntax `![caption](src)`.

### Images

**Syntax:**
```markdown
![A beautiful landscape](./media/nature.jpg)
```

**Result:**

![A beautiful landscape](./media/nature.jpg)

### Video and Audio
If the URL ends in `.mp4`, `.webm`, or `.mov`, it renders as a video player. For `.mp3` or `.wav`, it renders as an audio player.

**Syntax:**
```markdown
![Demo Video: Big Buck Bunny - © Blender Foundation](https://www.w3schools.com/html/mov_bbb.mp4)

![Horse Sound Effect](https://www.w3schools.com/html/horse.mp3)
```

**Result:**

![Demo Video: Big Buck Bunny - © Blender Foundation](https://www.w3schools.com/html/mov_bbb.mp4)


![Horse Sound Effect](https://www.w3schools.com/html/horse.mp3)

### YouTube
If the URL contains `youtube.com` or `youtu.be`, it embeds a YouTube player:

**Syntax:**
```markdown
![Khan Academy Tutorial](https://youtube.com/watch?v=dQCsA2cCdvA)
```

**Result:**

![Khan Academy Tutorial](https://youtube.com/watch?v=dQCsA2cCdvA)

---

## Callouts

Use GitHub-flavored blockquotes to render beautiful callouts.

**Syntax:**
```markdown
> [!warning]
> This is a warning.
```

**Result:**
> [!warning]
> This is a warning.

> [!note]
> Supported types include: `note`, `tip`, `important`, `warning`, and `caution`. You can use them to draw attention to crucial information!

---

## Math

**Syntax:**
Inline math uses single dollar signs: `$x = y$`.  
Block math uses double dollar signs: `$$ x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a} $$`.  

**Result:**

Inline math: $x = y$

Block math:
$$ x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a} $$

KaTeX is bundled natively and renders at build-time.

---

## Tables and Lists

Standard Markdown tables are automatically styled.

**Syntax:**
```markdown
| Syntax | Description |
|---|---|
| Header | Title |
```

**Result:**
| Syntax | Description |
|---|---|
| Header | Title |

Nested ordered and unordered lists are also perfectly formatted out of the box.

**Syntax:**
```markdown
1. First item
2. Second item
   - Nested unordered
   - Another one
```

**Result:**
1. First item
2. Second item
   - Nested unordered
   - Another one

---

## Code

Show highlighted code, let learners run an example, or check their output in a challenge. The [code guide](./coding.html) covers languages, options, and complete examples.

````markdown
```javascript run
console.log("Hello, learner!");
```
````
