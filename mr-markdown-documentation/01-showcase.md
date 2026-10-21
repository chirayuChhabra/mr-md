---
index: 1
title: Showcase
slug: showcase
description: A complete tour of Mr Markdown interactive components, simulations, quizzes, and modern layouts.
author: Mr Markdown Core Team
tags: [overview, simulations, quizzes, components]
eyebrow: Tour & Modules
---

# Showcase

Welcome to `mr-md` version 4! This page is a kitchen sink of all the features and modules available in the framework.

## Interactive Runnable Code

Students can tweak, edit, and run code right in their browser with instant console output on the bottom!

### JavaScript & TypeScript (Instant Client-Side Sandbox)

```javascript run title="Fibonacci Sequence"
function fib(n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}

const terms = [0, 1, 2, 3, 4, 5, 6, 7, 8];
console.log("Fibonacci numbers:", terms.map(fib));
```

---

### Python (Fast In-Browser Engine)

```python run title="Python List Comprehension"
numbers = [1, 2, 3, 4, 5, 6]
squares = [x**2 for x in numbers if x % 2 == 0]
print(f"Even squares: {squares}")
```

---

### Compiled Languages (Two-Stage Compile & Fast Binary Run)

```cpp run title="Modern C++ Output"
#include <iostream>
#include <vector>
#include <numeric>

int main() {
    std::vector<int> nums = {10, 20, 30, 40};
    int sum = std::accumulate(nums.begin(), nums.end(), 0);
    std::cout << "Sum from compiled C++: " << sum << std::endl;
    return 0;
}
```

---

### Interactive Coding Quizzes & Challenges

Test students' problem-solving skills with automatic validation, hints, regex matching, and mismatch diffs:

```python challenge
---
title: "Even Squares"
expected: "[4, 16, 36]"
hint: "Use a list comprehension with 'if x % 2 == 0' and 'x**2'"
---
numbers = [1, 2, 3, 4, 5, 6]

# Task: Filter even numbers and calculate their squares
even_squares = [x**2 for x in numbers if x % 2 == 0]

print(even_squares)
```

---

### Dynamic Challenge with Regex Matching

Challenge students to produce randomized outputs (e.g. dice rolls, UUIDs, or patterns):

```python challenge
---
title: "Dice Roll"
match: regex
expected: "^Rolled: [1-6]$"
hint: "Use random.randint(1, 6) to roll a 6-sided die"
---
import random

# Task: Roll a 6-sided die and print 'Rolled: <number>'
roll = random.randint(1, 6)
print(f"Rolled: {roll}")
```

---

### Compiled Language Challenge (C++ Algorithm)

Students can also solve algorithmic challenges in compiled languages with automated evaluation:

```cpp challenge
---
title: "Sum of Multiples"
expected: "Sum: 233168"
hint: "Iterate from 1 to 999 and check if i % 3 == 0 || i % 5 == 0"
---
#include <iostream>

// Task: Find the sum of all multiples of 3 or 5 below 1000
int main() {
    int sum = 0;
    for (int i = 1; i < 1000; ++i) {
        if (i % 3 == 0 || i % 5 == 0) {
            sum += i;
        }
    }
    std::cout << "Sum: " << sum << std::endl;
    return 0;
}
```

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

### Images
Embed images natively using Markdown syntax:

![Nature](./media/nature.jpg)

---

### Video and Audio
Embed audio or video files directly by using their extensions:

![Demo Video: Big Buck Bunny - © Blender Foundation](https://www.w3schools.com/html/mov_bbb.mp4)

---

### YouTube
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
