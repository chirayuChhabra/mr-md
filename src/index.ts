export { configuredBuildOptions } from "./blog-kit/configured.js";
export type {
	BlockEngine,
	BlockRenderContext,
	BlockRenderResult,
	BlogKit,
	BlogKitEngine,
	BlogKitEngineIssue,
	BlogKitEngines,
	ChapterEngine,
	LayoutEngine,
} from "./blog-kit/contracts.js";
export {
	BLOG_KIT_API_VERSION,
	BlogKitEngineError,
} from "./blog-kit/contracts.js";
export {
	blogKit,
	createBlogKit,
	defaultBlogKitEngines,
} from "./blog-kit/engine.js";
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
} from "./blog-kit/sections.js";
export type { CompiledDocument } from "./compiler.js";
export { buildProject, compileProject } from "./compiler.js";
export type {
	BlogKitSettings,
	ConfigIssue,
	EngineSectionName,
	MrmdConfig,
} from "./config.js";
export {
	blogKitSettingsSchema,
	configuredLessons,
	engineSectionSchema,
	engineSections,
	loadMrmdConfig,
	MrmdConfigError,
	mrmdConfigJsonSchema,
	mrmdConfigSchema,
	resolveSettings,
	validateMrmdConfig,
} from "./config.js";
export {
	buildChapter,
	buildLesson,
	parseChapter,
	parseLesson,
} from "./parser/mdx.js";
export { render } from "./renderer/index.js";
export {
	ensureLanguageLoaded,
	initHighlighter,
	normalizeLanguage,
	preloadLanguagesFromMarkdown,
	renderCodeBlock,
} from "./renderer/markdown/index.js";
export type {
	SimulationConfigIssue,
	ValidatedSimulationConfig,
} from "./simulation-config.js";
export {
	SimulationConfigError,
	simulationConfigJsonSchema,
	simulationConfigSchema,
	validateSimulationConfig,
} from "./simulation-config.js";
export type {
	AnimationBlock,
	AnimationOptions,
	Block,
	BlockAccent,
	BlockType,
	BuildOptions,
	CalloutBlock,
	ColumnItem,
	ColumnsBlock,
	ColumnsOptions,
	HeadingBlock,
	ImageBlock,
	Lesson,
	LessonMeta,
	LessonPreset,
	MarkdownBlock,
	MediaBlock,
	MediaKind,
	MediaOptions,
	QuizBlock,
	QuizFile,
	QuizQuestion,
	SectionBlock,
	SimulationBlock,
	SimulationControl,
	SimulationOptions,
	YouTubeBlock,
	YouTubeOptions,
} from "./types.js";
