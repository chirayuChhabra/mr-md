// @ts-nocheck
import {
	escapeHtml,
	highlightCode,
} from "../renderer/markdown/runner-highlighter.js";
import { BkAutocomplete, isInsideStringOrComment } from "./autocomplete.js";
import { createCodeMirrorEditor } from "./cm-editor.js";

// Wandbox compiler mapping for compiled languages
const WANDBOX_COMPILERS: Record<string, string> = {
	cpp: "gcc-head",
	"c++": "gcc-head",
	c: "gcc-head-c",
	rust: "rust-1.82.0",
	rs: "rust-1.82.0",
	go: "go-head",
	golang: "go-head",
	java: "openjdk-head",
	csharp: "dotnetcore-head",
	cs: "dotnetcore-head",
	"c#": "dotnetcore-head",
	bash: "bash",
	sh: "bash",
	shell: "bash",
	zsh: "bash",
	ruby: "ruby-head",
	rb: "ruby-head",
	php: "php-head",
	lua: "lua-5.4.0",
	zig: "zig-head",
	swift: "swift-head",
	r: "r-head",
	haskell: "ghc-head",
	hs: "ghc-head",
	perl: "perl-head",
};

// Compiler options for Wandbox
const WANDBOX_OPTIONS: Record<string, string> = {
	cpp: "c++23,warning",
	"c++": "c++23,warning",
	c: "c11,warning",
};

// Language comment tokens for Cmd+/ line commenting
const COMMENT_TOKENS: Record<string, string> = {
	javascript: "//",
	js: "//",
	typescript: "//",
	ts: "//",
	mjs: "//",
	node: "//",
	c: "//",
	cpp: "//",
	"c++": "//",
	csharp: "//",
	cs: "//",
	"c#": "//",
	java: "//",
	rust: "//",
	rs: "//",
	go: "//",
	golang: "//",
	swift: "//",
	zig: "//",
	php: "//",
	python: "#",
	py: "#",
	py3: "#",
	python3: "#",
	bash: "#",
	sh: "#",
	shell: "#",
	zsh: "#",
	ruby: "#",
	rb: "#",
	perl: "#",
	r: "#",
	sql: "--",
	lua: "--",
};

// Execution controller tracking for cancellation (Stop button)
interface ActiveExecution {
	abort: () => void;
}
const activeExecutions = new WeakMap<HTMLElement, ActiveExecution>();

// Skulpt lazy loader singleton
let skulptPromise: Promise<void> | null = null;
function getSkulpt(): Promise<void> {
	if (
		typeof window !== "undefined" &&
		typeof (window as unknown as { Sk?: unknown }).Sk !== "undefined"
	) {
		return Promise.resolve();
	}
	if (skulptPromise) return skulptPromise;

	skulptPromise = (async () => {
		const loadScript = (src: string) =>
			new Promise<void>((res, rej) => {
				const s = document.createElement("script");
				s.src = src;
				s.onload = () => res();
				s.onerror = () => rej(new Error(`Failed to load script: ${src}`));
				document.head.appendChild(s);
			});

		await loadScript(
			"https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt.min.js",
		);
		await loadScript(
			"https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt-stdlib.js",
		);
	})().catch((e) => {
		skulptPromise = null; // Allow retry on failure
		throw e;
	});

	return skulptPromise;
}

// Clean JavaScript / TypeScript error parser
function formatCleanJsError(err: unknown): string {
	const errorObj = err as { message?: string; name?: string; stack?: string };
	const message = errorObj?.message || String(err);
	const name = errorObj?.name || "Error";
	const stack = errorObj?.stack || "";

	const lines = stack.split("\n");
	let lineSuffix = "";
	for (let i = 1; i < lines.length; i++) {
		const match =
			lines[i].match(/:(\d+):(\d+)\)?$/) || lines[i].match(/:(\d+):(\d+)/);
		if (match) {
			const rawLine = parseInt(match[1], 10);
			const userLine = Math.max(1, rawLine - 2);
			lineSuffix = ` on line ${userLine}`;
			break;
		}
	}

	return `${name}: ${message}${lineSuffix}`;
}

// Strip TypeScript type annotations safely
function stripTypeScript(code: string): string {
	return code
		.replace(/interface\s+[A-Za-z0-9_<>,\s]+\{[\s\S]*?\}/g, "")
		.replace(/type\s+[A-Za-z0-9_<>,\s]+=\s*[\s\S]*?;/g, "")
		.replace(/:\s*([A-Za-z0-9_<>[\]]+|\{[^}]*\})(?=\s*[,=);])/g, "")
		.replace(/\s+as\s+[A-Za-z0-9_<>[\]]+/g, "")
		.replace(/([a-zA-Z0-9_$])<[A-Za-z0-9_,\s]+>(?=\()/g, "$1");
}

// Fast Web Worker JavaScript Runner with abort signal
function runJavaScript(
	code: string,
	timeoutMs: number,
	onLog: (entry: { level: string; text: string }) => void,
	onRegisterAbort: (abortFn: () => void) => void,
): Promise<{ success: boolean; duration: number; error?: string }> {
	return new Promise((resolve) => {
		const startTime = performance.now();

		const workerBlobCode = `
      self.onmessage = async function(e) {
        const { code } = e.data;

        function serialize(val) {
          if (val === null) return "null";
          if (val === undefined) return "undefined";
          if (typeof val === "string") return val;
          if (typeof val === "number" || typeof val === "boolean" || typeof val === "bigint") return String(val);
          if (typeof val === "function") return val.toString();
          if (val instanceof Error) return (val.name || "Error") + ": " + val.message;
          try {
            return JSON.stringify(val, null, 2);
          } catch (_err) {
            return Object.prototype.toString.call(val);
          }
        }

        const customConsole = {
          log: (...args) => self.postMessage({ type: "log", level: "info", text: args.map(serialize).join(" ") }),
          info: (...args) => self.postMessage({ type: "log", level: "info", text: args.map(serialize).join(" ") }),
          warn: (...args) => self.postMessage({ type: "log", level: "warn", text: args.map(serialize).join(" ") }),
          error: (...args) => self.postMessage({ type: "log", level: "error", text: args.map(serialize).join(" ") })
        };

        try {
          const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
          const fn = new AsyncFunction("console", code);
          const result = await fn(customConsole);
          if (result !== undefined) {
            self.postMessage({ type: "return", text: serialize(result) });
          }
          self.postMessage({ type: "done", success: true });
        } catch (err) {
          self.postMessage({
            type: "error",
            name: err ? err.name : "Error",
            message: err ? err.message : String(err),
            stack: err ? err.stack : ""
          });
          self.postMessage({ type: "done", success: false });
        }
      };
    `;

		const blob = new Blob([workerBlobCode], {
			type: "application/javascript",
		});
		const workerUrl = URL.createObjectURL(blob);
		const worker = new Worker(workerUrl);

		let resolved = false;

		const cleanup = () => {
			if (!resolved) {
				resolved = true;
				worker.terminate();
				URL.revokeObjectURL(workerUrl);
			}
		};

		onRegisterAbort(() => {
			if (!resolved) {
				cleanup();
				const duration = Math.round(performance.now() - startTime);
				onLog({ level: "warn", text: "Execution stopped by user." });
				resolve({ success: false, duration, error: "Execution cancelled" });
			}
		});

		const timeoutId = setTimeout(() => {
			if (!resolved) {
				cleanup();
				const duration = Math.round(performance.now() - startTime);
				onLog({
					level: "error",
					text: `Execution timed out after ${timeoutMs}ms. Infinite loop detected?`,
				});
				resolve({ success: false, duration, error: "Execution timed out" });
			}
		}, timeoutMs);

		worker.onmessage = (e) => {
			const data = e.data;
			if (!data) return;

			if (data.type === "log") {
				onLog({ level: data.level, text: data.text });
			} else if (data.type === "return") {
				onLog({ level: "return", text: `=> ${data.text}` });
			} else if (data.type === "error") {
				const cleanErr = formatCleanJsError(data);
				onLog({ level: "error", text: cleanErr });
			} else if (data.type === "done") {
				clearTimeout(timeoutId);
				const duration = Math.round(performance.now() - startTime);
				cleanup();
				resolve({ success: data.success, duration });
			}
		};

		worker.onerror = (err) => {
			clearTimeout(timeoutId);
			const duration = Math.round(performance.now() - startTime);
			const message = err.message || "An unhandled script error occurred.";
			onLog({ level: "error", text: message });
			cleanup();
			resolve({ success: false, duration, error: message });
		};

		worker.postMessage({ code });
	});
}

// In-browser Python via Skulpt with execution limits & abort signal
async function runPython(
	code: string,
	timeoutMs: number,
	onLog: (entry: { level: string; text: string }) => void,
	onRegisterAbort: (abortFn: () => void) => void,
): Promise<{ success: boolean; duration: number; error?: string }> {
	const startTime = performance.now();
	let isAborted = false;

	onRegisterAbort(() => {
		isAborted = true;
	});

	try {
		await getSkulpt();

		if (isAborted) {
			const duration = Math.round(performance.now() - startTime);
			onLog({ level: "warn", text: "Execution stopped by user." });
			return { success: false, duration, error: "Execution cancelled" };
		}

		let buffer = "";
		window.Sk.configure({
			output: (str: string) => {
				buffer += str;
				if (str.endsWith("\n")) {
					onLog({ level: "info", text: buffer.replace(/\n$/, "") });
					buffer = "";
				}
			},
			read: (file: string) => {
				if (
					window.Sk.builtinFiles === undefined ||
					window.Sk.builtinFiles.files[file] === undefined
				) {
					throw new Error(`File not found: '${file}'`);
				}
				return window.Sk.builtinFiles.files[file];
			},
			yieldLimit: 100,
			execLimit: timeoutMs,
		});

		window.Sk.timeoutMsg = () =>
			`Execution timed out after ${timeoutMs}ms. Infinite loop detected?`;

		await window.Sk.misceval.asyncToPromise(() => {
			if (isAborted) throw new Error("Execution cancelled by user");
			return window.Sk.importMainWithBody("<stdin>", false, code, true);
		});

		if (buffer.length > 0) {
			onLog({ level: "info", text: buffer.trimEnd() });
		}

		const duration = Math.round(performance.now() - startTime);
		return { success: true, duration };
	} catch (err: unknown) {
		const duration = Math.round(performance.now() - startTime);
		const errorObj = err as { toString?: () => string };
		const rawError = errorObj?.toString ? errorObj.toString() : String(err);
		const errorText = isAborted ? "Execution stopped by user." : rawError;
		onLog({ level: isAborted ? "warn" : "error", text: errorText });
		return { success: false, duration, error: errorText };
	}
}

// Free Cloud Compilation via Wandbox with abort signal
async function runCompiled(
	lang: string,
	code: string,
	stdin: string,
	timeoutMs: number,
	onLog: (entry: { level: string; text: string }) => void,
	onRegisterAbort: (abortFn: () => void) => void,
): Promise<{ success: boolean; duration: number; error?: string }> {
	const startTime = performance.now();
	const langKey = lang.toLowerCase();
	const compiler = WANDBOX_COMPILERS[langKey] || "gcc-head";
	const options = WANDBOX_OPTIONS[langKey] || "";
	const controller = new AbortController();

	let abortedByUser = false;
	let timedOut = false;

	onRegisterAbort(() => {
		abortedByUser = true;
		controller.abort();
	});

	// Remote compilation requires a generous threshold (at least 35s)
	const timeoutLimit = Math.max(timeoutMs, 35000);
	const timeoutId = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutLimit);

	try {
		onLog({
			level: "status",
			text: `Compiling and running ${lang.toUpperCase()} via ${compiler}...`,
		});

		const requestBody: Record<string, string> = {
			compiler,
			code,
			stdin: stdin || "",
		};
		if (options) {
			requestBody.options = options;
		}

		const response = await fetch("https://wandbox.org/api/compile.json", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			signal: controller.signal,
			body: JSON.stringify(requestBody),
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			throw new Error(`Compilation server returned HTTP ${response.status}`);
		}

		const data = await response.json();
		const duration = Math.round(performance.now() - startTime);

		// 1. Compiler error output
		if (data.compiler_error?.trim()) {
			onLog({
				level: "error",
				text: data.compiler_error.trim(),
			});
			if (data.status !== "0") {
				return { success: false, duration, error: "Compilation failed" };
			}
		}

		// 2. Program standard output
		if (data.program_output?.trimEnd()) {
			onLog({ level: "info", text: data.program_output.trimEnd() });
		}

		// 3. Program standard error
		if (data.program_error?.trimEnd()) {
			onLog({ level: "warn", text: data.program_error.trimEnd() });
		}

		const success = data.status === "0";
		return { success, duration };
	} catch (err: unknown) {
		clearTimeout(timeoutId);
		const duration = Math.round(performance.now() - startTime);
		if (abortedByUser) {
			onLog({ level: "warn", text: "Execution stopped by user." });
			return { success: false, duration, error: "Execution cancelled" };
		}
		if (timedOut) {
			onLog({
				level: "error",
				text: `Compilation timed out after ${Math.round(timeoutLimit / 1000)}s. Remote compiler may be under heavy load. Please try again.`,
			});
			return { success: false, duration, error: "Compilation timed out" };
		}
		const msg = err instanceof Error ? err.message : String(err);
		onLog({
			level: "error",
			text: `Network error: ${msg}\nPlease check your internet connection.`,
		});
		return { success: false, duration, error: msg };
	}
}

// Fast Line Numbers Update without DOM churn (caches line count)
function updateLineNumbers(runner: HTMLElement, code: string): void {
	const linesEl = runner.querySelector(
		".bk-runner-lines",
	) as HTMLElement | null;
	if (!linesEl) return;
	const count = Math.max(1, code.split("\n").length);
	if (runner.__bk_last_line_count === count && linesEl.textContent) return;
	runner.__bk_last_line_count = count;
	linesEl.textContent = Array.from({ length: count }, (_, i) => i + 1).join(
		"\n",
	);
}

// Update Highlight Backdrop Layer
function updateHighlight(runner: HTMLElement, code: string): void {
	const codeLayer = runner.querySelector(
		".bk-runner-code-layer",
	) as HTMLElement | null;
	if (!codeLayer) return;
	const lang = runner.getAttribute("data-lang") || "javascript";
	const highlighted = highlightCode(code, lang);
	codeLayer.innerHTML = code.endsWith("\n") ? `${highlighted}\n ` : highlighted;
}

// Dynamic Auto-sizing of Editor Height
function autoSizeEditor(
	runner: HTMLElement,
	textarea: HTMLTextAreaElement,
): void {
	const codeArea = runner.querySelector(
		".bk-runner-code-area",
	) as HTMLElement | null;
	if (!codeArea) return;
	textarea.style.height = "auto";
	const targetHeight = Math.min(Math.max(textarea.scrollHeight, 100), 480);
	codeArea.style.height = `${targetHeight}px`;
	textarea.style.height = `${targetHeight}px`;
}

// Synchronize Scrolling across elements
function syncScroll(
	textarea: HTMLTextAreaElement,
	highlightPre: HTMLElement | null,
	linesEl: HTMLElement | null,
): void {
	if (highlightPre) {
		highlightPre.scrollTop = textarea.scrollTop;
		highlightPre.scrollLeft = textarea.scrollLeft;
	}
	if (linesEl) {
		linesEl.scrollTop = textarea.scrollTop;
	}
}

// Set Run button state (Compile, Run, Stop, Binary Ready)
function resetRunButtonLabel(
	runBtn: HTMLButtonElement,
	runner: HTMLElement,
): void {
	const runText = runBtn.querySelector(".bk-run-text");
	const iconSvg = runBtn.querySelector(".bk-run-icon");
	const isTwoStep = runner.getAttribute("data-mode") === "two-step";
	const isChallenge = runner.getAttribute("data-challenge") === "true";

	runBtn.classList.remove("running");

	if (isTwoStep && runner.__bk_binary_ready) {
		runBtn.classList.add("binary-ready");
		runBtn.title = "Run compiled binary (Ctrl+Enter)";
		if (runText) runText.textContent = "Run Binary";
		if (iconSvg) {
			iconSvg.innerHTML =
				'<polygon points="5 3 19 12 5 21 5 3" fill="currentColor"></polygon>';
		}
	} else if (isTwoStep) {
		runBtn.classList.remove("binary-ready");
		runBtn.title = "Compile code (Ctrl+Enter)";
		if (runText) runText.textContent = "Compile";
		if (iconSvg) {
			iconSvg.innerHTML =
				'<polygon points="12 2 2 7 12 12 22 7 12 2" fill="none" stroke="currentColor" stroke-width="2"></polygon><polyline points="2 17 12 22 22 17" fill="none" stroke="currentColor" stroke-width="2"></polyline><polyline points="2 12 12 17 22 12" fill="none" stroke="currentColor" stroke-width="2"></polyline>';
		}
	} else if (isChallenge) {
		runBtn.classList.remove("binary-ready");
		runBtn.title = "Run code and check answer (Ctrl+Enter)";
		if (runText) runText.textContent = "Check Answer";
		if (iconSvg) {
			iconSvg.innerHTML =
				'<polygon points="5 3 19 12 5 21 5 3" fill="currentColor"></polygon>';
		}
	} else {
		runBtn.classList.remove("binary-ready");
		runBtn.title = "Run code (Ctrl+Enter)";
		if (runText) runText.textContent = "Run";
		if (iconSvg) {
			iconSvg.innerHTML =
				'<polygon points="5 3 19 12 5 21 5 3" fill="currentColor"></polygon>';
		}
	}
}

function setRunButtonState(
	runBtn: HTMLButtonElement,
	running: boolean,
	runner: HTMLElement,
): void {
	const runText = runBtn.querySelector(".bk-run-text");
	const iconSvg = runBtn.querySelector(".bk-run-icon");
	const isTwoStep = runner.getAttribute("data-mode") === "two-step";

	if (running) {
		runBtn.classList.add("running");
		const isCompiling = isTwoStep && !runner.__bk_binary_ready;
		runBtn.title = isCompiling ? "Compiling source code..." : "Stop execution";
		if (runText) {
			runText.textContent = isCompiling ? "Compiling..." : "Stop";
		}
		if (iconSvg) {
			if (isCompiling) {
				iconSvg.innerHTML =
					'<svg class="bk-spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>';
			} else {
				iconSvg.innerHTML =
					'<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"></rect>';
			}
		}
	} else {
		resetRunButtonLabel(runBtn, runner);
	}
}

// Toggle comments on lines using Cmd + / or Ctrl + /
function toggleLineComments(
	textarea: HTMLTextAreaElement,
	runner: HTMLElement,
): void {
	const lang = (runner.getAttribute("data-lang") || "javascript").toLowerCase();
	const commentToken = COMMENT_TOKENS[lang] || "//";
	const start = textarea.selectionStart;
	const end = textarea.selectionEnd;
	const val = textarea.value;

	const lineStart = val.lastIndexOf("\n", start - 1) + 1;
	let lineEnd = val.indexOf("\n", end);
	if (lineEnd === -1) lineEnd = val.length;

	const lines = val.slice(lineStart, lineEnd).split("\n");

	// Check if all non-empty lines are commented
	const allCommented = lines.every((l) => {
		const trimmed = l.trimStart();
		return trimmed.length === 0 || trimmed.startsWith(commentToken);
	});

	let modified: string[];
	if (allCommented) {
		// Uncomment: remove token and optional single trailing space
		modified = lines.map((line) => {
			const idx = line.indexOf(commentToken);
			if (idx === -1) return line;
			const after = line.slice(idx + commentToken.length);
			const hasSpace = after.startsWith(" ");
			return line.slice(0, idx) + (hasSpace ? after.slice(1) : after);
		});
	} else {
		// Comment: find minimum indentation of non-empty lines
		let minIndent = Infinity;
		for (const line of lines) {
			if (line.trim().length > 0) {
				const indentLen = line.match(/^\s*/)?.[0].length || 0;
				if (indentLen < minIndent) minIndent = indentLen;
			}
		}
		if (minIndent === Infinity) minIndent = 0;

		modified = lines.map((line) => {
			if (line.trim().length === 0) return line;
			const indent = line.slice(0, minIndent);
			const rest = line.slice(minIndent);
			return `${indent}${commentToken} ${rest}`;
		});
	}

	const replacement = modified.join("\n");
	textarea.setRangeText(replacement, lineStart, lineEnd, "select");
	textarea.setSelectionRange(lineStart, lineStart + replacement.length);
}

// Evaluate programming challenges / quizzes
function evaluateChallenge(
	runner: HTMLElement,
	actualOutput: string,
	logsEl: HTMLElement,
	statusEl: HTMLElement | null,
): void {
	if (runner.getAttribute("data-challenge") !== "true") return;

	const expected = (runner.getAttribute("data-expected") || "").trim();
	const matchType = runner.getAttribute("data-match") || "exact";
	const actual = actualOutput.trim();

	let passed = false;

	if (matchType === "regex") {
		try {
			const rx = new RegExp(expected, "m");
			passed = rx.test(actual);
		} catch (_e) {
			passed = false;
		}
	} else if (matchType === "contains") {
		const targetLines = expected
			.split("\n")
			.map((l) => l.trim())
			.filter(Boolean);
		passed = targetLines.every((tl) => actual.includes(tl));
	} else {
		// exact match
		passed = actual === expected;
	}

	const challengeCard = document.createElement("div");
	if (passed) {
		challengeCard.className = "bk-challenge-card success";
		challengeCard.innerHTML = `
      <div class="bk-challenge-icon">🎉</div>
      <div class="bk-challenge-info">
        <div class="bk-challenge-title">Correct! Challenge Passed</div>
        <div class="bk-challenge-desc">Output matches expected criteria. Excellent work!</div>
      </div>
    `;
		if (statusEl) {
			statusEl.textContent = "Passed";
			statusEl.className = "bk-runner-status success";
		}
	} else {
		challengeCard.className = "bk-challenge-card error";
		challengeCard.innerHTML = `
      <div class="bk-challenge-header">
        <span class="bk-challenge-badge">Mismatch</span>
        <span>Output did not match expected goal</span>
      </div>
      <div class="bk-diff-grid">
        <div class="bk-diff-col">
          <span class="bk-diff-label">Expected:</span>
          <pre class="bk-diff-box">${escapeHtml(expected)}</pre>
        </div>
        <div class="bk-diff-col">
          <span class="bk-diff-label">Actual:</span>
          <pre class="bk-diff-box">${escapeHtml(actual || "(empty output)")}</pre>
        </div>
      </div>
    `;
		if (statusEl) {
			statusEl.textContent = "Mismatch";
			statusEl.className = "bk-runner-status error";
		}
	}

	logsEl.prepend(challengeCard);
}

// Main execution coordinator for a single runner block
async function executeRunnerBlock(runner: HTMLElement): Promise<void> {
	const mode = runner.getAttribute("data-mode") || "run";
	const isTwoStep = mode === "two-step";

	// If already running:
	if (activeExecutions.has(runner)) {
		// In two-step compile mode, ignore subsequent clicks while compiling
		// so accidental clicks/double-clicks don't abort compilation
		if (isTwoStep && !runner.__bk_binary_ready) {
			return;
		}

		// Double-click protection: prevent cancellation within 1000ms of launch
		const elapsed = Date.now() - (runner.__bk_exec_start || 0);
		if (elapsed < 1000) {
			return;
		}

		const exec = activeExecutions.get(runner);
		if (exec) {
			exec.abort();
			activeExecutions.delete(runner);
		}
		return;
	}

	runner.__bk_exec_start = Date.now();

	const lang = (runner.getAttribute("data-lang") || "javascript").toLowerCase();
	const textarea = runner.querySelector(
		".bk-runner-editor",
	) as HTMLTextAreaElement | null;
	const runBtn = runner.querySelector(
		".bk-run-btn",
	) as HTMLButtonElement | null;
	const outputEl = runner.querySelector(
		".bk-runner-output",
	) as HTMLElement | null;
	const logsEl = runner.querySelector(".bk-runner-logs") as HTMLElement | null;
	const statusEl = runner.querySelector(
		".bk-runner-status",
	) as HTMLElement | null;
	const durationEl = runner.querySelector(
		".bk-runner-duration",
	) as HTMLElement | null;

	if (!textarea || !runBtn || !outputEl || !logsEl) return;

	// If binary is compiled and ready in two-step mode: run binary immediately!
	if (isTwoStep && runner.__bk_binary_ready && runner.__bk_compiled_cache) {
		const cached = runner.__bk_compiled_cache;
		outputEl.style.display = "block";
		logsEl.innerHTML = "";

		const shellDiv = document.createElement("div");
		shellDiv.className = "bk-log-entry bk-log-cmd";
		shellDiv.textContent = "$ ./a.out";
		logsEl.appendChild(shellDiv);

		let actualOutput = "";
		for (const entry of cached.entries) {
			const div = document.createElement("div");
			div.className = `bk-log-entry bk-log-${entry.level}`;
			div.textContent = entry.text;
			logsEl.appendChild(div);
			if (entry.level === "info" || entry.level === "return") {
				actualOutput += (actualOutput ? "\n" : "") + entry.text;
			}
		}

		if (statusEl) {
			statusEl.textContent = "Done";
			statusEl.className = "bk-runner-status success";
		}
		if (durationEl) {
			durationEl.textContent = "(0.4ms) ⚡ Binary Executed";
		}

		evaluateChallenge(runner, actualOutput, logsEl, statusEl);
		return;
	}

	const code = runner.__bk_cm_view
		? runner.__bk_cm_view.state.doc.toString()
		: textarea.value;
	const timeout = parseInt(runner.getAttribute("data-timeout") || "3000", 10);
	const stdin = runner.getAttribute("data-stdin") || "";

	setRunButtonState(runBtn, true, runner);

	outputEl.style.display = "block";
	logsEl.innerHTML = "";
	if (statusEl) {
		statusEl.textContent = isTwoStep ? "Compiling..." : "Running...";
		statusEl.className = "bk-runner-status";
	}
	if (durationEl) durationEl.textContent = "";

	let entryCount = 0;
	const capturedEntries: Array<{ level: string; text: string }> = [];
	let capturedOutput = "";

	const appendLog = (entry: { level: string; text: string }) => {
		entryCount++;
		capturedEntries.push(entry);
		const div = document.createElement("div");
		div.className = `bk-log-entry bk-log-${entry.level}`;
		div.textContent = entry.text;
		logsEl.appendChild(div);
		logsEl.scrollTop = logsEl.scrollHeight;

		if (entry.level === "info" || entry.level === "return") {
			capturedOutput += (capturedOutput ? "\n" : "") + entry.text;
		}
	};

	let abortCallback: (() => void) | null = null;
	activeExecutions.set(runner, {
		abort: () => {
			if (abortCallback) abortCallback();
		},
	});

	const registerAbort = (fn: () => void) => {
		abortCallback = fn;
	};

	let result: { success: boolean; duration: number; error?: string };

	try {
		if (
			lang === "javascript" ||
			lang === "js" ||
			lang === "node" ||
			lang === "mjs"
		) {
			result = await runJavaScript(code, timeout, appendLog, registerAbort);
		} else if (lang === "typescript" || lang === "ts") {
			const stripped = stripTypeScript(code);
			result = await runJavaScript(stripped, timeout, appendLog, registerAbort);
		} else if (
			lang === "python" ||
			lang === "py" ||
			lang === "py3" ||
			lang === "python3"
		) {
			result = await runPython(code, timeout, appendLog, registerAbort);
		} else {
			result = await runCompiled(
				lang,
				code,
				stdin,
				timeout,
				appendLog,
				registerAbort,
			);
		}
	} catch (fatalErr: unknown) {
		const errObj = fatalErr as { message?: string };
		result = {
			success: false,
			duration: 0,
			error: errObj?.message || String(fatalErr),
		};
		appendLog({
			level: "error",
			text: errObj?.message || String(fatalErr),
		});
	} finally {
		activeExecutions.delete(runner);
	}

	// Two-step compilation flow handling
	if (isTwoStep) {
		if (result.success) {
			runner.__bk_binary_ready = true;
			runner.__bk_compiled_cache = {
				success: true,
				duration: result.duration,
				entries: capturedEntries.filter((e) => !e.text.startsWith("Compiling")),
			};

			logsEl.innerHTML = "";
			const okDiv = document.createElement("div");
			okDiv.className = "bk-log-entry bk-log-build-ok";
			okDiv.textContent = `✔ Compilation successful (${result.duration}ms). Machine binary is ready to run!`;
			logsEl.appendChild(okDiv);

			setRunButtonState(runBtn, false, runner);
			if (statusEl) {
				statusEl.textContent = "Binary Ready";
				statusEl.className = "bk-runner-status success";
			}
			if (durationEl) {
				durationEl.textContent = `(Build: ${result.duration}ms)`;
			}
			return;
		}

		setRunButtonState(runBtn, false, runner);
		if (statusEl) {
			statusEl.textContent = "Build Failed";
			statusEl.className = "bk-runner-status error";
		}
		return;
	}

	setRunButtonState(runBtn, false, runner);

	if (entryCount === 0) {
		const emptyDiv = document.createElement("div");
		emptyDiv.className = "bk-log-entry bk-log-empty";
		emptyDiv.textContent = "(Program exited with no output)";
		logsEl.appendChild(emptyDiv);
	}

	if (statusEl) {
		statusEl.textContent = result.success ? "Done" : "Error";
		statusEl.className = `bk-runner-status ${result.success ? "success" : "error"}`;
	}
	if (durationEl) {
		durationEl.textContent = `(${result.duration}ms)`;
	}

	evaluateChallenge(runner, capturedOutput, logsEl, statusEl);
}

// Initialize runners on page load
export function bkInitCodeRunners(): void {
	const runners = document.querySelectorAll<HTMLElement>(".bk-code-runner");

	runners.forEach((runner) => {
		const textarea = runner.querySelector(
			".bk-runner-editor",
		) as HTMLTextAreaElement | null;
		const highlightPre = runner.querySelector(
			".bk-runner-highlight",
		) as HTMLElement | null;
		const linesEl = runner.querySelector(
			".bk-runner-lines",
		) as HTMLElement | null;
		const runBtn = runner.querySelector(
			".bk-run-btn",
		) as HTMLButtonElement | null;
		const statusEl = runner.querySelector(
			".bk-runner-status",
		) as HTMLElement | null;

		if (!textarea) return;

		// Initial line numbers and auto-sizing
		updateLineNumbers(runner, textarea.value);
		autoSizeEditor(runner, textarea);
		syncScroll(textarea, highlightPre, linesEl);

		if (!runner.__bk_cm_view && typeof window !== "undefined") {
			try {
				const onCodeChange = () => {
					// Invalidate compiled binary if source code changes
					if (runner.__bk_binary_ready && runBtn) {
						delete runner.__bk_binary_ready;
						delete runner.__bk_compiled_cache;
						resetRunButtonLabel(runBtn, runner);
						if (statusEl) {
							statusEl.textContent = "Source modified";
							statusEl.className = "bk-runner-status";
						}
					}
				};

				const view = createCodeMirrorEditor(
					runner,
					textarea,
					onCodeChange,
					() => executeRunnerBlock(runner),
				);
				runner.__bk_cm_view = view;
			} catch (err) {
				console.warn(
					"[mr-md] CodeMirror initialization failed, fallback to native editor:",
					err,
				);
			}
		}

		if (!textarea.__bk_runner_wired) {
			textarea.__bk_runner_wired = true;

			let rafId: number | null = null;
			const onCodeChange = () => {
				// Invalidate compiled binary if source code changes
				if (runner.__bk_binary_ready && runBtn) {
					delete runner.__bk_binary_ready;
					delete runner.__bk_compiled_cache;
					resetRunButtonLabel(runBtn, runner);
					if (statusEl) {
						statusEl.textContent = "Source modified";
						statusEl.className = "bk-runner-status";
					}
				}

				if (rafId !== null) return;
				rafId = requestAnimationFrame(() => {
					rafId = null;
					updateLineNumbers(runner, textarea.value);
					updateHighlight(runner, textarea.value);
					autoSizeEditor(runner, textarea);
					syncScroll(textarea, highlightPre, linesEl);
				});
			};

			const autocomplete = new BkAutocomplete(textarea, runner, onCodeChange);
			textarea.__bk_autocomplete = autocomplete;

			textarea.addEventListener("input", () => {
				onCodeChange();
				autocomplete.handleInput();
			});

			textarea.addEventListener(
				"scroll",
				() => {
					syncScroll(textarea, highlightPre, linesEl);
					if (autocomplete.isOpen) {
						autocomplete.close();
					}
				},
				{ passive: true },
			);

			textarea.addEventListener("click", () => {
				if (autocomplete.isOpen) {
					autocomplete.close();
				}
			});

			textarea.addEventListener("blur", () => {
				setTimeout(() => {
					if (autocomplete.isOpen) {
						autocomplete.close();
					}
				}, 150);
			});

			textarea.addEventListener("keydown", (e: KeyboardEvent) => {
				// 0. Autocomplete keyboard interaction (ArrowUp, ArrowDown, Tab, Enter, Escape, PageUp, PageDown, Ctrl+Space)
				if (autocomplete.handleKeyDown(e)) {
					return;
				}

				const lang = (
					runner.getAttribute("data-lang") || "javascript"
				).toLowerCase();
				const start = textarea.selectionStart;
				const end = textarea.selectionEnd;
				const val = textarea.value;

				// 1. Skip over closing bracket/quote if already directly before it
				const closingChars = new Set([")", "]", "}", '"', "'", "`"]);
				if (start === end && closingChars.has(e.key) && val[start] === e.key) {
					if (
						(e.key === '"' || e.key === "'" || e.key === "`") &&
						start > 0 &&
						val[start - 1] === "\\"
					) {
						// escaped quote: allow typing
					} else {
						e.preventDefault();
						textarea.setSelectionRange(start + 1, start + 1);
						return;
					}
				}

				// 2. Cmd + / or Ctrl + / to Toggle Comments
				if ((e.metaKey || e.ctrlKey) && e.key === "/") {
					e.preventDefault();
					toggleLineComments(textarea, runner);
					onCodeChange();
					return;
				}

				// 2. Tab / Shift+Tab Indentation
				if (e.key === "Tab") {
					e.preventDefault();

					// Multi-line selection indent/unindent
					if (start !== end && val.slice(start, end).includes("\n")) {
						const lineStart = val.lastIndexOf("\n", start - 1) + 1;
						let lineEnd = val.indexOf("\n", end);
						if (lineEnd === -1) lineEnd = val.length;
						const lines = val.slice(lineStart, lineEnd).split("\n");

						let newStart = start;
						let newEnd = end;

						let modified: string[];
						if (e.shiftKey) {
							let removedFirst = 0;
							let totalRemoved = 0;
							modified = lines.map((l, i) => {
								const match = l.match(/^ {1,2}/);
								const count = match ? match[0].length : 0;
								if (i === 0) removedFirst = count;
								totalRemoved += count;
								return l.slice(count);
							});
							newStart = Math.max(lineStart, start - removedFirst);
							newEnd = Math.max(newStart, end - totalRemoved);
						} else {
							modified = lines.map((l) => `  ${l}`);
							newStart = start + 2;
							newEnd = end + lines.length * 2;
						}

						textarea.setRangeText(
							modified.join("\n"),
							lineStart,
							lineEnd,
							"select",
						);
						textarea.setSelectionRange(newStart, newEnd);
						onCodeChange();
					} else {
						// Single line indent or unindent
						if (e.shiftKey) {
							const lineStart = val.lastIndexOf("\n", start - 1) + 1;
							const match = val.slice(lineStart, start).match(/^ {1,2}/);
							if (match) {
								const count = match[0].length;
								textarea.setRangeText("", lineStart, lineStart + count, "end");
								textarea.setSelectionRange(
									Math.max(lineStart, start - count),
									Math.max(lineStart, start - count),
								);
								onCodeChange();
							}
						} else {
							// Preserve native undo history via execCommand when available
							if (document.queryCommandSupported?.("insertText")) {
								document.execCommand("insertText", false, "  ");
							} else {
								textarea.setRangeText("  ", start, end, "end");
								onCodeChange();
							}
						}
					}
					return;
				}

				// 3. Ctrl+Enter or Cmd+Enter to Run
				if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
					e.preventDefault();
					executeRunnerBlock(runner);
					return;
				}

				// 4. Smart Enter with Auto-Indentation & Bracket Expansion
				if (e.key === "Enter") {
					// 4a. If between matching brackets {}, [], or (), expand on newline with indent
					if (
						start === end &&
						start > 0 &&
						((val[start - 1] === "{" && val[start] === "}") ||
							(val[start - 1] === "[" && val[start] === "]") ||
							(val[start - 1] === "(" && val[start] === ")"))
					) {
						e.preventDefault();
						const lineStart = val.lastIndexOf("\n", start - 1) + 1;
						const currentLine = val.slice(lineStart, start);
						const indentMatch = currentLine.match(/^[ \t]*/);
						const baseIndent = indentMatch ? indentMatch[0] : "";
						const extraIndent =
							lang.includes("python") || lang.includes("py") ? "    " : "  ";
						const innerIndent = baseIndent + extraIndent;
						const replacement = `\n${innerIndent}\n${baseIndent}`;

						if (document.queryCommandSupported?.("insertText")) {
							document.execCommand("insertText", false, replacement);
						} else {
							textarea.setRangeText(replacement, start, end, "end");
						}
						const targetPos = start + 1 + innerIndent.length;
						textarea.setSelectionRange(targetPos, targetPos);
						onCodeChange();
						return;
					}

					// 4b. Normal line auto-indent
					const lineStart = val.lastIndexOf("\n", start - 1) + 1;
					const currentLine = val.slice(lineStart, start);
					const indentMatch = currentLine.match(/^[ \t]*/);
					let indent = indentMatch ? indentMatch[0] : "";
					const trimmed = currentLine.trimEnd();

					if (
						trimmed.endsWith("{") ||
						trimmed.endsWith(":") ||
						trimmed.endsWith("[") ||
						trimmed.endsWith("(")
					) {
						indent +=
							lang.includes("python") || lang.includes("py") ? "    " : "  ";
					}

					if (indent.length > 0) {
						e.preventDefault();
						if (document.queryCommandSupported?.("insertText")) {
							document.execCommand("insertText", false, `\n${indent}`);
						} else {
							textarea.setRangeText(`\n${indent}`, start, end, "end");
						}
						onCodeChange();
						return;
					}
				}

				// 5. Bracket & Quote Pairs (Auto-close & Wrapping)
				const pairs: Record<string, string> = {
					"(": ")",
					"[": "]",
					"{": "}",
					'"': '"',
					"'": "'",
					"`": "`",
				};

				// 5a. Wrap selection when text is selected (supports both opening and closing brackets)
				const closingToOpening: Record<string, string> = {
					")": "(",
					"]": "[",
					"}": "{",
				};
				if ((pairs[e.key] || closingToOpening[e.key]) && start !== end) {
					e.preventDefault();
					const openChar = closingToOpening[e.key] || e.key;
					const closeChar = pairs[openChar];
					const selected = val.slice(start, end);
					const wrapped = `${openChar}${selected}${closeChar}`;
					if (document.queryCommandSupported?.("insertText")) {
						document.execCommand("insertText", false, wrapped);
					} else {
						textarea.setRangeText(wrapped, start, end, "select");
					}
					textarea.setSelectionRange(start + 1, end + 1);
					onCodeChange();
					return;
				}

				// 5b. Auto-close opening brackets when typing without selection
				if (
					(e.key === "(" || e.key === "[" || e.key === "{") &&
					start === end
				) {
					e.preventDefault();
					const pairText = e.key + pairs[e.key];
					if (document.queryCommandSupported?.("insertText")) {
						document.execCommand("insertText", false, pairText);
					} else {
						textarea.setRangeText(pairText, start, end, "end");
					}
					textarea.setSelectionRange(start + 1, start + 1);
					onCodeChange();
					return;
				}

				// 5c. Auto-close quotes when typing without selection (skip if inside string or adjacent to word chars)
				if (
					(e.key === '"' || e.key === "'" || e.key === "`") &&
					start === end
				) {
					const prevChar = start > 0 ? val[start - 1] : "";
					const nextChar = start < val.length ? val[start] : "";

					if (
						!isInsideStringOrComment(val, start, lang) &&
						!/\w/.test(prevChar) &&
						!/\w/.test(nextChar)
					) {
						e.preventDefault();
						const pairText = e.key + e.key;
						if (document.queryCommandSupported?.("insertText")) {
							document.execCommand("insertText", false, pairText);
						} else {
							textarea.setRangeText(pairText, start, end, "end");
						}
						textarea.setSelectionRange(start + 1, start + 1);
						onCodeChange();
						return;
					}
				}

				// 6. Backspace between matching pairs (deletes both)
				if (e.key === "Backspace" && start === end && start > 0) {
					const prev = val[start - 1];
					const next = val[start];
					if (
						(prev === "(" && next === ")") ||
						(prev === "[" && next === "]") ||
						(prev === "{" && next === "}") ||
						(prev === '"' && next === '"') ||
						(prev === "'" && next === "'") ||
						(prev === "`" && next === "`")
					) {
						e.preventDefault();
						textarea.setRangeText("", start - 1, start + 1, "end");
						textarea.setSelectionRange(start - 1, start - 1);
						onCodeChange();
						return;
					}
				}
			});
		}

		if (
			runner.getAttribute("data-autorun") === "true" &&
			!runner.__bk_autorun_done
		) {
			runner.__bk_autorun_done = true;
			executeRunnerBlock(runner);
		}
	});
}

// Wire global click events
export function bkWireCodeRunners(): void {
	document.addEventListener("click", async (e: MouseEvent) => {
		const target = e.target as HTMLElement | null;
		if (!target) return;

		// 1. Run / Compile / Stop / Check Answer button
		const runBtn = target.closest(".bk-run-btn") as HTMLButtonElement | null;
		if (runBtn) {
			const runner = runBtn.closest(".bk-code-runner") as HTMLElement | null;
			if (runner) {
				executeRunnerBlock(runner);
				return;
			}
		}

		// 2. Hint toggle button
		const hintBtn = target.closest(".bk-hint-btn") as HTMLButtonElement | null;
		if (hintBtn) {
			const runner = hintBtn.closest(".bk-code-runner") as HTMLElement | null;
			if (runner) {
				const hintEl = runner.querySelector(
					".bk-runner-hint",
				) as HTMLElement | null;
				if (hintEl) {
					const isHidden = hintEl.style.display === "none";
					hintEl.style.display = isHidden ? "block" : "none";
					hintBtn.classList.toggle("active", isHidden);
				}
				return;
			}
		}

		// 3. Reset button
		const resetBtn = target.closest(
			".bk-reset-btn",
		) as HTMLButtonElement | null;
		if (resetBtn) {
			const runner = resetBtn.closest(".bk-code-runner") as HTMLElement | null;
			if (runner) {
				const textarea = runner.querySelector(
					".bk-runner-editor",
				) as HTMLTextAreaElement | null;
				const highlightPre = runner.querySelector(
					".bk-runner-highlight",
				) as HTMLElement | null;
				const linesEl = runner.querySelector(
					".bk-runner-lines",
				) as HTMLElement | null;
				const initialCode = runner.getAttribute("data-initial-code") || "";
				if (runner.__bk_cm_view) {
					runner.__bk_cm_view.dispatch({
						changes: {
							from: 0,
							to: runner.__bk_cm_view.state.doc.length,
							insert: initialCode,
						},
					});
				}
				if (textarea) {
					textarea.value = initialCode;
					textarea.__bk_autocomplete?.close?.();
					delete runner.__bk_binary_ready;
					delete runner.__bk_compiled_cache;
					const currentRunBtn = runner.querySelector(
						".bk-run-btn",
					) as HTMLButtonElement | null;
					if (currentRunBtn) resetRunButtonLabel(currentRunBtn, runner);
					updateLineNumbers(runner, initialCode);
					updateHighlight(runner, initialCode);
					autoSizeEditor(runner, textarea);
					syncScroll(textarea, highlightPre, linesEl);
				}
				return;
			}
		}

		// 4. Clear button
		const clearBtn = target.closest(
			".bk-clear-btn",
		) as HTMLButtonElement | null;
		if (clearBtn) {
			const runner = clearBtn.closest(".bk-code-runner") as HTMLElement | null;
			if (runner) {
				const logsEl = runner.querySelector(".bk-runner-logs");
				if (logsEl) logsEl.innerHTML = "";
				const statusEl = runner.querySelector(".bk-runner-status");
				if (statusEl) statusEl.textContent = "";
				const durationEl = runner.querySelector(".bk-runner-duration");
				if (durationEl) durationEl.textContent = "";
				const outputEl = runner.querySelector(
					".bk-runner-output",
				) as HTMLElement | null;
				if (outputEl) outputEl.style.display = "none";
				return;
			}
		}

		// 5. Copy button
		const copyBtn = target.closest(
			".bk-runner-header .bk-copy-btn",
		) as HTMLButtonElement | null;
		if (copyBtn) {
			const runner = copyBtn.closest(".bk-code-runner") as HTMLElement | null;
			if (runner) {
				const textarea = runner.querySelector(
					".bk-runner-editor",
				) as HTMLTextAreaElement | null;
				const codeToCopy = runner.__bk_cm_view
					? runner.__bk_cm_view.state.doc.toString()
					: textarea?.value || "";
				if (codeToCopy) {
					try {
						await navigator.clipboard.writeText(codeToCopy);
						copyBtn.classList.add("copied");
						setTimeout(() => copyBtn.classList.remove("copied"), 1500);
					} catch (_err) {
						// Clipboard write failed
					}
				}
				return;
			}
		}
	});
}
