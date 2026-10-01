import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { mdToHtml } from "../src/renderer/markdown/index.js";
import { parseCliArgs } from "../src/cli/utils.js";
import { createDevApp, type DevApp } from "../src/cli/dev.js";

delete process.env.INIT_CWD;
delete process.env.npm_config_local_prefix;

describe("Single-File DX & Course Escalation Tests", () => {
  let tempDir: string;
  let activeApp: DevApp | null = null;

  beforeEach(async () => {
    tempDir = join(import.meta.dir, "..", `test-tmp-sfdx-${Math.random().toString(36).substring(7)}`);
    await mkdir(tempDir, { recursive: true });
    activeApp = null;
  });

  afterEach(async () => {
    if (activeApp) {
      activeApp.close();
      activeApp = null;
    }
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("CLI flag parsing handles port, theme, palette, no-studio, and out flags", () => {
    const args = ["file.md", "-p", "4500", "--theme", "dark", "--palette", "dracula", "--no-studio", "-o", "custom-out"];
    const parsed = parseCliArgs(args);
    expect(parsed.target).toBe("file.md");
    expect(parsed.port).toBe(4500);
    expect(parsed.theme).toBe("dark");
    expect(parsed.palette).toBe("dracula");
    expect(parsed.noStudio).toBe(true);
    expect(parsed.out).toBe("custom-out");
  });

  test("Markdown link rewriting rewrites relative .md links to .html", () => {
    const md = `Here is a [Next Step](./02-arrays.md) and another [Ref](guide.md#section) and an [External](https://example.com/file.md).`;
    const result = mdToHtml(md);
    expect(result.html).toContain('href="./02-arrays.html"');
    expect(result.html).toContain('href="guide.html#section"');
    expect(result.html).toContain('href="https://example.com/file.md"');
  });

  test("mr-md dev on single file does NOT create mrmd.config.json on disk", async () => {
    const filePath = join(tempDir, "standalone.md");
    await writeFile(filePath, "---\ntitle: Standalone Note\n---\n# Standalone Note\n## Overview\nSome content");

    activeApp = await createDevApp([filePath, "--port", "4150"]);

    // Verify output HTML was generated
    expect(existsSync(join(tempDir, "out", "standalone.html"))).toBe(true);

    // Verify mrmd.config.json was NOT written to disk
    expect(existsSync(join(tempDir, "mrmd.config.json"))).toBe(false);

    // Test GET /__api/context returns single-file mode
    const contextRes = await activeApp.fetchHandler(new Request("http://localhost:4150/__api/context"));
    expect(contextRes?.status).toBe(200);
    const contextData = await contextRes?.json();
    expect(contextData.mode).toBe("single");
    expect(contextData.targetFile).toBe("standalone.md");
    expect(contextData.hasDiskConfig).toBe(false);
    expect(contextData.title).toBe("Standalone Note");
    expect(contextData.outline).toBeDefined();
    expect(contextData.outline.length).toBeGreaterThanOrEqual(1);
    expect(contextData.outline[0].label).toBe("Overview");
  });

  test("Frontmatter API updates YAML frontmatter in single-file mode", async () => {
    const filePath = join(tempDir, "lesson.md");
    await writeFile(filePath, "---\ntitle: Initial Title\ndescription: Initial Desc\n---\n# Header\nContent");

    activeApp = await createDevApp([filePath, "--port", "4160"]);

    const updateRes = await activeApp.fetchHandler(new Request("http://localhost:4160/__api/lesson/frontmatter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Updated Title",
        description: "Updated Desc",
        author: "Alice",
        tags: ["physics", "lab"]
      })
    }));
    expect(updateRes?.status).toBe(200);

    // Check file content on disk has updated frontmatter
    const fileContent = await readFile(filePath, "utf-8");
    expect(fileContent).toContain("title: Updated Title");
    expect(fileContent).toContain("description: Updated Desc");
    expect(fileContent).toContain("author: Alice");

    // Check that GET /__api/context reflects the new frontmatter
    const contextRes = await activeApp.fetchHandler(new Request("http://localhost:4160/__api/context"));
    const contextData = await contextRes?.json();
    expect(contextData.title).toBe("Updated Title");
    expect(contextData.frontmatter.author).toBe("Alice");
  });

  test("Promote to course: creating New Lesson in single-file mode promotes to course", async () => {
    const filePath = join(tempDir, "01-intro.md");
    await writeFile(filePath, "---\ntitle: Intro\n---\n# Intro\nFirst lesson");

    activeApp = await createDevApp([filePath, "--port", "4170"]);

    // Verify initially no mrmd.config.json exists
    expect(existsSync(join(tempDir, "mrmd.config.json"))).toBe(false);

    // Create new lesson via API
    const newLessonRes = await activeApp.fetchHandler(new Request("http://localhost:4170/__api/lessons/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "02-advanced" })
    }));
    expect(newLessonRes?.status).toBe(200);
    const resData = await newLessonRes?.json();
    expect(resData.success).toBe(true);
    expect(resData.mode).toBe("course");

    // Verify mrmd.config.json was now created with both lessons
    expect(existsSync(join(tempDir, "mrmd.config.json"))).toBe(true);
    const config = JSON.parse(await readFile(join(tempDir, "mrmd.config.json"), "utf-8"));
    expect(config.lessons).toContain("01-intro.md");
    expect(config.lessons).toContain("02-advanced.md");

    // Verify new lesson file was created
    expect(existsSync(join(tempDir, "02-advanced.md"))).toBe(true);

    // Verify both lessons and course index were built
    expect(existsSync(join(tempDir, "out", "01-intro.html"))).toBe(true);
    expect(existsSync(join(tempDir, "out", "02-advanced.html"))).toBe(true);
    expect(existsSync(join(tempDir, "out", "index.html"))).toBe(true);

    // Verify server context is now course mode
    const contextRes = await activeApp.fetchHandler(new Request("http://localhost:4170/__api/context"));
    const contextData = await contextRes?.json();
    expect(contextData.mode).toBe("course");
    expect(contextData.hasDiskConfig).toBe(true);
  });

  test("CLI flags: --no-studio disables studio routes", async () => {
    const filePath = join(tempDir, "test.md");
    await writeFile(filePath, "# Test\nContent");

    activeApp = await createDevApp([filePath, "--port", "4180", "--no-studio"]);

    const studioRes = await activeApp.fetchHandler(new Request("http://localhost:4180/__studio"));
    expect(studioRes?.status).toBe(404);
  });
});
