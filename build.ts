import { simulationConfigJsonSchema } from "./src/simulation-config.ts";
import { rmSync, cpSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";

console.log("Building framework...");
if (existsSync("dist")) {
  rmSync("dist", { recursive: true, force: true });
}
mkdirSync("dist");
writeFileSync("dist/simulation.schema.json", JSON.stringify(simulationConfigJsonSchema, null, 2) + "\n");
await $`bunx tsc`;
cpSync("src/styles", "dist/styles", { recursive: true });
cpSync("src/client", "dist/client", { recursive: true });

await Bun.build({
  entrypoints: ["./src/client/app.ts"],
  outdir: "./dist/client",
  naming: "[dir]/app.bundle.[ext]",
  minify: true,
});

console.log("Build complete.");
