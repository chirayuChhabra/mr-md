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
	| "world"
	| "animation"
	| "media"
	| "youtube"
	| "image"
	| "columns"
	| "quiz"
	| "steps"
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
export interface SimulationAction {
	label: string;
	color?: "accent" | "neutral" | "red" | "green" | "amber";
}

export interface SimulationPreset {
	label: string;
	props: Record<string, string | number | boolean>;
}

export interface SimulationBlock extends BaseBlock, CaptionedBlock {
	type: "simulation";
	src: string; // path to .js file or inline JS
	props?: Record<string, unknown>; // passed to the sim as window.__simProps
	tunables?: Record<string, SimulationControl>;
	actions?: Record<string, SimulationAction>;
	presets?: Record<string, SimulationPreset>;
	advancedControls?: string[];
	telemetry?: SimulationTelemetry;
	dependencies?: string[]; // external CDN scripts loaded before the simulation
	height?: number; // iframe height, default 400
	controls?: "interactive" | "observe";
	accent?: BlockAccent;
}

export type WorldPortalType = "minimal" | "wormhole" | "pixel";

export interface WorldBlock extends BaseBlock, CaptionedBlock {
	type: "world";
	src: string; // path to .js or .ts file or inline JS
	props?: Record<string, unknown>; // passed to the world as window.__simProps
	tunables?: Record<string, SimulationControl>;
	actions?: Record<string, SimulationAction>;
	presets?: Record<string, SimulationPreset>;
	advancedControls?: string[];
	telemetry?: SimulationTelemetry;
	dependencies?: string[]; // external CDN scripts loaded before the simulation
	height?: number; // portal preview height, default 480
	accent?: BlockAccent;
	portal?: WorldPortalType;
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

export interface SimulationStep {
	id?: string;
	title?: string;
	target?: string;
	badge?: string;
	instruction?: string;
	prompt?: string;
	voice?: string;
	feedback?: string;
	hint?: string;
	audio?: string;
	initialProps?: Record<string, unknown>;
	tunables?: Record<string, SimulationControl>;
}

export interface StepsBlock extends BaseBlock, CaptionedBlock {
	type: "steps";
	src: string;
	steps?: SimulationStep[];
	props?: Record<string, unknown>;
	tunables?: Record<string, SimulationControl>;
	actions?: Record<string, SimulationAction>;
	presets?: Record<string, SimulationPreset>;
	advancedControls?: string[];
	telemetry?: SimulationTelemetry;
	height?: number;
	accent?: BlockAccent;
	dependencies?: string[];
	kicker?: string;
	voice?: boolean | string;
	audio?: boolean | string;
}

export type Block =
	| HeadingBlock
	| MarkdownBlock
	| SectionBlock
	| CalloutBlock
	| SimulationBlock
	| WorldBlock
	| AnimationBlock
	| MediaBlock
	| YouTubeBlock
	| ImageBlock
	| ColumnsBlock
	| QuizBlock
	| StepsBlock;

// ─── Lesson Schema ────────────────────────────────────────────────────────────

export interface LessonMeta {
	title: string;
	slug: string;
	description?: string;
	tags?: string[];
	author?: string;
	eyebrow?: string | boolean;
	status?: "read" | "unread" | "locked";
	parentSlug?: string;
	parentTitle?: string;
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
	/** @internal Phone application route bundle generated by chapter builds. */
	phoneApp?: string;
	/** @internal Course-root base for shared pages, relative to the output page. */
	documentBase?: string;
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
	/** If true, inlines CSS and JS into a single HTML file. If false, outputs assets to an `assets/` folder. Default: `false` for chapters, `true` for single lessons */
	standalone?: boolean;
}

/** Configuration for simulation blocks */
export interface SimulationOptions {
	props?: Record<string, unknown>;
	tunables?: Record<string, SimulationControl>;
	actions?: Record<string, SimulationAction>;
	presets?: Record<string, SimulationPreset>;
	advancedControls?: string[];
	telemetry?: SimulationTelemetry;
	height?: number;
	label?: string;
	caption?: string;
	controls?: SimulationBlock["controls"];
	accent?: BlockAccent;
}

/** Supported simulation presentation types in .config.json */
export type SimulationType = "block" | "steps" | "world" | string;

export interface SimulationConfig extends SimulationOptions {
	type?: SimulationType;
	portal?: WorldPortalType;
	steps?: SimulationStep[];
	kicker?: string;
	dependencies?: string[];
	voice?: boolean | string;
	audio?: boolean | string;
}

export interface StepsOptions {
	steps?: SimulationStep[];
	props?: Record<string, unknown>;
	tunables?: Record<string, SimulationControl>;
	actions?: Record<string, SimulationAction>;
	presets?: Record<string, SimulationPreset>;
	advancedControls?: string[];
	telemetry?: SimulationTelemetry;
	height?: number;
	label?: string;
	caption?: string;
	accent?: BlockAccent;
	kicker?: string;
	voice?: boolean | string;
	audio?: boolean | string;
}

export interface StepsConfig extends StepsOptions {
	type?: SimulationType;
	dependencies?: string[];
}

/** Configuration for world blocks */
export interface WorldOptions {
	props?: Record<string, unknown>;
	tunables?: Record<string, SimulationControl>;
	actions?: Record<string, SimulationAction>;
	presets?: Record<string, SimulationPreset>;
	advancedControls?: string[];
	telemetry?: SimulationTelemetry;
	height?: number;
	label?: string;
	caption?: string;
	accent?: BlockAccent;
	portal?: WorldPortalType;
}

export interface WorldConfig extends WorldOptions {
	dependencies?: string[];
	type?: "world";
	portal?: WorldPortalType;
}

export interface SimulationControlOption {
	label: string;
	value: string | number | boolean;
}

/** Represents a single interactive control in a simulation (e.g., a slider) */
export interface SimulationControl {
	type?: "range" | "number" | "text" | "boolean" | "select" | "segmented";
	label?: string;
	min?: number;
	max?: number;
	step?: number;
	unit?: string;
	options?: Array<SimulationControlOption>;
	advanced?: boolean;
	/** Named inspector section. Declaration order is preserved within sections. */
	group?: string;
}

/** Represents a declared telemetry quantity published by a simulation */
export interface SimulationTelemetryItem {
	label?: string;
	unit?: string;
	precision?: number;
	group?: string;
	description?: string;
	display?: "metric" | "status" | "row";
}

export type SimulationTelemetry = Record<string, SimulationTelemetryItem>;

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
	eyebrow?: string | boolean;
	status?: "completed" | "active" | "locked";
}

export interface Chapter {
	meta: ChapterMeta;
	lessons: Lesson[];
}

// ─── Simulation Runtime Messages ─────────────────────────────────────────────

export type SimulationHostToIframeMessage =
	| { type: "bk:play" }
	| { type: "bk:pause" }
	| { type: "bk:sim-play-state"; playing: boolean }
	| { type: "bk:set-props"; props: Record<string, unknown> }
	| { type: "bk:action"; action: string }
	| { type: "bk:reset"; props: Record<string, unknown>; playing?: boolean }
	| { type: "bk:runtime-query" }
	| {
			type: "bk:steps-set-step";
			stepIndex: number;
			step?: unknown;
			props?: Record<string, unknown>;
			replaceProps?: boolean;
	  }
	| {
			type: "bk:steps-reset-step";
			stepIndex: number;
			props?: Record<string, unknown>;
			replaceProps?: boolean;
	  }
	| { type: "bk:theme-sync"; state: unknown }
	| { type: "bk:world-enter" }
	| { type: "bk:world-exit" }
	| { type: "bk:world-reset-camera" };

export type SimulationIframeToHostMessage =
	| { type: "bk:runtime-ready"; reset?: boolean }
	| { type: "bk:reset-complete" }
	| { type: "bk:telemetry"; data: Record<string, unknown> }
	| { type: "bk:request-theme" }
	| { type: "bk:workspace-close" }
	| { type: "bk:workspace-focus"; direction: "forward" | "backward" }
	| { type: "bk:steps-ready" }
	| { type: "bk:steps-user-interacted" }
	| { type: "bk:steps-complete"; stepIndex?: number; feedback?: string }
	| {
			type: "bk:workspace-keydown";
			key: string;
			repeat?: boolean;
			ctrlKey?: boolean;
			altKey?: boolean;
			metaKey?: boolean;
	  }
	| { type: "bk:mousemove"; clientX: number; clientY: number }
	| { type: "bk:world-exit" };

export type SimulationMessage =
	| SimulationHostToIframeMessage
	| SimulationIframeToHostMessage;
