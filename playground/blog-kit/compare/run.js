import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildProject } from "../../../dist/index.js";

const source = import.meta.dir;
const output = join(source, "out");
const chapters = ["default", "field", "mission"];
mkdirSync(output, { recursive: true });
// Each build needs its own chapter directory, while all three use one lesson source.
const staging = mkdtempSync(join(output, ".chapters-"));

try {
  for (const chapter of chapters) {
    const directory = join(staging, chapter);
    mkdirSync(directory);
    cpSync(join(source, "lesson"), directory, { recursive: true });
    cpSync(join(source, chapter), directory, { recursive: true });
    if (chapter !== "default") cpSync(join(source, "blocks"), directory, { recursive: true });
    await buildProject(directory, { outDir: join(output, chapter) });
  }
  cpSync(join(source, "index.html"), join(output, "index.html"));
} finally {
  rmSync(staging, { recursive: true, force: true });
}

if (process.argv.includes("--serve")) {
  const files = new Set(new Bun.Glob("**/*").scanSync({ cwd: output, onlyFiles: true }));
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: Number(process.env.PORT ?? 3001),
    fetch(request) {
      const pathname = new URL(request.url).pathname;
      const file = pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
      return files.has(file) ? new Response(Bun.file(resolve(output, file))) : new Response("Not found", { status: 404 });
    },
  });
  console.log(`Engine comparison: http://localhost:${server.port}/`);
}
