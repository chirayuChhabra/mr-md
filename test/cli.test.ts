import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { $ } from "bun";

delete process.env.INIT_CWD;
delete process.env.npm_config_local_prefix;

async function waitForServer(url: string, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      return res;
    } catch (e) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  throw new Error(`Server at ${url} did not start within ${timeout}ms`);
}

describe("CLI Deep Tests", () => {
  let tempDir: string;
  const CLI_PATH = join(import.meta.dir, "..", "dist", "cli.js");

  beforeEach(async () => {
    tempDir = join(tmpdir(), `mr-md-cli-test-${Math.random().toString(36).substring(7)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  describe("generate command", () => {
    test("Should generate a new markdown file with correct frontmatter and name", async () => {
      const result = await $`bun run ${CLI_PATH} generate "test-lesson"`.cwd(tempDir).quiet();
      expect(result.exitCode).toBe(0);
      
      const filePath = join(tempDir, "01-test-lesson.md");
      expect(existsSync(filePath)).toBe(true);
      
      const content = await readFile(filePath, "utf-8");
      expect(content).toContain("index: 1");
      expect(content).toContain("# test-lesson");

      const buildResult = await $`bun run ${CLI_PATH} build 01-test-lesson.md`.cwd(tempDir).quiet();
      expect(buildResult.exitCode).toBe(0);
      expect(existsSync(join(tempDir, "out", "01-test-lesson.html"))).toBe(true);
    });

    test("Should correctly increment index for subsequent files", async () => {
      await $`bun run ${CLI_PATH} generate "first"`.cwd(tempDir).quiet();
      await $`bun run ${CLI_PATH} generate "second"`.cwd(tempDir).quiet();
      
      const content = await readFile(join(tempDir, "02-second.md"), "utf-8");
      expect(content).toContain("index: 2");
    });
  });

  describe("build command", () => {
    test("Should successfully build a single file", async () => {
      const filePath = join(tempDir, "01-test.md");
      await writeFile(filePath, "---\ntitle: Test\n---\n# Hello\nSome block text");
      
      const result = await $`bun run ${CLI_PATH} build 01-test.md`.cwd(tempDir).quiet();
      expect(result.exitCode).toBe(0);
      
      const outPath = join(tempDir, "out", "01-test.html");
      expect(existsSync(outPath)).toBe(true);
    });

    test("Should fail gracefully with invalid targets", async () => {
      const result = await $`bun run ${CLI_PATH} build non-existent.md`.cwd(tempDir).quiet().nothrow();
      expect(result.exitCode).not.toBe(0);
      const output = result.stdout.toString() + result.stderr.toString();
      expect(output).toContain("not found");
    });
  });

  describe("dev command", () => {
    test("Should fall back to a different port if port 3080 is occupied", async () => {
      await writeFile(join(tempDir, "chapter.md"), "---\nindex: 1\n---\ntest");
      const dummyServer = Bun.serve({
        port: 3080,
        fetch() { return new Response("dummy"); }
      });

      const devProc = Bun.spawn(["bun", "run", CLI_PATH, "dev", "."], {
        cwd: tempDir,
        env: { ...process.env, PORT: "3080" }
      });

      try {
        const res = await waitForServer("http://localhost:3081");
        expect(res).toBeTruthy();
      } finally {
        devProc.kill();
        dummyServer.stop();
      }
    }, 15000);

    test("Should prevent directory traversal attacks (403)", async () => {
      await writeFile(join(tempDir, "chapter.md"), "---\nindex: 1\n---\ntest");
      await mkdir(join(tempDir, "out"), { recursive: true });
      await writeFile(join(tempDir, "out", "index.html"), "<h1>Hello</h1>");
      await writeFile(join(tempDir, "secret.txt"), "shhh");

      const devProc = Bun.spawn(["bun", "run", CLI_PATH, "dev", "."], {
        cwd: tempDir,
        env: { ...process.env, PORT: "4000" }
      });

      try {
        const _ = await waitForServer("http://localhost:4000"); // wait for boot
        const res = await fetch("http://localhost:4000/..%2fsecret.txt");
        expect(res.status).toBe(403);
      } finally {
        devProc.kill();
      }
    }, 15000);

    test("Should return 404 for missing files", async () => {
      await writeFile(join(tempDir, "chapter.md"), "---\nindex: 1\n---\ntest");
      await mkdir(join(tempDir, "out"), { recursive: true });
      
      const devProc = Bun.spawn(["bun", "run", CLI_PATH, "dev", "."], {
        cwd: tempDir,
        env: { ...process.env, PORT: "4005" }
      });

      try {
        const _ = await waitForServer("http://localhost:4005"); // wait for boot
        const res = await fetch("http://localhost:4005/non-existent-file.css");
        expect(res.status).toBe(404);
      } finally {
        devProc.kill();
      }
    }, 15000);

    test("Should keep the HTML filename stable when heading changes in single-file dev mode", async () => {
      const filePath = join(tempDir, "lesson.md");
      await writeFile(filePath, "# Old Heading\n\nContent");
      
      const devProc = Bun.spawn(["bun", "run", CLI_PATH, "dev", "lesson.md"], {
        cwd: tempDir,
        env: { ...process.env, PORT: "4010" }
      });

      try {
        await waitForServer("http://localhost:4010");
        expect(existsSync(join(tempDir, "out", "lesson.html"))).toBe(true);
        const oldHtml = await Bun.file(join(tempDir, "out", "lesson.html")).text();
        expect(oldHtml).toContain("Old Heading");

        // Update the file with a new heading
        await writeFile(filePath, "# New Heading\n\nContent");
        
        // Wait for watcher debounce and rebuild
        await new Promise(r => setTimeout(r, 1000));

        expect(existsSync(join(tempDir, "out", "lesson.html"))).toBe(true);
        const newHtml = await Bun.file(join(tempDir, "out", "lesson.html")).text();
        expect(newHtml).toContain("New Heading");

        // Verify root and index.html redirect in single file mode
        const rootRes = await fetch("http://localhost:4010/", { redirect: "manual" });
        expect(rootRes.status).toBe(302);
        expect(rootRes.headers.get("Location")).toBe("/lesson.html");

        const indexRes = await fetch("http://localhost:4010/index.html", { redirect: "manual" });
        expect(indexRes.status).toBe(302);
        expect(indexRes.headers.get("Location")).toBe("/lesson.html");
      } finally {
        devProc.kill();
      }
    }, 15000);
  });
});
