import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
	loadMrmdConfig,
	type MrmdConfig,
	MrmdConfigError,
	projectSettings,
	resolveSettings,
} from "../config.js";
import { renderChapterContent } from "../renderer/chapter.js";
import type { BuildOptions } from "../types.js";
import { createBlogKit, defaultBlogKitEngines } from "./engine.js";
import type { EngineOutput, SectionEngines } from "./sections.js";

const sections = ["theme", "content", "testing", "simulation", "code"] as const;
type Section = (typeof sections)[number];

export function hasReplacementEngines(config: MrmdConfig): boolean {
	return sections.some(
		(section) =>
			config[section]?.engine && config[section]?.engine !== "default",
	);
}

function failure(section: Section, message: string): never {
	throw new MrmdConfigError([{ path: `${section}.engine`, message }]);
}

function chapterEnginePath(
	section: Section,
	root: string,
	candidate: string,
): string {
	const file = realpathSync(candidate);
	const relative = path.relative(root, file);
	if (
		relative === ".." ||
		relative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relative)
	)
		failure(section, "Local engines must be inside the chapter folder");
	return file;
}

function loadEngine(
	section: Section,
	specifier: string,
	directory: string,
): SectionEngines[Section] {
	const require = createRequire(path.join(directory, "mrmd.config.json"));
	try {
		let resolved: string;
		if (specifier.startsWith(".") || path.isAbsolute(specifier)) {
			const root = realpathSync(directory);
			const entry = chapterEnginePath(
				section,
				root,
				path.resolve(root, specifier),
			);
			resolved = chapterEnginePath(section, root, require.resolve(entry));
		} else if (
			specifier.split("/").some((part) => part === ".." || part === ".") ||
			!/^(?:@[\w-]+\/)?[\w-]+(?:\/[\w./-]+)?$/.test(specifier)
		) {
			failure(section, "Use a chapter-relative module path or package name");
		} else {
			resolved = require.resolve(specifier);
		}
		const module = require(resolved);
		const engine = module.default ?? module;
		if (!engine || typeof engine.render !== "function")
			failure(section, "Module must export an object with a render function");
		return engine;
	} catch (error) {
		if (error instanceof MrmdConfigError) throw error;
		failure(section, error instanceof Error ? error.message : String(error));
	}
}

function output(value: EngineOutput, section: Section): EngineOutput {
	if (
		!value ||
		typeof value.html !== "string" ||
		(value.css !== undefined && typeof value.css !== "string") ||
		(value.js !== undefined && typeof value.js !== "string")
	)
		failure(section, "render must return { html, css?, js? }");
	return value;
}

type SectionSettings = Partial<Record<Section, Record<string, unknown>>>;

function parseSettings(
	section: Section,
	engine: SectionEngines[Section],
	settings: Record<string, unknown>,
): Record<string, unknown> {
	try {
		const parsed = engine.schema ? engine.schema.parse(settings) : settings;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
			throw new Error("Settings schema must return an object");
		return parsed as Record<string, unknown>;
	} catch (error) {
		throw new MrmdConfigError([
			{
				path: `${section}.settings`,
				message: error instanceof Error ? error.message : String(error),
			},
		]);
	}
}

/** Configured modules are trusted build-time code, like other project plugins. */
export function configuredBuildOptions(
	options: BuildOptions,
	config?: MrmdConfig,
): BuildOptions {
	if (options.blogKit || !options.contentBase) return options;
	const directory = path.resolve(options.contentBase);
	config ??= loadMrmdConfig(directory);
	options = {
		...options,
		presentation: resolveSettings(
			projectSettings(config),
			options.presentation,
		),
	};
	if (!hasReplacementEngines(config)) return options;
	// Bun does not populate cache.children for imported ES modules.
	const require = createRequire(path.join(directory, "mrmd.config.json"));
	const root = realpathSync(directory);
	for (const file of Object.keys(require.cache)) {
		if (
			file.startsWith(`${root}${path.sep}`) &&
			!file.includes(`${path.sep}node_modules${path.sep}`)
		)
			delete require.cache[file];
	}
	const selected: Partial<SectionEngines> = {};
	const rawSettings: SectionSettings = {};
	const chapterSettings: SectionSettings = {};
	for (const section of sections) {
		const entry = config[section];
		if (!entry?.engine || entry.engine === "default") continue;
		const engine = loadEngine(section, entry.engine, directory);
		selected[section] = engine as never;
		rawSettings[section] = entry.settings ?? {};
		chapterSettings[section] = parseSettings(
			section,
			engine,
			rawSettings[section],
		);
	}

	function page(value: BuildOptions, overrides: SectionSettings = {}) {
		const settings = { ...chapterSettings };
		for (const section of sections) {
			const engine = selected[section];
			if (engine && overrides[section]) {
				settings[section] = parseSettings(section, engine, {
					...rawSettings[section],
					...overrides[section],
				});
			}
		}
		function renderSection(section: Section, context: object): EngineOutput {
			const engine = selected[section];
			if (!engine) failure(section, "No implementation selected");
			return output(
				engine.render({
					...context,
					settings: settings[section] ?? {},
				} as never),
				section,
			);
		}
		const styles = new Set<string>();
		const scripts = new Set<string>();
		function collect(result: EngineOutput) {
			if (result.css) styles.add(result.css);
			if (result.js) scripts.add(result.js);
			return result;
		}
		function finish(html: string): string {
			const assets =
				[...styles]
					.map(
						(css) =>
							`<style data-bk-engine>${css.replace(/<\/style/gi, "<\\/style")}</style>`,
					)
					.join("\n") +
				[...scripts]
					.map(
						(js) =>
							`<script type="module" data-bk-engine>${js.replace(/<\/script/gi, "<\\/script")}</script>`,
					)
					.join("\n");
			const marker = '<meta name="bk-engine-navigation" content="document">';
			return html.includes("</head>")
				? html.replace("</head>", () => `${marker}${assets}</head>`)
				: `${marker}${html}${assets}`;
		}
		const replacements: Partial<import("./contracts.js").BlogKitEngines> = {};
		for (const [section, slots] of [
			["content", ["content", "media"]],
			["testing", ["learning"]],
			["simulation", ["simulation"]],
		] as const) {
			if (!selected[section]) continue;
			for (const slot of slots)
				replacements[slot] = {
					...defaultBlogKitEngines[slot],
					render: (context) => collect(renderSection(section, context)),
				};
		}
		const base = createBlogKit({ engines: replacements });
		const kit = createBlogKit({
			engines: {
				...replacements,
				layout: {
					...defaultBlogKitEngines.layout,
					render(context) {
						const html = selected.theme
							? collect(
									renderSection("theme", {
										...context,
										renderDefault: () =>
											defaultBlogKitEngines.layout.render(context),
									}),
								).html
							: defaultBlogKitEngines.layout.render(context);
						return finish(html);
					},
				},
				chapter: {
					...defaultBlogKitEngines.chapter,
					render(context) {
						if (!selected.theme)
							return finish(
								base.renderChapter(context.chapter, context.options),
							);
						const { contentHtml, navHtml } = renderChapterContent(
							context.chapter,
						);
						const result = collect(
							renderSection("theme", {
								...context,
								bodyHtml: contentHtml,
								navHtml,
								navItems: [],
								renderDefault: () =>
									base.renderChapter(context.chapter, context.options),
							}),
						);
						return finish(result.html);
					},
				},
			},
		});
		const pageOptions: BuildOptions = selected.code
			? {
					...value,
					codeRenderer: (context) =>
						collect(renderSection("code", context)).html,
				}
			: value;
		return { kit, pageOptions };
	}
	return {
		...options,
		engineNavigation: "document",
		blogKit: {
			apiVersion: 1,
			renderLesson(lesson, value = {}) {
				const { kit, pageOptions } = page(value, lesson.engineSettings);
				return kit.renderLesson(lesson, pageOptions);
			},
			renderChapter(chapter, value = {}) {
				const { kit, pageOptions } = page(value);
				return kit.renderChapter(chapter, pageOptions);
			},
		},
	};
}
