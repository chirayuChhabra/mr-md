---
index: 4
title: Creating Quizzes
slug: creating-quizzes
---

# Creating Quizzes

Mr Markdown supports interactive multiple-choice quizzes out of the box. Quizzes are defined entirely in Markdown, making them easy to write and extremely robust.

## The Quiz Syntax

To create a quiz, create a `.quiz.md` file. Inside, you write questions using a simple custom syntax:
- Use a Markdown h2 heading (`## `) for the questions.
- For the **correct** option, use `++ `.
- For the **incorrect** options, use `-- `.
- Use blockquotes (`>`) for the explanation that appears after a user answers.

*Tip: You don't need to indent anything! This format is completely compatible with Markdown formatters like Prettier.*

Here is an example `checkup.quiz.md`:

```markdown
## How do you mount an interactive sandboxed JavaScript simulation in Mr Markdown v3?

-- By using an `<iframe>` tag
++ By linking to a `.js` or `.ts` file using standard Markdown image syntax
-- By using the `<script>` tag
-- By using the `<columns>` tag

> In `mr-md` v3, you can embed interactive JavaScript sandboxes natively using a link to a script file, e.g. `![Simulation](./sim.js)`.

## How do you add a red callout box for critical information?

-- `> [!tip]`
-- `> [!warning]`
++ `> [!important]`
-- `> [!note]`

> The `> [!important]` callout creates a red/accented box for critical information using standard GitHub-flavored blockquotes.
```

*Note: All question text, options, and explanations fully support Markdown and KaTeX math formatting!*

## Embedding the Quiz

Once your `.quiz.md` file is ready, you can embed it in any lesson using standard Markdown image syntax:

```markdown
![Test your knowledge](./quizzes/checkup.quiz.md)
```