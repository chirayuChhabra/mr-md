# Mr Markdown

Mr Markdown is an opinionated Markdown framework for building interactive learning pages. It is designed for lessons that mix prose, LaTeX, simulations, media, video, and quizzes without making every author build layout and interaction chrome from scratch.

## Documentation

The official documentation, guides, and showcase are available online at [mrmarkdown.com](https://mrmarkdown.com).

## Quick Start (CLI)

The easiest way to get started is by using the CLI on a single file.

**1. Create a lesson file**
```bash
echo "# Hello World" > lesson.md
```

**2. Start the development server**
```bash
bunx mr-md dev lesson.md
```

**3. Build for production**
```bash
bunx mr-md build lesson.md
```

> **Tip:** You can also pass a directory instead of a single file to process an entire folder at once. For example, you can `cd` into a directory and run `bunx mr-md dev .` or `bunx mr-md build .`.

---

## License

Copyright (c) 2026 Chirayu Chhabra

Mr Markdown is provided under the PolyForm Noncommercial License 1.0.0.

**Free Use**
The software is free to use for personal, educational, and non-profit purposes. This includes student projects, hobbyist endeavors, academic teaching, and public research.

**Commercial Use**
Any commercial application, including use by for-profit entities, internal business operations, or paid freelance work, requires a separate commercial license.

For commercial licensing inquiries, please contact: contact@chirayuchhabra.com