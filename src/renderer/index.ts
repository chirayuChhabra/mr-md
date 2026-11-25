import { configuredBuildOptions } from "../blog-kit/configured.js";
import { blogKit } from "../blog-kit/engine.js";
import type { BuildOptions, Chapter, Lesson } from "../types.js";

export function render(lesson: Lesson, opts: BuildOptions = {}): string {
	opts = configuredBuildOptions(opts);
	return (opts.blogKit ?? blogKit).renderLesson(lesson, opts);
}

export function renderChapter(
	chapter: Chapter,
	opts: BuildOptions = {},
): string {
	opts = configuredBuildOptions(opts);
	return (opts.blogKit ?? blogKit).renderChapter(chapter, opts);
}
