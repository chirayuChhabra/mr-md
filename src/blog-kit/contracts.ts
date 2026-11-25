import type { NavItem } from "../renderer/utils.js";
import type {
	Block,
	BlockType,
	BuildOptions,
	Chapter,
	Lesson,
} from "../types.js";

export const BLOG_KIT_API_VERSION = 1 as const;

export interface BlogKitEngine {
	readonly name: string;
	readonly apiVersion: typeof BLOG_KIT_API_VERSION;
}

export interface BlockRenderContext {
	block: Block;
	index: number;
	options: BuildOptions;
}

export interface BlockRenderResult {
	html: string;
	navItems?: NavItem[];
}

export interface BlockEngine extends BlogKitEngine {
	readonly blockTypes: readonly BlockType[];
	render(context: BlockRenderContext): BlockRenderResult;
}

export interface LayoutEngine extends BlogKitEngine {
	render(context: {
		lesson: Lesson;
		navItems: NavItem[];
		bodyHtml: string;
		options: BuildOptions;
	}): string;
}

export interface ChapterEngine extends BlogKitEngine {
	render(context: { chapter: Chapter; options: BuildOptions }): string;
}

export interface BlogKitEngines {
	layout: LayoutEngine;
	chapter: ChapterEngine;
	content: BlockEngine;
	simulation: BlockEngine;
	learning: BlockEngine;
	media: BlockEngine;
}

export interface BlogKit {
	readonly apiVersion: typeof BLOG_KIT_API_VERSION;
	renderLesson(lesson: Lesson, options?: BuildOptions): string;
	renderChapter(chapter: Chapter, options?: BuildOptions): string;
}

export type BlogKitEngineIssue =
	| { code: "INCOMPATIBLE_ENGINE"; engine: string; apiVersion: number }
	| { code: "DUPLICATE_BLOCK_OWNER"; blockType: BlockType; engines: string[] }
	| { code: "UNSUPPORTED_BLOCK"; blockType: BlockType };

export class BlogKitEngineError extends Error {
	constructor(public readonly issue: BlogKitEngineIssue) {
		super(
			issue.code === "INCOMPATIBLE_ENGINE"
				? `Blog Kit engine "${issue.engine}" requires API ${issue.apiVersion}; expected ${BLOG_KIT_API_VERSION}`
				: issue.code === "DUPLICATE_BLOCK_OWNER"
					? `Blog Kit block "${issue.blockType}" is owned by multiple engines: ${issue.engines.join(", ")}`
					: `No Blog Kit engine handles block "${issue.blockType}"`,
		);
		this.name = "BlogKitEngineError";
	}
}
