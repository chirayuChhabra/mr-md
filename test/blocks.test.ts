import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { rm, mkdir } from "node:fs/promises";
import * as fs from "fs";
import * as path from "path";

import { renderQuiz } from "../src/renderer/blocks/quiz.js";
import { renderSimulation } from "../src/renderer/blocks/simulation.js";
import { iframeDoc } from "../src/renderer/blocks/iframe.js";
import { renderAnimation } from "../src/renderer/blocks/animation.js";
import { renderMedia } from "../src/renderer/blocks/media.js";
import { renderHeading } from "../src/renderer/blocks/heading.js";
import { renderSection } from "../src/renderer/blocks/section.js";
import { renderImage } from "../src/renderer/blocks/image.js";
import type { BuildOptions, QuizBlock, SimulationBlock, AnimationBlock, MediaBlock, HeadingBlock, SectionBlock, ImageBlock } from "../src/types.js";

describe("Block Renderers", () => {
	let testDir: string;
	let options: BuildOptions;

	beforeEach(async () => {
		testDir = path.join(process.cwd(), ".devbox", "test-blocks-" + Math.random().toString(36).substring(7));
		await mkdir(testDir, { recursive: true });
		options = { contentBase: testDir, strict: true };
	});

	afterEach(async () => {
		if (testDir) {
			await rm(testDir, { recursive: true, force: true }).catch(() => {});
		}
	});

	describe("renderQuiz", () => {
		test("should render a valid JSON quiz", () => {
			const quizPath = path.join(testDir, "test.quiz.json");
			const quizData = {
				questions: [
					{
						q: "What is 2+2?",
						options: ["3", "4", "5"],
						answer: 1,
					}
				]
			};
			fs.writeFileSync(quizPath, JSON.stringify(quizData));

			const block: QuizBlock = { type: "quiz", src: "test.quiz.json" };
			const result = renderQuiz(block, 0, options);

			expect(result.html).toContain("What is 2+2?");
			expect(result.html).toContain("data-opt-idx=\"0\"");
			expect(result.html).toContain("bk-quiz-data");
			expect(result.html).toContain(Buffer.from(JSON.stringify([1])).toString("base64"));
		});

		test("should render a valid MD quiz", () => {
			const quizPath = path.join(testDir, "test.quiz.md");
			const mdData = `
## Markdown quiz?
-- No
++ Yes
-- Maybe
`;
			fs.writeFileSync(quizPath, mdData);

			const block: QuizBlock = { type: "quiz", src: "test.quiz.md" };
			const result = renderQuiz(block, 0, options);

			expect(result.html).toContain("Markdown quiz?");
			expect(result.html).toContain("Yes");
			expect(result.html).toContain(Buffer.from(JSON.stringify([1])).toString("base64"));
		});

		test("should throw in strict mode on invalid JSON", () => {
			const quizPath = path.join(testDir, "bad.quiz.json");
			fs.writeFileSync(quizPath, "{ bad json }");

			const block: QuizBlock = { type: "quiz", src: "bad.quiz.json" };
			expect(() => renderQuiz(block, 0, options)).toThrow();
		});

		test("should return fallback HTML in non-strict mode on invalid JSON", () => {
			const quizPath = path.join(testDir, "bad.quiz.json");
			fs.writeFileSync(quizPath, "{ bad json }");

			const block: QuizBlock = { type: "quiz", src: "bad.quiz.json" };
			const result = renderQuiz(block, 0, { ...options, strict: false });
			expect(result.html).toContain("bk-callout--warning");
			expect(result.html).toContain("Quiz Error");
		});
	});

	describe("renderSimulation", () => {
		test("should render a basic simulation", () => {
			const simPath = path.join(testDir, "sim.ts");
			fs.writeFileSync(simPath, "console.log('sim');");

			const block: SimulationBlock = { type: "simulation", src: "sim.ts" };
			const result = renderSimulation(block, 0, options);

			expect(result.html).toContain("bk-embed-interactive");
			expect(result.html).toContain("iframe");
		});

		test("should inject configuration props", () => {
			const simPath = path.join(testDir, "sim.ts");
			fs.writeFileSync(simPath, "console.log('sim');");

			const block: SimulationBlock = { type: "simulation", src: "sim.ts", props: { test: 123 } };
			const result = renderSimulation(block, 0, options);

			expect(result.html).toContain('{&quot;test&quot;:123}');
		});
	});

	describe("renderIframe (iframeDoc)", () => {
		test("should construct an iframe document with proper injections", () => {
			const doc = iframeDoc("console.log('injected');", '{"hello": "world"}', true, ["https://unpkg.com/react"]);
			expect(doc).toContain("&lt;script src=&quot;https://unpkg.com/react&quot;&gt;&lt;/script&gt;");
			expect(doc).toContain("{&quot;hello&quot;: &quot;world&quot;}");
		});
	});

	describe("renderAnimation", () => {
		test("should render an animation iframe", () => {
			const jsPath = path.join(testDir, "anim.js");
			fs.writeFileSync(jsPath, "console.log('anim');");
			const block: AnimationBlock = { type: "animation", src: "anim.js" };
			const result = renderAnimation(block, 0, options);
			expect(result.html).toContain("bk-embed-interactive");
			expect(result.html).toContain("data-is-animation=\"true\"");
		});
	});

	describe("renderMedia", () => {
		test("should render audio element", () => {
			const audioPath = path.join(testDir, "audio.mp3");
			fs.writeFileSync(audioPath, "dummy audio");
			const block: MediaBlock = { type: "media", src: "audio.mp3", kind: "audio" };
			const result = renderMedia(block, 0, options);
			expect(result.html).toContain("<audio");
			expect(result.html).toContain('src="assets/audio-');
		});

		test("should render video element", () => {
			const videoPath = path.join(testDir, "video.mp4");
			fs.writeFileSync(videoPath, "dummy video");
			const block: MediaBlock = { type: "media", src: "video.mp4", kind: "video" };
			const result = renderMedia(block, 0, options);
			expect(result.html).toContain("<video");
			expect(result.html).toContain('src="assets/video-');
			expect(result.html).toContain("controls");
		});
	});

	describe("renderImage", () => {
		test("should render an image block with alt text", () => {
			const imgPath = path.join(testDir, "image.png");
			fs.writeFileSync(imgPath, "dummy img");
			const block: ImageBlock = { type: "image", src: "image.png", alt: "Alt text" };
			const result = renderImage(block, 0, options);
			expect(result.html).toContain("<img");
			expect(result.html).toContain('src="assets/image-');
		});
	});

	describe("renderHeading", () => {
		test("should render a heading with standard ID generation", () => {
			const block: HeadingBlock = { type: "heading", src: "## My Title" };
			const result = renderHeading(block, 0, options);
			expect(result.html).toContain("<h2");
			expect(result.html).toContain('id="bk-my-title-0"');
			expect(result.html).toContain("My Title");
		});
	});

	describe("renderSection", () => {
		test("should render a section with a heading", () => {
			const block: SectionBlock = { type: "section", src: "# My Section", isSubsection: false };
			const result = renderSection(block, 0, options);
			expect(result.html).toContain('class="bk-section');
			expect(result.html).toContain("<h1");
			expect(result.html).toContain("My Section");
		});
	});
});
