---
title: Reuse a custom quiz
description: The same question file with a lesson-specific quiz heading.
---

# Reuse a custom quiz

This page uses the same `check.json` and the same `testing.js` renderer as the first lesson. Its entry in `content.lessons` sets a different quiz heading.

Choose the second answer, then the first. The feedback beneath the buttons comes from the custom renderer.

![Check your understanding](./check.json)

To see the same question in the built-in quiz, remove the chapter's `testing` section and this lesson's `testing` override from `mrmd.config.json`, then save.
