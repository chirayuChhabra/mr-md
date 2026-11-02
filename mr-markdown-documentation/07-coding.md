---
index: 4
title: Code in Lessons
slug: coding
description: Add highlighted examples, runnable code, and output-checked challenges to a lesson.
author: Mr-Md Team
tags: [code, programming, runners, challenges]
---

# Code in Lessons

Use a code fence to show an example, add `run` to let learners experiment, or use `challenge` to check their output. Choose the lightest option that helps the lesson.

## Highlight an example

A language after the opening fence enables syntax highlighting. This is a display-only example:

````markdown
```python
speed = distance / time
```
````

## Let learners run code

Add `run` (or `runnable`) after the language. The code is editable and the output appears below the editor.

````markdown
```javascript run title="Calculate speed"
const distance = 100;
const time = 20;
console.log(distance / time, "m/s");
```
````

Try it here:

```javascript run title="Calculate speed"
const distance = 100;
const time = 20;
console.log(distance / time, "m/s");
```

Use `readonly` when learners should run the example without editing it, or `autorun` to run it when the page loads. For example: `javascript run readonly autorun`.

## Compile and run C++

Compiled-language examples use a two-step interface by default. The first action sends the code to Wandbox to compile and run it; the second displays the cached output. Editing the code requires another compilation. Try this example:

```cpp run title="Sum a list"
#include <iostream>

int main() {
    int values[] = {10, 20, 30};
    int sum = 0;
    for (int value : values) sum += value;
    std::cout << "Sum: " << sum << std::endl;
}
```

Write it as a `cpp run` fence:

````markdown
```cpp run title="Sum a list"
#include <iostream>
int main() {
    std::cout << "Sum: " << 10 + 20 + 30 << std::endl;
}
```
````

Wandbox needs a network connection. The first action compiles **and runs** the program remotely; the next action replays its saved output rather than executing a local binary. Do not send secrets in code or input.

## Write a challenge

A challenge compares the program's output with an expected value. Put its settings in YAML frontmatter inside the fence; this metadata is not shown as starter code.

````markdown
```python challenge
---
title: Even squares
expected: "[4, 16, 36]"
hint: Keep even numbers before squaring them.
---
numbers = [1, 2, 3, 4, 5, 6]
# Print the squares of the even numbers.
print([n**2 for n in numbers if n % 2 == 0])
```
````

```python challenge
---
title: Even squares
expected: "[4, 16, 36]"
hint: Keep even numbers before squaring them.
---
numbers = [1, 2, 3, 4, 5, 6]
# Print the squares of the even numbers.
print([n**2 for n in numbers if n % 2 == 0])
```

The default match is `exact`. Use `match: contains` to look for a substring or `match: regex` to check a pattern. For example, `expected: "^Rolled: [1-6]$"` with `match: regex` accepts a dice roll from 1 to 6. Output matching checks what the program prints, not how it reaches the answer.

## Test a compiled program

Challenges work with compiled languages too. This example checks the printed result against `expected` and shows a hint and a mismatch when the answer differs. Edit the program to make the check pass:

```cpp challenge
---
title: Sum the first five numbers
expected: "15"
hint: Add the integers from 1 through 5.
---
#include <iostream>
int main() {
    int sum = 0;
    // Add the numbers 1 through 5 to sum.
    std::cout << sum << std::endl;
}
```

The corresponding Markdown is:

````markdown
```cpp challenge
---
title: Sum the first five numbers
expected: "15"
hint: Add the integers from 1 through 5.
---
#include <iostream>
int main() {
    int sum = 0;
    // Add the numbers 1 through 5 to sum.
    std::cout << sum << std::endl;
}
```
````

Challenges compare output; they are not a hidden test suite and do not verify the implementation or multiple inputs automatically. Add separate challenges when you want learners to check different cases.

## Match a range of outputs

Use a regular expression when more than one output is valid. Here the expected output accepts any single die roll:

```python challenge
---
title: Roll a die
match: regex
expected: "^Rolled: [1-6]$"
hint: Use random.randint(1, 6).
---
import random
print(f"Rolled: {random.randint(1, 6)}")
```

## Runner options

Options may be written on the fence; `title`, `stdin`, `timeout`, `expected`, `match`, and `hint` can also be placed in the challenge frontmatter.

| Option | Purpose |
| --- | --- |
| `run` or `runnable` | Make the block executable. |
| `challenge` or `quiz` | Check output against an expected answer. |
| `title="Example"` | Label the runner. |
| `readonly` or `editable=false` | Disable editing. |
| `autorun` | Run when the page loads. |
| `stdin="input"` | Supply standard input. |
| `timeout=3000` | Set the timeout in milliseconds; the default is 3000. Remote execution uses at least 35 seconds. |
| `expected="5"` | Set the expected output. |
| `match="exact"`, `match="contains"`, or `match="regex"` | Choose the output comparison. |
| `hint="Try dividing"` | Give learners a hint. |

## Languages and connectivity

- JavaScript and TypeScript execute in a browser worker.
- Python runs in the browser with Skulpt, which is loaded from a CDN on demand.
- C, C++, Rust, Go, Java, C#, Zig, Swift and other supported languages use Wandbox. Code and standard input are sent to that remote service, so a connection and service availability are required.

Compiled-language examples normally use the two-step interface described above; challenges default to running and checking output.

In the editor, use **Ctrl+Enter** or **Cmd+Enter** to run or check an answer. Tab and Shift+Tab indent and unindent; Ctrl+/ or Cmd+/ toggles a line comment.
