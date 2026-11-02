---
index: 3
title: Modules and Features
slug: modules
---

# Modules and Features

`mr-md` version 3 leverages standard Markdown syntax to elegantly construct complex modules.

## The Live Theming Engine

`mr-md` features a built-in, real-time theming engine. Click the **Settings Gear** in the corner of your screen to customize the visual presentation of your course.

You can instantly:
- **Toggle Light & Dark Modes**: Seamlessly switch between light, dark, and auto modes.
- **Customize Color Palettes**: Swap out the core accent colors by choosing between **Ink**, **Field**, or **Ember**.
- **Transform the UI Style**: Change the overall aesthetic profile of the components on the fly by selecting the **Standard**, **Neo Brutalist**, or **Playful** UI modes!

> [!tip]
> **Easter Egg:** Double-click on any of the color palette icons in the Settings panel to unlock secret "Pro" color palettes!

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

## Media

Instead of using HTML or shortcodes, `mr-md` v3 extends the standard Markdown image syntax `![caption](src)`.

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
![Demo Video](https://www.w3schools.com/html/mov_bbb.mp4)
![Horse Sound Effect](https://www.w3schools.com/html/horse.mp3)
```

**Result:**

![Demo Video](https://www.w3schools.com/html/mov_bbb.mp4)

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

## Quizzes

To embed an interactive quiz, create a `.quiz.md` file containing the quiz configuration, and link to it like an image:

```markdown
![Test your knowledge](./quizzes/sample.quiz.md)
```

Quizzes are written using a simple markdown syntax! See the [Creating Quizzes](./creating-quizzes.md) guide for details.

**Result:**

![Test your knowledge](./quizzes/sample.quiz.md)

---

## Simulations

Embed interactive JavaScript sandboxes natively using a link to a `.js` or `.ts` file:

> [!important]
> If a `.config.json` file is placed next to your script, its properties will automatically be injected into your simulation as `window.__simProps`.

**Syntax:**
```markdown
![QCD Simulation](./sims/qcd.js)
```

**Result:**

![QCD Simulation](./sims/qcd.js)

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
