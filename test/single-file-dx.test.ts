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

  test("Single-file mode: adding lesson creates independent file, and POST /__api/course/convert migrates to course folder", async () => {
    const filePath = join(tempDir, "01-intro.md");
    await writeFile(filePath, "---\ntitle: Intro\n---\n# Intro\nFirst lesson");
    const siblingSim = join(tempDir, "01-intro.sim.js");
    await writeFile(siblingSim, "// demo simulation");

    activeApp = await createDevApp([filePath, "--port", "4170"]);

    // Verify initially no mrmd.config.json exists
    expect(existsSync(join(tempDir, "mrmd.config.json"))).toBe(false);

    // 1. Create new lesson via POST /__api/lessons/new in single mode
    const newLessonRes = await activeApp.fetchHandler(new Request("http://localhost:4170/__api/lessons/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "02-advanced" })
    }));
    expect(newLessonRes?.status).toBe(200);
    const resData = await newLessonRes?.json();
    expect(resData.success).toBe(true);
    expect(resData.mode).toBe("single");
    expect(resData.file).toBe("02-advanced.md");

    // Still in single mode, no mrmd.config.json created yet
    expect(existsSync(join(tempDir, "mrmd.config.json"))).toBe(false);
    expect(existsSync(join(tempDir, "01-intro.md"))).toBe(true);
    expect(existsSync(join(tempDir, "02-advanced.md"))).toBe(true);
    expect(existsSync(join(tempDir, "out", "02-advanced.html"))).toBe(true);

    // Context returns single mode and both files in allFiles
    const contextRes1 = await activeApp.fetchHandler(new Request("http://localhost:4170/__api/context"));
    const context1 = await contextRes1?.json();
    expect(context1.mode).toBe("single");
    expect(context1.allFiles).toContain("01-intro.md");
    expect(context1.allFiles).toContain("02-advanced.md");

    // 2. User chooses "Convert to Course" via POST /__api/course/convert
    const convertRes = await activeApp.fetchHandler(new Request("http://localhost:4170/__api/course/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseName: "Physics 101" })
    }));
    expect(convertRes?.status).toBe(200);
    const convertData = await convertRes?.json();
    expect(convertData.success).toBe(true);
    expect(convertData.mode).toBe("course");
    expect(convertData.courseFolder).toBe("physics-101");

    const courseDir = join(tempDir, "physics-101");
    expect(existsSync(courseDir)).toBe(true);

    // Verify original file and sibling were moved cleanly into courseDir
    expect(existsSync(join(courseDir, "01-intro.md"))).toBe(true);
    expect(existsSync(join(courseDir, "01-intro.sim.js"))).toBe(true);
    expect(existsSync(join(courseDir, "02-advanced.md"))).toBe(true);
    expect(existsSync(join(tempDir, "01-intro.md"))).toBe(false);
    expect(existsSync(join(tempDir, "01-intro.sim.js"))).toBe(false);
    expect(existsSync(join(tempDir, "02-advanced.md"))).toBe(false);

    // Verify mrmd.config.json was created inside courseDir with user's course title
    expect(existsSync(join(tempDir, "mrmd.config.json"))).toBe(false);
    expect(existsSync(join(courseDir, "mrmd.config.json"))).toBe(true);
    const config = JSON.parse(await readFile(join(courseDir, "mrmd.config.json"), "utf-8"));
    expect(config.title).toBe("Physics 101");
    expect(config.lessons).toContain("01-intro.md");
    expect(config.lessons).toContain("02-advanced.md");

    // Verify both lessons and course index were built in courseDir/out
    expect(existsSync(join(courseDir, "out", "01-intro.html"))).toBe(true);
    expect(existsSync(join(courseDir, "out", "02-advanced.html"))).toBe(true);
    expect(existsSync(join(courseDir, "out", "index.html"))).toBe(true);

    // Verify parent out directory was cleaned up
    expect(existsSync(join(tempDir, "out", "01-intro.html"))).toBe(false);

    // Verify server context is now course mode
    const contextRes2 = await activeApp.fetchHandler(new Request("http://localhost:4170/__api/context"));
    const contextData2 = await contextRes2?.json();
    expect(contextData2.mode).toBe("course");
    expect(contextData2.title).toBe("Physics 101");
    expect(contextData2.hasDiskConfig).toBe(true);
  });

  test("Convert to course: courseName is mandatory and returns 400 if missing, empty, or invalid", async () => {
    const filePath = join(tempDir, "standalone-note.md");
    await writeFile(filePath, "---\ntitle: Standalone Note\n---\n# Note\nSome content");

    activeApp = await createDevApp([filePath, "--port", "4175"]);

    // Create new lesson
    await activeApp.fetchHandler(new Request("http://localhost:4175/__api/lessons/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "lesson-2" })
    }));

    // Convert without courseName should fail with 400
    const convertEmptyRes = await activeApp.fetchHandler(new Request("http://localhost:4175/__api/course/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    }));
    expect(convertEmptyRes?.status).toBe(400);
    const emptyData = await convertEmptyRes?.json();
    expect(emptyData.error).toContain("Course name is required");

    // Convert with whitespace only should fail with 400
    const convertWhitespaceRes = await activeApp.fetchHandler(new Request("http://localhost:4175/__api/course/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseName: "   " })
    }));
    expect(convertWhitespaceRes?.status).toBe(400);
    const whitespaceData = await convertWhitespaceRes?.json();
    expect(whitespaceData.error).toContain("Course name is required");

    // Convert with invalid symbols only should fail with 400
    const convertSymbolsRes = await activeApp.fetchHandler(new Request("http://localhost:4175/__api/course/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseName: "???" })
    }));
    expect(convertSymbolsRes?.status).toBe(400);
    const symbolsData = await convertSymbolsRes?.json();
    expect(symbolsData.error).toContain("valid course name");
  });

  test("Convert to course: rejects existing folder with 409 and avoids collisions", async () => {
    const filePath = join(tempDir, "standalone-note.md");
    await writeFile(filePath, "---\ntitle: Standalone Note\n---\n# Note\nSome content");

    activeApp = await createDevApp([filePath, "--port", "4176"]);

    // Pre-create existing folder "existing-course"
    const existingFolder = join(tempDir, "existing-course");
    await mkdir(existingFolder, { recursive: true });
    await writeFile(join(existingFolder, "precious.txt"), "important data");

    // Convert attempting to use existing course folder name
    const collisionRes = await activeApp.fetchHandler(new Request("http://localhost:4176/__api/course/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseName: "Existing Course" })
    }));
    expect(collisionRes?.status).toBe(409);
    const collisionData = await collisionRes?.json();
    expect(collisionData.error).toContain("already exists");
    expect(collisionData.error).toContain("collisions");

    // Verify existing folder content was untouched
    expect(existsSync(join(existingFolder, "precious.txt"))).toBe(true);
    // Verify source markdown was not moved or lost
    expect(existsSync(join(tempDir, "standalone-note.md"))).toBe(true);
    // Verify no config created
    expect(existsSync(join(tempDir, "mrmd.config.json"))).toBe(false);
  });

  test("CLI flags: --no-studio disables studio routes", async () => {
    const filePath = join(tempDir, "test.md");
    await writeFile(filePath, "# Test\nContent");

    activeApp = await createDevApp([filePath, "--port", "4180", "--no-studio"]);

    const studioRes = await activeApp.fetchHandler(new Request("http://localhost:4180/__studio"));
    expect(studioRes?.status).toBe(404);
  });

  test("Hot reload: rebuild publishes reload event to livereload subscribers and sets no-cache headers", async () => {
    const filePath = join(tempDir, "hotload.md");
    await writeFile(filePath, "# Hot Load\nOriginal text");

    activeApp = await createDevApp([filePath, "--port", "4190"]);

    const published: Array<{ topic: string; data: string }> = [];
    activeApp.setServer({
      port: 4190,
      stop() {},
      publish(topic: string, data: string) {
        published.push({ topic, data });
      },
      requestIP() { return { address: "127.0.0.1" }; },
      upgrade() { return false; },
    });

    // Verify HTML response contains no-cache headers and the live reload script
    const pageRes = await activeApp.fetchHandler(new Request("http://localhost:4190/hotload.html"));
    expect(pageRes?.status).toBe(200);
    expect(pageRes?.headers.get("Cache-Control")).toContain("no-store");
    const htmlText = await pageRes?.text();
    expect(htmlText).toContain("connectLiveReload");
    expect(htmlText).toContain("bk-page-reloaded");

    // Modify file and trigger rebuild
    await writeFile(filePath, "# Hot Load\nUpdated text with more content");
    await activeApp.rebuild();

    // Verify live reload event was published
    expect(published.length).toBeGreaterThanOrEqual(1);
    const lastEvent = published[published.length - 1];
    expect(lastEvent.topic).toBe("livereload");
    expect(lastEvent.data).toBe("reload");
  });

  test("Contextual frontmatter API: fetch and update specific lesson frontmatter in course mode", async () => {
    const file1 = join(tempDir, "01-alpha.md");
    const file2 = join(tempDir, "02-beta.md");
    await writeFile(file1, "---\ntitle: Alpha\ndescription: First\n---\n# Alpha");
    await writeFile(file2, "---\ntitle: Beta\ndescription: Second\n---\n# Beta");
    await writeFile(join(tempDir, "mrmd.config.json"), JSON.stringify({
      title: "Course Test",
      lessons: ["01-alpha.md", "02-beta.md"]
    }));

    activeApp = await createDevApp([tempDir, "--port", "4200"]);

    // Fetch frontmatter for 02-beta.md
    const getRes = await activeApp.fetchHandler(new Request("http://localhost:4200/__api/lesson/frontmatter?file=02-beta.md"));
    expect(getRes?.status).toBe(200);
    const getData = await getRes?.json();
    expect(getData.frontmatter.title).toBe("Beta");
    expect(getData.frontmatter.description).toBe("Second");

    // Update frontmatter specifically for 02-beta.md
    const postRes = await activeApp.fetchHandler(new Request("http://localhost:4200/__api/lesson/frontmatter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file: "02-beta.md",
        title: "Beta Enhanced",
        description: "Updated Second Description",
        author: "Prof. Beta",
        tags: ["advanced", "quantum"]
      })
    }));
    expect(postRes?.status).toBe(200);
    const postData = await postRes?.json();
    expect(postData.success).toBe(true);
    expect(postData.file).toBe("02-beta.md");
    expect(postData.frontmatter.title).toBe("Beta Enhanced");

    // Verify file content on disk for 02-beta.md was updated
    const file2Content = await readFile(file2, "utf-8");
    expect(file2Content).toContain("title: Beta Enhanced");
    expect(file2Content).toContain("author: Prof. Beta");

    // Verify 01-alpha.md remains untouched
    const file1Content = await readFile(file1, "utf-8");
    expect(file1Content).toContain("title: Alpha");
    expect(file1Content).not.toContain("Prof. Beta");
  });

  test("Studio UI layout: Slab 1 outline removed, single New Lesson button, unified Palettes, context breadcrumb", async () => {
    const studioHtmlPath = join(import.meta.dir, "..", "src", "studio", "index.html");
    const html = await readFile(studioHtmlPath, "utf-8");

    // Slab 1 single file layout: has single lesson card, no outline list, no promote banner, no duplicate buttons
    expect(html).toContain('id="st-single-lesson-card"');
    expect(html).toContain('id="st-btn-single-new-lesson"');
    expect(html).not.toContain('id="st-outline-list"');
    expect(html).not.toContain('id="st-btn-promote-lesson"');
    expect(html).not.toContain('st-promote-callout');
    expect(html).not.toContain('Expanding into a series?');

    // Button labels: clean labels without duplicate +
    expect(html).toContain('<span>New Lesson</span>');
    expect(html).not.toContain('<span>+ New Lesson</span>');
    expect(html).not.toContain('id="st-btn-new-theme"');

    // Inspector Slab 3: redundant context breadcrumb bar removed
    expect(html).not.toContain('id="st-inspector-context-bar"');
    expect(html).not.toContain('id="st-btn-context-course"');

    // Studio topbar: strictly dark mode only (no light toggle), redundant open site removed
    expect(html).not.toContain('id="st-btn-studio-theme"');
    expect(html).not.toContain('id="st-btn-view-site"');

    // Viewport bar: center group contains status dot on left and url capsule with popout
    expect(html).toContain('class="st-viewport-center-group"');
    expect(html).toContain('class="st-status-dot-wrap"');
    expect(html).toContain('id="st-status"');
    expect(html).toContain('id="st-status-dot"');
    expect(html).toContain('id="st-url-capsule"');
    expect(html).toContain('id="st-btn-open-active-tab"');

    // Inspector Slab 3: vertically scrollable palette matrix with fancy scrollbar and count badge
    expect(html).toContain('id="st-palette-scroll-viewport"');
    expect(html).toContain('id="st-palette-scroll-container"');
    expect(html).toContain('id="st-palette-scrollbar"');
    expect(html).toContain('id="st-palette-scrollbar-thumb"');
    expect(html).not.toContain('id="st-palette-scroll-cue"');
    expect(html).toContain('id="st-palette-count-pill"');
    expect(html).toContain('id="st-builtin-palettes"');
    expect(html).not.toContain('id="st-custom-palettes-list"');

    // Modals: references Custom Palette instead of Custom Theme
    expect(html).toContain('id="st-theme-modal-title">Custom Palette</h3>');
    expect(html).toContain('id="st-modal-save-theme">Save Palette</button>');
    expect(html).toContain('Delete Custom Palette</h3>');

    // New Lesson modal: simple 1-field title input, no "or slug" confusion
    expect(html).toContain('id="st-new-lesson-name"');
    expect(html).toContain('Lesson Title</label>');
    expect(html).not.toContain('or slug');
    expect(html).not.toContain('Course Name (when expanding)');

    // Course Conversion comparison modal: features Course Series vs Independent Files
    expect(html).toContain('id="st-modal-convert-course"');
    expect(html).toContain('Convert to Course?</h3>');
    expect(html).toContain('Course Name <span class="st-required-mark">*</span>');
    expect(html).not.toContain('Course Name (optional)');
    expect(html).toContain('id="st-convert-error-msg"');
    expect(html).toContain('id="st-btn-confirm-convert"');
    expect(html).toContain('disabled>Yes, Convert to Course</button>');
    expect(html).toContain('id="st-btn-keep-independent"');
    expect(html).toContain('No, Keep Independent</button>');
    expect(html).toContain('id="st-single-lesson-container"');

    // Convert modal copy: general phrasing that scales to N >= 3 lessons
    expect(html).toContain('Group your lessons under an organized course');
    expect(html).toContain('Keep your lessons as independent markdown files');
    expect(html).toContain('All files in current directory');
    expect(html).not.toContain('Group both lessons');
    expect(html).not.toContain('Keep both lessons');
  });

  test("Dev server static serving: slug fallback resolution allows serving files with spaces and uppercase", async () => {
    const filePath = join(tempDir, "01 Intro to Physics.md");
    await writeFile(filePath, "# Intro to Physics\nWelcome to physics.");

    activeApp = await createDevApp([filePath, "--port", "4155"]);

    // Test exact slug URL
    const resSlug = await activeApp.fetchHandler(new Request("http://localhost:4155/01-intro-to-physics.html"));
    expect(resSlug?.status).toBe(200);
    const textSlug = await resSlug?.text();
    expect(textSlug).toContain("Intro to Physics");

    // Test URL with original filename with spaces
    const resRaw = await activeApp.fetchHandler(new Request("http://localhost:4155/01%20Intro%20to%20Physics.html"));
    expect(resRaw?.status).toBe(200);
    const textRaw = await resRaw?.text();
    expect(textRaw).toContain("Intro to Physics");
  });

  test("Theming hardening: LiveReload script respects localStorage and layout.ts sets early dark background", async () => {
    const filePath = join(tempDir, "theming-test.md");
    await writeFile(filePath, "# Theming Test\nTesting theme preservation.");

    activeApp = await createDevApp([filePath, "--port", "4156"]);

    const res = await activeApp.fetchHandler(new Request("http://localhost:4156/theming-test.html"));
    expect(res?.status).toBe(200);
    const html = await res?.text();

    // Verify early background in <head> to eliminate white flash
    expect(html).toContain('root.style.backgroundColor = "#07090c"');
    expect(html).toContain('root.style.colorScheme = "dark"');

    // Verify LiveReload script checks localStorage before applying defaults
    expect(html).toContain('const t = localStorage.getItem("bk-theme");');
    expect(html).toContain('const p = localStorage.getItem("bk-palette");');
    expect(html).toContain('const u = localStorage.getItem("bk-ui");');
    expect(html).toContain('const targetTheme = t || newTheme;');
    expect(html).toContain('const targetPalette = p || newPalette;');
  });

  test("Studio CSS: .st-live-iframe uses theme surface background instead of blinding white", async () => {
    const cssContent = await readFile(join(import.meta.dir, "..", "src", "studio", "studio.css"), "utf-8");
    expect(cssContent).toContain(".st-live-iframe {\n\tflex: 1;\n\twidth: 100%;\n\theight: 100%;\n\tborder: none;\n\tbackground: var(--st-surface);");
    expect(cssContent).not.toContain(".st-live-iframe {\n\tflex: 1;\n\twidth: 100%;\n\theight: 100%;\n\tborder: none;\n\tbackground: #ffffff;");
  });

  test("Empty lesson resilience: parseLesson and buildLesson support empty and frontmatter-only lessons without crashing production builds", async () => {
    const { parseLesson, buildLesson, parseChapter, buildChapter } = await import("../src/parser/mdx.js");

    // 1. Only frontmatter
    const fmOnly = "---\ntitle: Only Frontmatter\ndescription: Test description\nauthor: tester\n---\n";
    const lessonFm = parseLesson(fmOnly, { contentBase: tempDir }, tempDir, "Fallback", "fm-only.md");
    expect(lessonFm.meta.title).toBe("Only Frontmatter");
    expect(lessonFm.blocks.length).toBe(1);
    expect(lessonFm.blocks[0].type).toBe("markdown");

    // 2. Frontmatter + matching H1 title (which gets stripped)
    const strippedH1 = "---\ntitle: Stripped Heading\n---\n# Stripped Heading\n";
    const lessonStripped = parseLesson(strippedH1, { contentBase: tempDir }, tempDir, "Fallback", "stripped.md");
    expect(lessonStripped.blocks.length).toBe(1);
    expect(lessonStripped.blocks[0].type).toBe("markdown");

    // 3. Completely empty markdown
    const emptyMd = "";
    const lessonEmpty = parseLesson(emptyMd, { contentBase: tempDir }, tempDir, "Empty Lesson", "empty.md");
    expect(lessonEmpty.blocks.length).toBe(1);

    // 4. Build in strict production mode - must not throw
    const outDir = join(tempDir, "out-resilience");
    await mkdir(outDir, { recursive: true });
    expect(() => {
      buildLesson(lessonFm, { outDir, strict: true });
      buildLesson(lessonStripped, { outDir, strict: true });
      buildLesson(lessonEmpty, { outDir, strict: true });
    }).not.toThrow();

    expect(existsSync(join(outDir, "fm-only.html"))).toBe(true);
    expect(existsSync(join(outDir, "stripped.html"))).toBe(true);
    expect(existsSync(join(outDir, "empty.html"))).toBe(true);

    // 5. Course with draft lesson building
    const courseChapter = {
      meta: { title: "Draft Course", slug: "draft-course" },
      lessons: [lessonFm, lessonStripped, lessonEmpty],
    };
    expect(() => {
      buildChapter(courseChapter, { outDir, strict: true });
    }).not.toThrow();
    expect(existsSync(join(outDir, "index.html"))).toBe(true);
  });

  test("Course escalation: /__api/course/convert carries over parent appearance and deletes orphaned parent config", async () => {
    const parentDir = join(tempDir, "parent-esc");
    await mkdir(parentDir, { recursive: true });
    await writeFile(join(parentDir, "note1.md"), "# Note 1\nContent 1");
    await writeFile(join(parentDir, "note2.md"), "---\ntitle: Note 2\n---\n");

    // Parent had custom appearance configured
    const { saveConfig, loadConfig } = await import("../src/config.js");
    saveConfig(parentDir, {
      title: "Old Parent",
      theme: "dark",
      palette: "ember",
      ui: "neo",
      lessons: ["note1.md", "note2.md"],
    });

    activeApp = await createDevApp([join(parentDir, "note1.md"), "--port", "4158"]);

    const convertRes = await activeApp.fetchHandler(
      new Request("http://localhost:4158/__api/course/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseName: "my-series" }),
      }),
    );
    expect(convertRes?.status).toBe(200);

    const targetCourseDir = join(parentDir, "my-series");
    expect(existsSync(targetCourseDir)).toBe(true);

    // Verify parent config was cleaned up
    expect(existsSync(join(parentDir, "mrmd.config.json"))).toBe(false);

    // Verify child inherited appearance settings
    const childConfig = loadConfig(targetCourseDir);
    expect(childConfig).not.toBeNull();
    expect(childConfig?.title).toBe("my-series");
    expect(childConfig?.theme).toBe("dark");
    expect(childConfig?.palette).toBe("ember");
    expect(childConfig?.ui).toBe("neo");
    expect(childConfig?.lessons).toEqual(["note1.md", "note2.md"]);
  });

  test("Subfolder course hint: generateChapterContent provides helpful hint when target directory has subfolder courses", async () => {
    const { generateChapterContent } = await import("../src/cli/chapter.js");
    const containerDir = join(tempDir, "container");
    const subCourseDir = join(containerDir, "intro-course");
    await mkdir(subCourseDir, { recursive: true });
    await writeFile(join(subCourseDir, "lesson.md"), "# Sub Lesson");

    expect(() => {
      generateChapterContent(containerDir);
    }).toThrow(/Did you mean to target a course subfolder\? Found: container\/intro-course/);
  });
});
