---
index: 5
title: Creating Quizzes
slug: creating-quizzes
description: How to construct accessible, multi-step interactive quizzes with markdown-first question definitions.
author: Mr-Md Team
tags: [assessment, interactive, quizzes, education]
---

# Creating Quizzes

Mr Markdown supports interactive multiple-choice quizzes out of the box. A quiz can be written in Markdown or JSON and embedded in a lesson.

## The Quiz Syntax

To create a quiz, create a `.quiz.md` file. Inside, you write questions using a simple custom syntax:
- Use a Markdown h2 heading (`## `) for the questions.
- For the **correct** option, use `++ `.
- For the **incorrect** options, use `-- `.
- Use blockquotes (`>`) for the explanation that appears after a user answers.

*Tip: You don't need to indent anything! This format is completely compatible with Markdown formatters like Prettier.*

Here is an example `checkup.quiz.md`:

```markdown
## A cyclist travels 100 metres in 20 seconds. What is their average speed?

-- 2 m/s
++ 5 m/s
-- 20 m/s

> Average speed is distance divided by time: 100 ÷ 20 = 5 m/s.

```

*Note: All question text, options, and explanations fully support Markdown and KaTeX math formatting!*

## Embedding the Quiz

Once your `.quiz.md` file is ready, you can embed it in any lesson using standard Markdown image syntax:

```markdown
![Test your knowledge](./quizzes/checkup.quiz.md)
```

Each question needs at least two options and exactly one `++` answer. The learner can select one option per question; selecting it immediately reveals the correct answer and explanation and disables further choices. Reload the page to try again. Answers are included in the generated page, so this is a practice activity, not a secure exam.

## JSON alternative

A `.json` quiz uses a zero-based answer index:

```json
{
  "questions": [
    {
      "q": "What is 2 + 2?",
      "options": ["3", "4"],
      "answer": 1,
      "explanation": "Two pairs make four."
    }
  ]
}
```

Embed it with `![Practice](./quizzes/checkup.json)`. Keep quiz files under a subdirectory when building a chapter.
