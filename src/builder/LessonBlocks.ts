import * as fs from "fs";
import * as path from "path";
import { logger } from "../cli/logger.js";
import type {
	AnimationBlock,
	AnimationOptions,
	Block,
	CalloutBlock,
	ColumnItem,
	ColumnsBlock,
	ColumnsOptions,
	HeadingBlock,
	ImageBlock,
	MarkdownBlock,
	MediaBlock,
	MediaOptions,
	QuizBlock,
	SectionBlock,
	SimulationBlock,
	SimulationConfig,
	SimulationOptions,
	YouTubeBlock,
	YouTubeOptions,
} from "../types.js";
import {
	extractYouTubeId,
	inferMediaKind,
	normalizeSimulationOptions,
} from "./utils.js";

export const DEFAULT_SIMULATION_HEIGHT = 420;
export const DEFAULT_ANIMATION_HEIGHT = 360;

export abstract class LessonBlocks {
	protected blocks: Block[] = [];

	// Must be implemented by LessonBuilder to get base paths for config loading
	protected abstract get contentBase(): string | undefined;

	add(src: `${string}.md` | `${string}.mdx`): this;
	add(src: `${string}.json`, opts?: Pick<QuizBlock, "label" | "caption">): this;
	add(
		src: `${string}.mp4` | `${string}.webm` | `${string}.mov`,
		opts?: Omit<MediaOptions, "kind">,
	): this;
	add(
		src: `${string}.mp3` | `${string}.wav` | `${string}.ogg` | `${string}.m4a`,
		opts?: Omit<MediaOptions, "kind">,
	): this;

	add(src: string, opts?: unknown): this;
	add(src: string, opts: unknown = {}): this {
		const lower = src.toLowerCase();
		if (lower.endsWith(".md") || lower.endsWith(".mdx"))
			return this.markdown(src);
		if (lower.endsWith(".json"))
			return this.quiz(src, opts as Pick<QuizBlock, "label" | "caption">);

		if (lower.endsWith(".js") || lower.endsWith(".ts")) {
			throw new Error(
				`Ambiguous use of .add("${src}"). ` +
					`Please use .lab("${src}") to mount it as an interactive simulation, ` +
					`or embed it using standard markdown code blocks via .markdown().`,
			);
		}

		if (lower.match(/\.(mp4|webm|mov)$/))
			return this.video(src, opts as Omit<MediaOptions, "kind">);
		if (lower.match(/\.(mp3|wav|ogg|m4a)$/))
			return this.audio(src, opts as Omit<MediaOptions, "kind">);
		if (lower.includes("youtube.com") || lower.includes("youtu.be"))
			return this.youtube(src, opts as YouTubeOptions);

		return this.markdown(src);
	}

	heading(src: string, title?: string): this {
		this.blocks.push({ type: "heading", src, title } as HeadingBlock);
		return this;
	}

	markdown(src: string): this {
		this.blocks.push({ type: "markdown", src } as MarkdownBlock);
		return this;
	}

	content(src: string): this {
		return this.markdown(src);
	}

	section(src: string, label?: string): this {
		this.blocks.push({ type: "section", src, label } as SectionBlock);
		return this;
	}

	important(src: string): this {
		this.blocks.push({ type: "important", src } as CalloutBlock);
		return this;
	}

	warning(src: string): this {
		this.blocks.push({ type: "warning", src } as CalloutBlock);
		return this;
	}

	tip(src: string): this {
		this.blocks.push({ type: "tip", src } as CalloutBlock);
		return this;
	}

	note(src: string): this {
		this.blocks.push({ type: "note", src } as CalloutBlock);
		return this;
	}

	callout(type: CalloutBlock["type"], src: string): this {
		this.blocks.push({ type, src } as CalloutBlock);
		return this;
	}

	columns(columns: ColumnItem[], opts: ColumnsOptions = {}): this {
		this.blocks.push({ type: "columns", columns, ...opts } as ColumnsBlock);
		return this;
	}

	private loadSimulationConfig(src: string): SimulationConfig | null {
		try {
			const base = this.contentBase ?? process.cwd();
			const resolved = path.resolve(base, src);
			const ext = path.extname(resolved);
			const configPath = `${ext.length > 0 ? resolved.slice(0, -ext.length) : resolved}.config.json`;
			if (fs.existsSync(configPath)) {
				return JSON.parse(fs.readFileSync(configPath, "utf-8"));
			}
		} catch (err: unknown) {
			logger.warn(
				`Failed to load simulation config for ${src}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
		return null;
	}

	simulation(
		src: string,
		opts: SimulationOptions | Record<string, unknown> = {},
		height = DEFAULT_SIMULATION_HEIGHT,
	): this {
		const fileConfig = this.loadSimulationConfig(src);
		const normalized = normalizeSimulationOptions(opts, height, fileConfig);
		this.blocks.push({
			type: "simulation",
			src,
			dependencies: fileConfig?.dependencies,
			...normalized,
		} as SimulationBlock);
		return this;
	}

	lab(src: string, opts: SimulationOptions = {}): this {
		return this.simulation(src, { controls: "interactive", ...opts });
	}

	animation(src: string, opts: AnimationOptions = {}): this {
		this.blocks.push({
			type: "animation",
			src,
			loop: opts.loop ?? true,
			height: opts.height ?? DEFAULT_ANIMATION_HEIGHT,
			label: opts.label,
			caption: opts.caption,
			accent: opts.accent ?? "neutral",
		} as AnimationBlock);
		return this;
	}

	media(src: string, opts: MediaOptions = {}): this {
		this.blocks.push({
			type: "media",
			src,
			kind: opts.kind ?? inferMediaKind(src),
			alt: opts.alt,
			label: opts.label,
			caption: opts.caption,
			credit: opts.credit,
			poster: opts.poster,
			controls: opts.controls ?? true,
		} as MediaBlock);
		return this;
	}

	image(
		src: string,
		opts: { caption?: string; label?: string; accent?: string } = {},
	): this {
		this.blocks.push({
			type: "image",
			src,
			...opts,
		} as ImageBlock);
		return this;
	}

	video(src: string, opts: Omit<MediaOptions, "kind"> = {}): this {
		return this.media(src, { ...opts, kind: "video" });
	}

	youtube(idOrUrl: string, opts: YouTubeOptions = {}): this {
		this.blocks.push({
			type: "youtube",
			id: extractYouTubeId(idOrUrl),
			start: opts.start,
			label: opts.label,
			caption: opts.caption,
		} as YouTubeBlock);
		return this;
	}

	audio(src: string, opts: Omit<MediaOptions, "kind"> = {}): this {
		return this.media(src, { ...opts, kind: "audio" });
	}

	quiz(src: string, opts: Pick<QuizBlock, "label" | "caption"> = {}): this {
		this.blocks.push({ type: "quiz", src, ...opts } as QuizBlock);
		return this;
	}
}
