import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import matter from "@11ty/gray-matter";
import {
	configuredLessons,
	lessonConfiguration,
	loadMrmdConfig,
	type MrmdConfig,
	projectSettings,
	resolveLessonPath,
} from "./config.js";
import { buildChapter, parseLesson } from "./parser/mdx.js";
import type { BuildOptions, Chapter } from "./types.js";

/** Versioned handoff from Markdown compilation to Blog Kit rendering. */
export interface CompiledDocument {
	version: 1;
	kind: "chapter";
	chapter: Chapter;
	config: MrmdConfig;
	sourceFiles: string[];
}

export function discoverLessons(
	directory: string,
	config: MrmdConfig,
): string[] {
	const lessons = configuredLessons(config);
	if (lessons)
		return lessons.map((entry) =>
			typeof entry === "string" ? entry : entry.file,
		);
	const files = readdirSync(directory, { withFileTypes: true })
		.filter(
			(entry) =>
				(entry.isFile() || entry.isSymbolicLink()) &&
				entry.name.endsWith(".md"),
		)
		.map((entry) => {
			const file = resolveLessonPath(directory, entry.name);
			const data = matter(readFileSync(file, "utf8")).data;
			return { file: entry.name, index: Number(data.index) };
		});
	// Honor complete legacy ordering while allowing unindexed folders.
	const legacy = files.every(
		(entry) => Number.isInteger(entry.index) && entry.index > 0,
	);
	return files
		.sort(
			(a, b) =>
				(legacy ? a.index - b.index : 0) ||
				a.file.localeCompare(b.file, "en", { numeric: true }),
		)
		.map((entry) => entry.file);
}

export function compileProject(
	directory: string,
	options: BuildOptions = {},
): CompiledDocument {
	const root = path.resolve(directory);
	const config = loadMrmdConfig(root);
	const files = discoverLessons(root, config);
	if (!files.length) throw new Error(`No Markdown lessons found in ${root}`);
	const title =
		config.title ??
		path
			.basename(root)
			.replace(/^\d+[-_]/, "")
			.replace(/[-_]/g, " ")
			.replace(/\b\w/g, (char) => char.toUpperCase());
	const chapter: Chapter = {
		meta: { title, slug: "index", description: config.description },
		presentation: projectSettings(config),
		lessons: files.map((file) => {
			const source = resolveLessonPath(root, file);
			const lesson = parseLesson(
				readFileSync(source, "utf8"),
				{ ...options, contentBase: path.dirname(source) },
				path.dirname(source),
				undefined,
				path.basename(file),
			);
			Object.assign(lesson, lessonConfiguration(config, file));
			lesson.meta.parentSlug = "index";
			lesson.meta.parentTitle = title;
			return lesson;
		}),
	};
	const outputRoot = path.resolve(options.outDir ?? path.join(root, "out"));
	// Keep published paths distinct on case-insensitive and Unicode-normalizing hosts.
	const outputKey = (slug: string) =>
		path.resolve(outputRoot, `${slug}.html`).normalize("NFC").toLowerCase();
	const outputs = new Set([outputKey(chapter.meta.slug)]);
	for (const [index, lesson] of chapter.lessons.entries()) {
		const filename = outputKey(lesson.meta.slug);
		if (outputs.has(filename))
			throw new Error(`Duplicate or reserved lesson slug: ${lesson.meta.slug}`);
		outputs.add(filename);
		const previous = chapter.lessons[index - 1];
		const next = chapter.lessons[index + 1];
		lesson.meta.prevSlug = previous?.meta.slug;
		lesson.meta.prevTitle = previous?.meta.title;
		lesson.meta.nextSlug = next?.meta.slug;
		lesson.meta.nextTitle = next?.meta.title;
	}
	return { version: 1, kind: "chapter", chapter, config, sourceFiles: files };
}

export function buildProject(
	directory: string,
	options: BuildOptions = {},
): string {
	const document = compileProject(directory, options);
	return buildChapter(document.chapter, {
		outDir: path.join(directory, "out"),
		contentBase: path.resolve(directory),
		...options,
	});
}
