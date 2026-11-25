export type {
	CodeEngine,
	ContentEngine,
	EngineContext,
	EngineOutput,
	SectionEngine,
	SectionEngines,
	SimulationEngine,
	TestingEngine,
	ThemeEngine,
} from "./sections.js";

import { renderBlock, renderBlockInner } from "../renderer/blocks/index.js";
import { renderChapter } from "../renderer/chapter.js";
import { renderPage } from "../renderer/templates/page.js";
import type { NavItem } from "../renderer/utils.js";
import type { BlockType } from "../types.js";
import {
	BLOG_KIT_API_VERSION,
	type BlockEngine,
	type BlogKit,
	BlogKitEngineError,
	type BlogKitEngines,
} from "./contracts.js";
import { presentationOptions } from "./settings.js";

function blockEngine(
	name: string,
	blockTypes: readonly BlockType[],
): BlockEngine {
	return {
		name,
		apiVersion: BLOG_KIT_API_VERSION,
		blockTypes,
		render: ({ block, index, options }) =>
			renderBlockInner(block, index, options),
	};
}

export const defaultBlogKitEngines: Readonly<BlogKitEngines> = {
	layout: {
		name: "blog-kit/layout",
		apiVersion: BLOG_KIT_API_VERSION,
		render: ({ lesson, navItems, bodyHtml, options }) =>
			renderPage(lesson, navItems, bodyHtml, options),
	},
	chapter: {
		name: "blog-kit/chapter",
		apiVersion: BLOG_KIT_API_VERSION,
		render: ({ chapter, options }) => renderChapter(chapter, options),
	},
	content: blockEngine("blog-kit/content", [
		"heading",
		"markdown",
		"section",
		"important",
		"warning",
		"tip",
		"note",
		"caution",
		"columns",
	]),
	simulation: blockEngine("blog-kit/simulation", [
		"simulation",
		"world",
		"animation",
	]),
	learning: blockEngine("blog-kit/learning", ["quiz", "steps"]),
	media: blockEngine("blog-kit/media", ["image", "media", "youtube"]),
};

/** Engine replacements are selected before rendering; browser assets remain engine-owned. */
export function createBlogKit(
	options: { engines?: Partial<BlogKitEngines> } = {},
): BlogKit {
	const engines = { ...defaultBlogKitEngines, ...options.engines };
	for (const engine of Object.values(engines)) {
		if (engine.apiVersion !== BLOG_KIT_API_VERSION) {
			throw new BlogKitEngineError({
				code: "INCOMPATIBLE_ENGINE",
				engine: engine.name,
				apiVersion: engine.apiVersion,
			});
		}
	}
	const owners = new Map<BlockType, BlockEngine>();
	for (const engine of [
		engines.content,
		engines.simulation,
		engines.learning,
		engines.media,
	]) {
		for (const blockType of engine.blockTypes) {
			const previous = owners.get(blockType);
			if (previous) {
				throw new BlogKitEngineError({
					code: "DUPLICATE_BLOCK_OWNER",
					blockType,
					engines: [previous.name, engine.name],
				});
			}
			owners.set(blockType, engine);
		}
	}
	return {
		apiVersion: BLOG_KIT_API_VERSION,
		renderLesson(lesson, buildOptions = {}) {
			buildOptions = presentationOptions(buildOptions, lesson.presentation);
			const navItems: NavItem[] = [];
			const body = lesson.blocks.map((block, index) => {
				const result = renderBlock(
					block,
					index,
					buildOptions,
					(value, idx, opts) => {
						const engine = owners.get(value.type);
						if (!engine) {
							throw new BlogKitEngineError({
								code: "UNSUPPORTED_BLOCK",
								blockType: value.type,
							});
						}
						return engine.render({ block: value, index: idx, options: opts });
					},
				);
				if (result.navItems) navItems.push(...result.navItems);
				return result.html;
			});
			return engines.layout.render({
				lesson,
				navItems,
				bodyHtml: body.join("\n"),
				options: buildOptions,
			});
		},
		renderChapter(chapter, buildOptions = {}) {
			return engines.chapter.render({
				chapter,
				options: presentationOptions(buildOptions, chapter.presentation),
			});
		},
	};
}

export const blogKit = createBlogKit();
