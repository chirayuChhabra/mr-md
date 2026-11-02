import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import type {
	BuildOptions,
	MediaBlock,
	SimulationConfig,
	SimulationOptions,
} from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getCallerDir(): string | undefined {
	const originalPrepareStackTrace = Error.prepareStackTrace;
	Error.prepareStackTrace = (_, stack) => stack;
	const err = new Error();
	const stack = err.stack as unknown as NodeJS.CallSite[];
	Error.prepareStackTrace = originalPrepareStackTrace;

	if (!stack || !Array.isArray(stack)) return undefined;

	for (let i = 0; i < stack.length; i++) {
		const callSite = stack[i];
		let p = callSite.getFileName();
		if (!p) continue;

		if (p.startsWith("file://")) {
			p = fileURLToPath(p);
		} else if (p.startsWith("/") && p[2] === ":") {
			p = p.substring(1);
		}

		const basename = path.basename(p);
		if (
			basename === "builder.ts" ||
			basename === "builder.js" ||
			basename === "index.ts" ||
			basename === "index.js" ||
			basename === "LessonBuilder.ts" ||
			basename === "LessonBuilder.js" ||
			basename === "ChapterBuilder.ts" ||
			basename === "ChapterBuilder.js" ||
			basename === "utils.ts" ||
			basename === "utils.js"
		) {
			continue;
		}
		return path.dirname(p);
	}
	return undefined;
}

export function copyAssets(outDir: string) {
	const assetsDir = path.join(outDir, "assets");
	if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

	const packageRoot = path.join(__dirname, "../../");
	const distStylesDir = path.join(packageRoot, "dist/styles");
	const srcStylesDir = path.join(packageRoot, "src/styles");
	const distClientDir = path.join(packageRoot, "dist/client");
	const srcClientDir = path.join(packageRoot, "src/client");

	const copyDir = (src: string, dest: string) => {
		if (!fs.existsSync(src)) return;
		if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
		for (const file of fs.readdirSync(src)) {
			const srcFile = path.join(src, file);
			const destFile = path.join(dest, file);
			if (fs.statSync(srcFile).isDirectory()) {
				copyDir(srcFile, destFile);
			} else {
				fs.copyFileSync(srcFile, destFile);
			}
		}
	};

	// Copy styles
	if (fs.existsSync(distStylesDir)) copyDir(distStylesDir, assetsDir);
	else if (fs.existsSync(srcStylesDir)) copyDir(srcStylesDir, assetsDir);

	// Always try to copy the built client dir first to get app.bundle.js
	if (fs.existsSync(distClientDir)) copyDir(distClientDir, assetsDir);
	// Then overlay src/client if we are running locally inside mr-md
	if (fs.existsSync(srcClientDir)) copyDir(srcClientDir, assetsDir);
}

export function mergeOptions(
	options: BuildOptions,
	callerDir?: string,
): BuildOptions {
	const merged: BuildOptions = {
		outDir:
			options.outDir ??
			(callerDir
				? path.join(callerDir, "out")
				: path.join(process.cwd(), "out")),
		contentBase: options.contentBase ?? callerDir ?? process.cwd(),
		theme: options.theme ?? "auto",
		palette: options.palette ?? "ink",
		strict: options.strict ?? process.env.NODE_ENV !== "development",
		standalone: options.standalone ?? true,
	};
	for (const [k, v] of Object.entries(options)) {
		if (v !== undefined && k !== "preset") {
			(merged as Record<string, unknown>)[k] = v;
		}
	}
	merged.preset = {
		layout: options.preset?.layout ?? "lesson",
		density: options.preset?.density ?? "comfortable",
		tone: options.preset?.tone ?? "scholarly",
	};
	return merged;
}

export function normalizeSimulationOptions(
	opts: SimulationOptions | Record<string, unknown>,
	legacyHeight: number,
	fileConfig: SimulationConfig | null = null,
): SimulationOptions {
	let inline: SimulationOptions;
	const optionKeys = [
		"props",
		"tunables",
		"height",
		"label",
		"caption",
		"controls",
		"accent",
	];
	const looksLikeOptions = Object.keys(opts).every((key) =>
		optionKeys.includes(key),
	);

	if (!looksLikeOptions) {
		inline = { props: opts as Record<string, unknown> };
	} else {
		inline = opts as SimulationOptions;
	}

	return {
		props: { ...(fileConfig?.props ?? {}), ...(inline.props ?? {}) },
		tunables: inline.tunables ?? fileConfig?.tunables,
		height: inline.height ?? fileConfig?.height ?? legacyHeight,
		label: inline.label ?? fileConfig?.label,
		caption: inline.caption ?? fileConfig?.caption,
		controls: inline.controls ?? fileConfig?.controls ?? "interactive",
		accent: inline.accent ?? fileConfig?.accent ?? "blue",
	};
}

export function inferMediaKind(src: string): MediaBlock["kind"] {
	const ext = path.extname(src).toLowerCase();
	if ([".mp4", ".webm", ".mov"].includes(ext)) return "video";
	if ([".mp3", ".wav", ".ogg", ".m4a"].includes(ext)) return "audio";
	throw new Error(
		`Unsupported media type: ${ext}. For images, use standard Markdown syntax: ![alt text](${src})`,
	);
}

export function extractYouTubeId(idOrUrl: string): string {
	const watch = idOrUrl.match(/[?&]v=([^&]+)/);
	if (watch) return watch[1];

	const short = idOrUrl.match(/youtu\.be\/([^?&/]+)/);
	if (short) return short[1];

	const embed = idOrUrl.match(/youtube\.com\/embed\/([^?&/]+)/);
	if (embed) return embed[1];

	const shorts = idOrUrl.match(/youtube\.com\/shorts\/([^?&/]+)/);
	if (shorts) return shorts[1];

	return idOrUrl;
}
