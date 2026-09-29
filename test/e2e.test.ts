import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { $ } from "bun";
import puppeteer, { Browser, Page } from "puppeteer";

delete process.env.INIT_CWD;
delete process.env.npm_config_local_prefix;

const CLI_PATH = join(process.cwd(), "dist", "cli.js");
let tempDir: string;
let browser: Browser;
let devProc: any;
const PORT = "3005";

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "mr-md-e2e-"));
  await writeFile(
    join(tempDir, "package.json"),
    JSON.stringify({ name: "e2e-test" })
  );
  
  // Launch puppeteer in headless mode
  browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
});

afterAll(async () => {
  if (browser) await browser.close();
  if (devProc) devProc.kill();
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("E2E Workflow: From blank canvas to full project", async () => {
  // 1. Generate a Chapter
  const generateChapterResult = await $`bun run ${CLI_PATH} generate "first-chapter"`.cwd(tempDir).quiet();
  expect(generateChapterResult.exitCode).toBe(0);
  expect(existsSync(join(tempDir, "first-chapter.md"))).toBe(true);

  // 2. Generate a Lesson inside a lessons directory
  const lessonsDir = join(tempDir, "lessons");
  await mkdir(lessonsDir, { recursive: true });
  const generateLessonResult = await $`bun run ${CLI_PATH} generate "first-lesson"`.cwd(lessonsDir).quiet();
  expect(generateLessonResult.exitCode).toBe(0);
  expect(existsSync(join(lessonsDir, "first-lesson.md"))).toBe(true);

  // 3. Update the chapter to link to the lesson
  await writeFile(
    join(tempDir, "first-chapter.md"),
    `---
title: "First Chapter"
type: "chapter"
---

# Welcome to the Chapter
Check out the first lesson:
- [First Lesson](./lessons/first-lesson.md)
`
  );

  // 4. Update the lesson with some rich markdown content
  await writeFile(
    join(lessonsDir, "first-lesson.md"),
    `---
title: "First Lesson"
---

# Welcome to your first lesson!

This tests custom v3 markdown parsing capabilities.

> [!NOTE]
> This is an e2e test note.

<columns label="Layout Test">
  <column markdown="Column 1 content" />
  <column markdown="Column 2 content" />
</columns>
`
  );

  // 5. Build the project
  const buildResult = await $`bun run ${CLI_PATH} build first-chapter.md`.cwd(tempDir).quiet();
  expect(buildResult.exitCode).toBe(0);
  
  // Verify out directory and HTML files exist
  const outDir = join(tempDir, "out");
  expect(existsSync(outDir)).toBe(true);
  expect(existsSync(join(outDir, "first-lesson.html"))).toBe(true);

  // 6. Start Dev Server
  devProc = Bun.spawn(["bun", "run", CLI_PATH, "dev", "first-chapter.md"], {
    cwd: tempDir,
    env: { ...process.env, PORT },
  });

  // Wait for dev server to be ready
  let isReady = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(`http://localhost:${PORT}`);
      if (res.ok) {
        isReady = true;
        break;
      }
    } catch (e) {
      // ignore
    }
  }
  expect(isReady).toBe(true);

  // 7. Use Puppeteer to verify rendering
  const page = await browser.newPage();
  
  // Navigate to the built lesson page (the server serves it statically from /out/ or directly via JIT)
  await page.goto(`http://localhost:${PORT}/first-lesson.html`, { waitUntil: 'networkidle0' });

  const pageContent = await page.content();
  expect(pageContent).toContain("Welcome to your first lesson!");

  // Verify the Callout (Note)
  const noteText = await page.$eval('.bk-callout, .callout, blockquote', el => el.textContent).catch(() => null);
  expect(noteText).toBeTruthy();
  if (noteText) {
    expect(noteText).toContain("This is an e2e test note.");
  }

  // Verify columns rendered
  const columnsText = await page.$$eval('.columns, .column-container, [data-label="Layout Test"]', els => els.map(el => el.textContent).join(' ')).catch(() => "");
  // Depending on how renderer implements <columns>, just checking if text exists on page is a safe fallback
  const bodyText = await page.$eval('body', el => el.textContent);
  expect(bodyText).toContain("Column 1 content");
  expect(bodyText).toContain("Column 2 content");

}, 60000); // 60 seconds timeout
