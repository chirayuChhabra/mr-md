import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { logger } from "./cli/logger.js";
import type { BuildOptions, MrmdConfig } from "./types.js";

const CONFIG_FILENAME = "mrmd.config.json";

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const CustomPaletteTokensSchema = z.object({
	accent: z.string().optional(),
	accentSoft: z.string().optional(),
	bg: z.string().optional(),
	paper: z.string().optional(),
	panel: z.string().optional(),
	panelStrong: z.string().optional(),
	ink: z.string().optional(),
	muted: z.string().optional(),
	faint: z.string().optional(),
	line: z.string().optional(),
	lineStrong: z.string().optional(),
});

const CustomPaletteSchema = z.object({
	name: z.string().optional(),
	accent: z.string(),
	accentSoft: z.string().optional(),
	light: CustomPaletteTokensSchema.optional(),
	dark: CustomPaletteTokensSchema.optional(),
});

const LessonRouteSchema = z.union([
	z.string(),
	z.object({
		file: z.string(),
		title: z.string().optional(),
		slug: z.string().optional(),
		description: z.string().optional(),
	}),
]);

export const MrmdConfigSchema = z.object({
	title: z.string().optional(),
	description: z.string().optional(),
	author: z.string().optional(),
	theme: z.enum(["light", "dark", "auto"]).optional(),
	palette: z.string().optional(),
	ui: z.enum(["standard", "neo", "playful"]).optional(),
	font: z.string().optional(),
	favicon: z.string().optional(),
	head: z.string().optional(),
	lessons: z.array(LessonRouteSchema).optional(),
	customPalettes: z.record(z.string(), CustomPaletteSchema).optional(),
});

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Load and validate mrmd.config.json from a directory.
 * Returns null if the file doesn't exist or is invalid.
 */
export function loadConfig(contentDir: string): MrmdConfig | null {
	const configPath = path.join(contentDir, CONFIG_FILENAME);
	if (!fs.existsSync(configPath)) return null;

	try {
		const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
		const result = MrmdConfigSchema.safeParse(raw);
		if (!result.success) {
			logger.warn(
				`Invalid ${CONFIG_FILENAME}: ${result.error.issues.map((i) => i.message).join(", ")}`,
			);
			return null;
		}
		return result.data;
	} catch (err: unknown) {
		logger.warn(
			`Failed to read ${CONFIG_FILENAME}: ${err instanceof Error ? err.message : String(err)}`,
		);
		return null;
	}
}

/**
 * Write mrmd.config.json to a directory.
 */
export function saveConfig(contentDir: string, config: MrmdConfig): void {
	const configPath = path.join(contentDir, CONFIG_FILENAME);
	fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

/**
 * Discover all .md files in a directory (sorted alphabetically).
 */
export function discoverMarkdownFiles(contentDir: string): string[] {
	if (!fs.existsSync(contentDir)) return [];
	return fs
		.readdirSync(contentDir)
		.filter(
			(f) =>
				f.endsWith(".md") && fs.statSync(path.join(contentDir, f)).isFile(),
		)
		.sort();
}

/**
 * Load or auto-create mrmd.config.json.
 * If no config exists, discovers .md files and generates one.
 */
export function ensureConfig(contentDir: string): MrmdConfig {
	const existing = loadConfig(contentDir);
	if (existing) return existing;

	// Auto-discover markdown files
	const files = discoverMarkdownFiles(contentDir);
	const folderName = path.basename(contentDir);
	const rawName = folderName.replace(/^\d+[-_]/, "");
	const formattedTitle = rawName
		.replace(/[-_]/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());

	const config: MrmdConfig = {
		title: formattedTitle,
		lessons: files,
	};

	saveConfig(contentDir, config);
	logger.info(
		`Created ${CONFIG_FILENAME} with ${files.length} lessons discovered.`,
	);
	return config;
}

/**
 * Extract BuildOptions-compatible appearance settings from an MrmdConfig.
 */
export function configToBuildOptions(
	config: MrmdConfig,
): Partial<BuildOptions> {
	const opts: Partial<BuildOptions> = {};
	if (config.theme) opts.theme = config.theme;
	if (config.palette) opts.palette = config.palette;
	if (config.ui) opts.ui = config.ui;
	if (config.font) opts.font = config.font;
	if (config.favicon) opts.favicon = config.favicon;
	if (config.head) opts.head = config.head;
	if (config.customPalettes) opts.customPalettes = config.customPalettes;
	if (config.author) opts.author = config.author;
	if (config.title) opts.courseTitle = config.title;
	return opts;
}

/**
 * Get the filename from a lesson entry (string or LessonRoute object).
 */
export function getLessonFile(entry: string | { file: string }): string {
	return typeof entry === "string" ? entry : entry.file;
}
