import type { NavItem } from "../renderer/utils.js";
import type { Block, BuildOptions, Chapter, Lesson } from "../types.js";

export interface EngineOutput {
	html: string;
	css?: string;
	/** Browser module source, included once per document. */
	js?: string;
	navItems?: NavItem[];
}

export interface EngineContext {
	settings: Readonly<Record<string, unknown>>;
	options: BuildOptions;
}

export interface EngineSettingsSchema {
	parse(value: unknown): unknown;
}

export interface SectionEngine<Context extends EngineContext> {
	/** A Zod schema can validate settings and describe controls for a studio. */
	schema?: EngineSettingsSchema;
	render(context: Context): EngineOutput;
}

export type ContentEngine = SectionEngine<
	EngineContext & { block: Block; index: number }
>;
export type TestingEngine = ContentEngine;
export type SimulationEngine = ContentEngine;
export type CodeEngine = SectionEngine<
	EngineContext & { code: string; language: string }
>;
export type ThemeEngine = SectionEngine<
	EngineContext & {
		lesson?: Lesson;
		chapter?: Chapter;
		bodyHtml: string;
		navItems: NavItem[];
		navHtml?: string;
		/** Render the existing page shell when a theme only needs to change styles. */
		renderDefault(): string;
	}
>;

export interface SectionEngines {
	theme: ThemeEngine;
	content: ContentEngine;
	testing: TestingEngine;
	simulation: SimulationEngine;
	code: CodeEngine;
}
