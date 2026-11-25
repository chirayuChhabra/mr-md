import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const font = z
	.string()
	.min(1)
	.max(200)
	.regex(/^[\p{L}\p{N} ,.'"_-]+$/u, "Invalid font family");
const color = z
	.string()
	.regex(
		/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i,
		"Use a hex color",
	);
export const blogKitSettingsSchema = z.strictObject({
	theme: z
		.strictObject({
			mode: z.enum(["light", "dark", "auto"]).optional(),
			palette: z
				.enum(["ink", "field", "ember", "elixir", "trunk", "lava"])
				.optional(),
			accent: color.optional(),
			font: font.optional(),
			headingFont: font.optional(),
			monoFont: font.optional(),
		})
		.optional(),
	layout: z.enum(["narrow", "wide", "full"]).optional(),
	ui: z.enum(["standard", "neo", "playful"]).optional(),
	density: z.enum(["comfortable", "compact"]).optional(),
	tone: z.enum(["scholarly", "studio", "minimal"]).optional(),
	learning: z
		.strictObject({
			retry: z.boolean().optional(),
			explanations: z.boolean().optional(),
		})
		.optional(),
});

const lessonPath = z
	.string()
	.min(1)
	.refine(
		(value) =>
			value.endsWith(".md") &&
			!path.isAbsolute(value) &&
			!value.includes("\\") &&
			!value
				.split("/")
				.some((part) => part === ".." || part === "." || part === ""),
		"Use a relative Markdown path inside the chapter folder",
	);
export const engineSections = [
	"theme",
	"content",
	"testing",
	"simulation",
	"code",
] as const;
export type EngineSectionName = (typeof engineSections)[number];
export const engineSectionSchema = z.strictObject({
	engine: z
		.string()
		.trim()
		.min(1)
		.optional()
		.describe(
			"Implementation module, relative to this chapter or an installed package",
		),
	settings: z
		.record(z.string(), z.unknown())
		.optional()
		.describe("Settings defined by the selected implementation"),
});
const lessonSection = engineSectionSchema.pick({ settings: true });
export const lessonEntrySchema = z.union([
	lessonPath,
	blogKitSettingsSchema.extend({
		file: lessonPath,
		theme: blogKitSettingsSchema.shape.theme
			.unwrap()
			.extend(lessonSection.shape)
			.optional(),
		content: lessonSection.optional(),
		testing: lessonSection.optional(),
		simulation: lessonSection.optional(),
		code: lessonSection.optional(),
	}),
]);

const contentSectionSchema = engineSectionSchema.extend({
	lessons: z
		.array(lessonEntrySchema)
		.min(1)
		.optional()
		.describe("Lessons in reading order"),
});
const defaultThemeSettingsSchema = blogKitSettingsSchema.shape.theme
	.unwrap()
	.extend({
		layout: blogKitSettingsSchema.shape.layout,
		ui: blogKitSettingsSchema.shape.ui,
		density: blogKitSettingsSchema.shape.density,
		tone: blogKitSettingsSchema.shape.tone,
	});
export const mrmdConfigSchema = blogKitSettingsSchema
	.extend({
		$schema: z.string().optional(),
		theme: blogKitSettingsSchema.shape.theme
			.unwrap()
			.extend(engineSectionSchema.shape)
			.optional(),
		content: contentSectionSchema.optional(),
		testing: engineSectionSchema.optional(),
		simulation: engineSectionSchema.optional(),
		code: engineSectionSchema.optional(),
		title: z.string().min(1).optional(),
		description: z.string().optional(),
		lessons: z.array(lessonEntrySchema).min(1).optional(),
	})
	.superRefine((config, context) => {
		for (const section of ["content", "code", "simulation"] as const) {
			const entry = config[section];
			if (
				(!entry?.engine || entry.engine === "default") &&
				entry?.settings &&
				Object.keys(entry.settings).length
			)
				context.addIssue({
					code: "custom",
					path: [section, "settings"],
					message: `The default ${section} implementation has no settings`,
				});
		}
		const seen = new Set<string>();
		const lessonPath = config.content?.lessons
			? ["content", "lessons"]
			: ["lessons"];
		if (config.content?.lessons && config.lessons)
			context.addIssue({
				code: "custom",
				path: ["lessons"],
				message:
					"Set lesson order in content.lessons only; remove the duplicate lessons field",
			});
		(config.content?.lessons ?? config.lessons)?.forEach((entry, index) => {
			const file = typeof entry === "string" ? entry : entry.file;
			if (seen.has(file))
				context.addIssue({
					code: "custom",
					path: [...lessonPath, index],
					message: `Duplicate lesson: ${file}`,
				});
			seen.add(file);
			if (typeof entry === "string") return;
			for (const section of ["content", "simulation", "code"] as const) {
				const engine = config[section]?.engine;
				if (
					(!engine || engine === "default") &&
					Object.keys(entry[section]?.settings ?? {}).length
				)
					context.addIssue({
						code: "custom",
						path: [...lessonPath, index, section, "settings"],
						message: `The default ${section} implementation has no settings`,
					});
			}
		});
	});

export type BlogKitSettings = z.infer<typeof blogKitSettingsSchema>;
export type MrmdConfig = z.infer<typeof mrmdConfigSchema>;
export type LessonEntry = z.infer<typeof lessonEntrySchema>;
export interface ConfigIssue {
	path: string;
	message: string;
}
export class MrmdConfigError extends Error {
	readonly code = "INVALID_CONFIG";
	constructor(
		readonly issues: ConfigIssue[],
		readonly file = "mrmd.config.json",
	) {
		super(
			`${file}:\n${issues.map((issue) => `  ${issue.path || "config"}: ${issue.message}`).join("\n")}`,
		);
		this.name = "MrmdConfigError";
	}
}

export function validateMrmdConfig(value: unknown): MrmdConfig {
	const result = mrmdConfigSchema.safeParse(value);
	if (!result.success)
		throw new MrmdConfigError(
			result.error.issues.map((issue) => ({
				path: issue.path.join("."),
				message: issue.message,
			})),
		);
	return result.data;
}

export function loadMrmdConfig(directory: string): MrmdConfig {
	const file = path.join(directory, "mrmd.config.json");
	if (!existsSync(file)) return {};
	let value: unknown;
	try {
		value = JSON.parse(readFileSync(file, "utf8"));
	} catch (error) {
		throw new MrmdConfigError(
			[
				{
					path: "",
					message: error instanceof Error ? error.message : String(error),
				},
			],
			file,
		);
	}
	try {
		return validateMrmdConfig(value);
	} catch (error) {
		if (error instanceof MrmdConfigError)
			throw new MrmdConfigError(error.issues, file);
		throw error;
	}
}

export function resolveSettings(
	base: BlogKitSettings,
	override: BlogKitSettings = {},
): BlogKitSettings {
	return {
		...base,
		...override,
		...(base.theme || override.theme
			? { theme: { ...base.theme, ...override.theme } }
			: {}),
		...(base.learning || override.learning
			? { learning: { ...base.learning, ...override.learning } }
			: {}),
	};
}

export function configuredLessons(
	config: MrmdConfig,
): LessonEntry[] | undefined {
	return config.content?.lessons ?? config.lessons;
}

export function projectSettings(config: MrmdConfig): BlogKitSettings {
	const settings: BlogKitSettings = {};
	for (const key of ["layout", "ui", "density", "tone", "learning"] as const) {
		if (config[key] !== undefined)
			Object.assign(settings, { [key]: config[key] });
	}
	if (config.theme) {
		const {
			engine: _engine,
			settings: customSettings,
			...theme
		} = config.theme;
		settings.theme = theme;
		if (!config.theme.engine || config.theme.engine === "default") {
			const result = defaultThemeSettingsSchema.safeParse(customSettings ?? {});
			if (!result.success)
				throw new MrmdConfigError(
					result.error.issues.map((issue) => ({
						path: `theme.settings.${issue.path.join(".")}`,
						message: issue.message,
					})),
				);
			const { layout, ui, density, tone, ...themeSettings } = result.data;
			settings.theme = { ...theme, ...themeSettings };
			for (const [key, value] of Object.entries({
				layout,
				ui,
				density,
				tone,
			})) {
				if (value !== undefined) Object.assign(settings, { [key]: value });
			}
		}
	}
	if (
		config.testing?.settings &&
		(!config.testing.engine || config.testing.engine === "default")
	) {
		const result = blogKitSettingsSchema.shape.learning.safeParse(
			config.testing.settings,
		);
		if (!result.success)
			throw new MrmdConfigError(
				result.error.issues.map((issue) => ({
					path: `testing.settings.${issue.path.join(".")}`,
					message: issue.message,
				})),
			);
		settings.learning = result.data;
	}
	return settings;
}

export type LessonEngineSettings = Partial<
	Record<EngineSectionName, Record<string, unknown>>
>;

export function lessonConfiguration(
	config: MrmdConfig,
	file: string,
): {
	presentation: BlogKitSettings;
	engineSettings?: LessonEngineSettings;
} {
	const base = projectSettings(config);
	const entry = configuredLessons(config)?.find(
		(entry) => typeof entry !== "string" && entry.file === file,
	);
	if (!entry || typeof entry === "string") return { presentation: base };
	const overrides = projectSettings({
		...entry,
		theme: entry.theme && { ...entry.theme, engine: config.theme?.engine },
		testing: entry.testing && {
			...entry.testing,
			engine: config.testing?.engine,
		},
	});
	const engineSettings: LessonEngineSettings = {};
	for (const section of engineSections) {
		const engine = config[section]?.engine;
		const settings = entry[section]?.settings;
		if (engine && engine !== "default" && settings)
			engineSettings[section] = settings;
	}
	return {
		presentation: resolveSettings(base, overrides),
		...(Object.keys(engineSettings).length ? { engineSettings } : {}),
	};
}

export function lessonSettings(
	config: MrmdConfig,
	file: string,
): BlogKitSettings {
	return lessonConfiguration(config, file).presentation;
}

export function resolveLessonPath(directory: string, file: string): string {
	const root = realpathSync(directory);
	const candidate = path.resolve(root, file);
	if (!existsSync(candidate))
		throw new MrmdConfigError([
			{ path: "lessons", message: `Lesson not found: ${file}` },
		]);
	const resolved = realpathSync(candidate);
	const relative = path.relative(root, resolved);
	if (
		relative.startsWith(`..${path.sep}`) ||
		relative === ".." ||
		path.isAbsolute(relative) ||
		!statSync(resolved).isFile()
	) {
		throw new MrmdConfigError([
			{
				path: "lessons",
				message: `Lesson must be a file inside the chapter folder: ${file}`,
			},
		]);
	}
	return resolved;
}

export const mrmdConfigJsonSchema = z.toJSONSchema(mrmdConfigSchema);
