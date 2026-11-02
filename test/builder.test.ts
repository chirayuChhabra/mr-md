import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { rm, mkdir } from "node:fs/promises";
import * as fs from "fs";
import * as path from "path";

import { validateLesson } from "../src/builder/validation.js";
import {
	mergeOptions,
	getCallerDir,
	inferMediaKind,
	extractYouTubeId,
} from "../src/builder/utils.js";
import type { BuildOptions, LessonFrontmatter } from "../src/types.js";

describe("Builder Utilities", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = path.join(
			process.cwd(),
			".devbox",
			"test-builder-" + Math.random().toString(36).substring(7),
		);
		await mkdir(testDir, { recursive: true });
	});

	afterEach(async () => {
		if (testDir) {
			await rm(testDir, { recursive: true, force: true }).catch(() => {});
		}
	});

	describe("validateLesson", () => {
		test("should throw in strict mode if required fields are missing", () => {
			const invalidFm: any = {
				title: "",
				slug: "",
			};
			expect(() => validateLesson(invalidFm, [], { strict: true })).toThrow(
				"Lesson title is required",
			);
		});

		test("should not throw in non-strict mode", () => {
			const invalidFm: any = {
				title: "",
				slug: "",
			};
			// Should not throw
			expect(() => validateLesson(invalidFm, [], { strict: false })).not.toThrow();
		});

		test("should throw if no blocks provided", () => {
			const validFm: any = {
				title: "My Lesson",
				slug: "my-lesson",
			};
			expect(() => validateLesson(validFm, [], { strict: true })).toThrow(
				"Lesson needs at least one block",
			);
		});

		test("should pass valid frontmatter and blocks", () => {
			const validFm: any = {
				title: "My Lesson",
				slug: "my-lesson",
			};
			const blocks: any[] = [{ type: "markdown", content: "Hello" }];
			expect(() => validateLesson(validFm, blocks, { strict: true })).not.toThrow();
		});

		test("should throw if block height < 240", () => {
			const validFm: any = {
				title: "My Lesson",
				slug: "my-lesson",
			};
			const blocks: any[] = [{ type: "simulation", src: "foo.html", height: 100 }];
			expect(() => validateLesson(validFm, blocks, { strict: true })).toThrow(
				"should be at least 240px tall",
			);
		});

		test("should throw if observe simulation lacks caption", () => {
			const validFm: any = {
				title: "My Lesson",
				slug: "my-lesson",
			};
			const blocks: any[] = [{ type: "simulation", src: "foo.html", height: 400, controls: "observe" }];
			expect(() => validateLesson(validFm, blocks, { strict: true })).toThrow(
				"needs a caption",
			);
		});
	});

	describe("mergeOptions", () => {
		test("should merge user options with default options", () => {
			const userOptions: BuildOptions = {
				strict: true,
				theme: "dark",
			};
			const result = mergeOptions(userOptions);
			expect(result.strict).toBe(true);
			expect(result.theme).toBe("dark");
			expect(result.contentBase).toBeDefined(); // defaults to cwd
		});

		test("should preserve nested options", () => {
			const userOptions: BuildOptions = {
				preset: { layout: "article" },
			};
			const result = mergeOptions(userOptions);
			expect(result.preset?.layout).toBe("article");
			expect(result.preset?.density).toBe("comfortable"); // default preserved
		});
	});

	describe("getCallerDir", () => {
		test("should return a string path", () => {
			const dir = getCallerDir();
			expect(typeof dir).toBe("string");
			expect(dir.length).toBeGreaterThan(0);
		});
	});

	describe("inferMediaKind", () => {
		test("should infer audio kind", () => {
			expect(inferMediaKind("file.mp3")).toBe("audio");
			expect(inferMediaKind("file.wav")).toBe("audio");
		});
		test("should infer video kind", () => {
			expect(inferMediaKind("file.mp4")).toBe("video");
			expect(inferMediaKind("file.webm")).toBe("video");
		});
		test("should throw for unknown extensions", () => {
			expect(() => inferMediaKind("file.unknown")).toThrow(/Unsupported media type/);
		});
	});

	describe("extractYouTubeId", () => {
		test("should extract from full URL", () => {
			expect(extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
		});
		test("should extract from short URL", () => {
			expect(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
		});
		test("should return original if just an ID", () => {
			expect(extractYouTubeId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
		});
	});
});
