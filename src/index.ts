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
