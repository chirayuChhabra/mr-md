import { createHash } from "node:crypto";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function pageCSS(): string {
	return fs.readFileSync(
		path.join(__dirname, "../../styles/theme.css"),
		"utf-8",
	);
}

export function clientScript(): string {
	let bundlePath = path.join(__dirname, "../../client/app.bundle.js");
	if (!fs.existsSync(bundlePath)) {
		bundlePath = path.join(__dirname, "../../../dist/client/app.bundle.js");
	}
	return fs.readFileSync(bundlePath, "utf-8");
}

export function assetVersion(asset: "styles" | "client"): string {
	return createHash("sha256")
		.update(asset === "styles" ? pageCSS() : clientScript())
		.digest("hex")
		.slice(0, 12);
}
