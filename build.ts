import { rmSync, cpSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";

console.log("Building framework...");
if (existsSync("dist")) {
  rmSync("dist", { recursive: true, force: true });
}
mkdirSync("dist");
await $`./node_modules/.bin/tsc`;
cpSync("src/styles", "dist/styles", { recursive: true });
cpSync("src/client", "dist/client", { recursive: true });
cpSync("src/studio", "dist/studio", { recursive: true });

await Bun.build({
  entrypoints: ["./src/client/app.ts"],
  outdir: "./dist/client",
  naming: "[dir]/app.bundle.[ext]",
  minify: true,
});

await Bun.build({
  entrypoints: ["./src/studio/studio.ts"],
  outdir: "./dist/studio",
  naming: "[dir]/studio.bundle.[ext]",
  minify: true,
});

console.log("Build complete.");
