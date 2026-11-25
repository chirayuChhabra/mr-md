import { logger } from "../../cli/logger.js";
import { parseQuizMarkdown } from "../../parser/quiz.js";
import type {
	BuildOptions,
	QuizBlock,
	QuizFile,
	QuizQuestion,
} from "../../types.js";
import { mdInline, mdToHtml } from "../markdown/index.js";
import { type NavItem, resolveContent } from "../utils.js";
import { escHtml } from "./utils.js";

function renderQuestion(
	q: QuizQuestion,
	quizId: string,
	qi: number,
	options: BuildOptions,
): string {
	const qid = `${quizId}-q${qi}`;
	const optStrings = q.options
		.map(
			(opt, oi) => `
    <button class="bk-opt" data-opt-idx="${oi}">
      <span class="bk-opt-dot"></span><span class="bk-opt-text">${mdInline(opt)}</span>
    </button>`,
		)
		.join("");

	const expHtml = q.explanation
		? `<div class="bk-explanation" id="${qid}-exp" hidden>${mdToHtml(q.explanation, options).html}</div>`
		: "";

	return `
    <div class="bk-question" id="${qid}">
      <div class="bk-q-num">Question ${qi + 1}</div>
      <div class="bk-q-text">${mdToHtml(q.q, options).html}</div>
      <div class="bk-opts">${optStrings}</div>
      ${expHtml}
      ${options.presentation?.learning?.retry ? '<button type="button" class="bk-quiz-retry" hidden>Try again</button>' : ""}
    </div>`;
}

export function renderQuiz(
	block: QuizBlock,
	idx: number,
	options: BuildOptions,
): { html: string; navItems?: NavItem[] } {
	let quiz: QuizFile = { questions: [] };
	const isMd = block.src.endsWith(".quiz.md");
	const rawContent = resolveContent(block.src, options, isMd ? "text" : "json");
	try {
		const trimmed = rawContent.trim();
		if (isMd) {
			quiz = parseQuizMarkdown(trimmed);
		} else {
			if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
				throw new Error("Quiz file not found or invalid JSON format");
			}
			quiz = JSON.parse(trimmed);
		}

		if (!quiz || typeof quiz !== "object" || !Array.isArray(quiz.questions)) {
			throw new Error("Quiz must contain a 'questions' array");
		}
		for (let i = 0; i < quiz.questions.length; i++) {
			const q = quiz.questions[i];
			if (!q.q || typeof q.q !== "string") {
				throw new Error(`Question ${i + 1} is missing a valid 'q' string`);
			}
			if (!Array.isArray(q.options) || q.options.length < 2) {
				throw new Error(`Question ${i + 1} must have at least 2 options`);
			}
			if (
				typeof q.answer !== "number" ||
				q.answer < 0 ||
				q.answer >= q.options.length
			) {
				throw new Error(`Question ${i + 1} has an invalid answer index`);
			}
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (options.strict !== false) {
			throw new Error(`Invalid Quiz for block ${idx + 1}: ${msg}`);
		}
		logger.warn(
			`  ⚠ Invalid Quiz for block ${idx + 1}: ${e instanceof Error ? e.message : e}`,
		);
		return {
			html: `<div class="bk-callout bk-callout--warning"><div class="bk-callout-icon"></div><div class="bk-callout-content"><div class="bk-callout-label">Quiz Error</div><div class="bk-callout-body"><p>${escHtml(msg)}</p></div></div></div>`,
		};
	}

	return {
		html: `<div class="bk-quiz" id="quiz-${idx}" data-bk-explanations="${options.presentation?.learning?.explanations !== false}">
          <div class="bk-quiz-head">
            <span>${escHtml(block.label ?? "Check your understanding")}</span>
            ${block.caption ? `<small>${mdInline(block.caption)}</small>` : ""}
          </div>
          <div class="bk-quiz-body">
            ${quiz.questions.map((q, qi) => renderQuestion(q, `quiz-${idx}`, qi, options)).join("\n")}
          </div>
          <script type="application/json" class="bk-quiz-data">"${Buffer.from(JSON.stringify(quiz.questions.map((q) => q.answer))).toString("base64")}"</script>
        </div>`,
		navItems: [
			{
				id: `quiz-${idx}`,
				label: block.label ?? "Questions",
				kind: "quiz",
			},
		],
	};
}
