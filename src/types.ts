// ─── Block Types ─────────────────────────────────────────────────────────────

export type BlockType =
	| "heading"
	| "markdown"
	| "section"
	| "important"
	| "note"
	| "warning"
	| "tip"
	| "simulation"
	| "animation"
	| "media"
	| "youtube"
	| "image"
	| "columns"
	| "quiz"
	| "caution";

export interface BaseBlock {
	type: BlockType;
}

// Markdown content blocks
export interface HeadingBlock extends BaseBlock {
	type: "heading";
	src: string; // path to .md file or inline markdown
	title?: string; // override title extracted from md
}

export interface MarkdownBlock extends BaseBlock {
	type: "markdown";
	src: string; // path to .md file or inline markdown
}

export interface SectionBlock extends BaseBlock {
	type: "section";
	src: string; // path to .md file or inline markdown
	label?: string; // override sidebar label
}

export interface CalloutBlock extends BaseBlock {
	type: "important" | "warning" | "tip" | "note" | "caution";
	src: string;
}

export type BlockAccent =
	| "neutral"
	| "blue"
	| "teal"
	| "amber"
	| "rose"
	| "violet";

export interface CaptionedBlock {
	label?: string;
	caption?: string;
}

// Interactive blocks
export interface SimulationBlock extends BaseBlock, CaptionedBlock {
	type: "simulation";
	src: string; // path to .js file or inline JS
	props?: Record<string, unknown>; // passed to the sim as window.__simProps
	tunables?: Record<string, SimulationControl>;
	dependencies?: string[]; // external CDN scripts loaded before the simulation
	height?: number; // iframe height, default 400
	controls?: "interactive" | "observe";
	accent?: BlockAccent;
}

export interface AnimationBlock extends BaseBlock, CaptionedBlock {
	type: "animation";
	src: string; // path to .js file or inline JS
	loop?: boolean;
	height?: number;
	accent?: BlockAccent;
}

export type MediaKind = "video" | "audio";

export interface MediaBlock extends BaseBlock, CaptionedBlock {
	type: "media";
	src: string;
	kind: MediaKind;
	alt?: string;
	credit?: string;
	poster?: string;
	controls?: boolean;
}

export interface YouTubeBlock extends BaseBlock, CaptionedBlock {
	type: "youtube";
	id: string; // extracted video ID
	start?: number; // start time in seconds
}

export interface ImageBlock extends BaseBlock, CaptionedBlock {
	type: "image";
	src: string;
}

export interface ColumnItem {
	src?: string;
	markdown?: string;
	code?: string;
	latex?: string;
}

export interface ColumnsBlock extends BaseBlock, CaptionedBlock {
	type: "columns";
	columns: ColumnItem[];
}

export interface QuizBlock extends BaseBlock, CaptionedBlock {
	type: "quiz";
	src: string; // path to .json file or inline json
}

export type Block =
	| HeadingBlock
	| MarkdownBlock
	| SectionBlock
	| CalloutBlock
	| SimulationBlock
	| AnimationBlock
	| MediaBlock
	| YouTubeBlock
	| ImageBlock
	| ColumnsBlock
	| QuizBlock;

// ─── Lesson Schema ────────────────────────────────────────────────────────────

export interface LessonMeta {
	title: string;
	slug: string;
	description?: string;
	tags?: string[];
	author?: string;
	status?: "read" | "unread" | "locked";
	parentSlug?: string;
	prevSlug?: string;
	prevTitle?: string;
	nextSlug?: string;
	nextTitle?: string;
	contentBase?: string;
}

export interface Lesson {
	meta: LessonMeta;
	blocks: Block[];
}

export interface LessonPreset {
	layout?: "lesson" | "article" | "lab";
	density?: "comfortable" | "compact";
	tone?: "scholarly" | "studio" | "minimal";
}

// ─── Quiz Schema (for .json files) ───────────────────────────────────────────

export interface QuizQuestion {
	q: string;
	options: string[];
	answer: number; // index of correct option
	explanation?: string;
}

export interface QuizFile {
	questions: QuizQuestion[];
}

// ─── Build Options ────────────────────────────────────────────────────────────

/**
 * Global configuration for building a lesson or chapter.
 * Passed to `lesson(title, options)` or `chapter(title, options)`.
 */
export interface BuildOptions {
	/** Directory where the generated HTML file will be written. Default: `'./out'` */
	outDir?: string;
	/** Base path for resolving local files like `.md`, `.js`, `.json`. Default: `'.'` */
	contentBase?: string;
	/** Light or dark mode. Default: `'auto'` */
	theme?: "light" | "dark" | "auto";
	/** Visual color palette of the generated page. Default: `'ink'` */
	palette?: "ink" | "field" | "ember" | "elixir" | "trunk" | "lava";
	/**
	 * Structural layout styling.
	 * - `standard`: clean, rounded standard aesthetic
	 * - `neo`: neo-brutalist harsh borders and shadows
	 * - `playful`: bubbly rounded buttons and bounce transitions
	 */
	ui?: "standard" | "neo" | "playful";
	/** Custom CSS font-family string (e.g. `'Inter, sans-serif'`). */
	font?: string;
	/** Path to a favicon. */
	favicon?: string;
	/** Custom raw HTML to inject into the `<head>` tag. */
	head?: string;
	/** Preset for layout, density, and tone. */
	preset?: LessonPreset;
	/** If true, throws errors on missing files and invalid blocks to prevent silent failures. Default: `true` */
	strict?: boolean;
	/** If true, inlines CSS and JS into a single HTML file. If false, outputs assets to an `assets/` folder. Default: `true` */
	standalone?: boolean;
}

/** Configuration for simulation blocks */
export interface SimulationOptions {
	props?: Record<string, unknown>;
	tunables?: Record<string, SimulationControl>;
	height?: number;
	label?: string;
	caption?: string;
	controls?: SimulationBlock["controls"];
	accent?: BlockAccent;
}

export interface SimulationConfig extends SimulationOptions {
	dependencies?: string[];
}

/** Represents a single interactive control in a simulation (e.g., a slider) */
export interface SimulationControl {
	type?: "range" | "number" | "text" | "boolean";
	label?: string;
	min?: number;
	max?: number;
	step?: number;
}

export interface AnimationOptions {
	loop?: boolean;
	height?: number;
	label?: string;
	caption?: string;
	accent?: BlockAccent;
}

export interface MediaOptions {
	kind?: MediaKind;
	alt?: string;
	label?: string;
	caption?: string;
	credit?: string;
	poster?: string;
	controls?: boolean;
}

export interface YouTubeOptions {
	start?: number;
	label?: string;
	caption?: string;
}

export interface ColumnsOptions {
	label?: string;
	caption?: string;
}

// ─── Chapter Schema ──────────────────────────────────────────────────────────

/**
 * Represents a logical grouping of multiple lessons.
 */
export interface ChapterMeta {
	title: string;
	slug: string;
	description?: string;
	status?: "completed" | "active" | "locked";
}

export interface Chapter {
	meta: ChapterMeta;
	lessons: Lesson[];
}
