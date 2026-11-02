---
index: 3
title: Modules and Features
slug: modules
description: "Deep dive into all supported blocks: Callouts, KaTeX math, GitHub Flavored Markdown, and Shiki syntax highlighting."
author: Documentation SIG
tags: [syntax, math, katex, shiki, callouts]
---

# Modules and Features

`mr-md` leverages standard Markdown syntax to elegantly construct complex modules.

## Simulations

Embed interactive JavaScript/TypeScript sandboxes natively using a link to a `.js` or `.ts` file:

> [!important]
> If a `.config.json` file is placed next to your script, its properties will automatically be injected into your simulation as `window.__simProps`.

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

You can instantly:
- **Toggle Light & Dark Modes**: Seamlessly switch between light, dark, and auto modes.
- **Customize Color Palettes**: Swap out the core accent colors by choosing between **Ink**, **Field**, or **Ember**.
- **Transform the UI Style**: Change the overall aesthetic profile of the components on the fly by selecting the **Standard**, **Neo Brutalist**, or **Playful** UI modes!

> [!tip]
> **Easter Egg:** Double-click on any of the color palette icons in the Settings panel to unlock secret "Pro" color palettes!

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

## Interactive Runnable Code Blocks

Transform any standard Markdown code fence into an in-browser editable code runner with integrated console output by appending `run` or `runnable`.

### Syntax Options

| Flag / Option | Description | Default |
|---|---|---|
| `run` or `runnable` | Activates interactive runner mode | Required |
| `challenge` or `quiz` | Activates coding challenge / quiz mode | Optional |
| `readonly` or `editable=false` | Disallows student editing (run-only) | `editable=true` |
| `autorun` | Automatically executes on page load | `false` |
| `timeout=3000` | Maximum execution time in milliseconds | `3000` |
| `title="Label"` | Displays a custom title in the runner header | Optional |
| `stdin="input"` | Supplies standard input to the script | Optional |
| `expected="..."` | Target output for challenge validation | Optional |
| `match="exact|regex|contains"` | Evaluation strategy for challenges | `exact` |
| `hint="..."` | Guidance shown in collapsible drawer | Optional |

### Supported Languages
- **JavaScript & TypeScript (`js`, `ts`)**: Runs in an isolated Web Worker sandbox with 0ms startup and zero server load.
- **Python (`python`, `py`)**: Fast in-browser execution with execution limits preventing infinite loops.
- **Compiled Languages (`cpp`, `c`, `rust`, `go`, `java`, `csharp`, `zig`, `swift`)**: Two-stage compilation flow: students click **Compile** to build and view diagnostics, followed by **Run Binary** for instant machine-speed execution.

### Keyboard Shortcuts
- `Ctrl + Enter` or `Cmd + Enter`: Run code or check answer.
- `Cmd + /` or `Ctrl + /`: Toggle line comment on single line or selection.
- `Tab`: Indent by 2 spaces (or multi-line indent).
- `Shift + Tab`: Unindent by 2 spaces.
- `Enter`: Smart auto-indentation matching previous line.

### Interactive Coding Challenges (Quizzes)

You can define coding challenges with clean YAML frontmatter at the top of the block. The frontmatter is automatically stripped from the student's starter code:

```markdown
```python challenge
---
title: "Quiz: Even Squares"
expected: "[4, 16, 36]"
hint: "Use x % 2 == 0 and x**2"
match: exact
---
numbers = [1, 2, 3, 4, 5, 6]
# Task: Calculate squares of even numbers
even_squares = [x**2 for x in numbers if x % 2 == 0]
print(even_squares)
```
```

**Regex matching for dynamic outputs:**

```markdown
```python challenge
---
title: "Quiz: Random Roll"
match: regex
expected: "^Rolled: [1-6]$"
hint: "Use random.randint(1, 6)"
---
import random
print(f"Rolled: {random.randint(1, 6)}")
```
```

**Example:**

```markdown
```javascript run title="Array Map & Filter"
const numbers = [1, 2, 3, 4, 5, 6, 7, 8];
const evens = numbers.filter(n => n % 2 === 0);
console.log("Original:", numbers);
console.log("Evens:", evens);
```
```

**Result:**

```javascript run title="Array Map & Filter"
const numbers = [1, 2, 3, 4, 5, 6, 7, 8];
const evens = numbers.filter(n => n % 2 === 0);
console.log("Original:", numbers);
console.log("Evens:", evens);
```
