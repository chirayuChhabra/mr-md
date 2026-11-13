import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import {
	bkCollapseLab,
	bkExpandLab,
	bkResetLab,
	bkResumeSimulationIfPaused,
	bkSetLabPlayback,
	bkWireWorkspace,
	isTextEditable,
} from "../src/client/workspace.js";
import { bkWireSimControls } from "../src/client/simulation.js";

function fixture(run: (document: Document, messages: unknown[]) => void) {
	const dom = new JSDOM(
		`<body><header id="navigation"><button>Lesson</button></header><main><p id="already-inert" inert>Hidden</p><figure id="sim-0" class="bk-object"><div class="bk-object-header"><span class="bk-object-title">Orbit</span><div class="bk-object-actions"><button class="bk-object-maximize" data-bk-lab-entry>Open lab</button></div></div><div class="bk-sim-workspace"><div class="bk-sim-stage"><div class="bk-sim-preview"><button data-bk-expand-preview>Expand</button><iframe></iframe></div></div><div class="bk-sim-controls" data-bk-default-props='{"speed":1,"enabled":true}'><input data-bk-prop="label" type="text" value="Orbit"><input data-bk-prop="speed" type="range" min="0" max="5" value="3"><input data-bk-prop="enabled" type="checkbox"></div></div></figure><figure id="sim-1" class="bk-object"><div class="bk-sim-workspace"><div class="bk-sim-stage"><div class="bk-sim-preview"><iframe></iframe></div></div></div></figure></main></body>`,
		{ pretendToBeVisual: true },
	);
	const style = dom.window.document.createElement("style");
	const css = readFileSync(new URL("../src/styles/theme.css", import.meta.url), "utf8");
	style.textContent = css.slice(css.indexOf(".bk-sim-pause-overlay[hidden]"), css.indexOf("@media (prefers-reduced-motion: reduce) { .bk-sim-scroll-cue"));
	dom.window.document.head.append(style);
	const names = [
		"window",
		"document",
		"HTMLElement",
		"Element",
		"Node",
		"CustomEvent",
	];
	const previous = new Map(
		names.map((name) => [name, (globalThis as any)[name]]),
	);
	for (const name of names)
		(globalThis as any)[name] = (dom.window as any)[name];
	dom.window.scrollTo = () => {};
	const messages: unknown[] = [];
	for (const iframe of dom.window.document.querySelectorAll("iframe"))
		iframe.contentWindow!.postMessage = (message) => {
			messages.push(message);
		};
	try {
		run(dom.window.document, messages);
	} finally {
		bkCollapseLab();
		for (const [name, value] of previous) (globalThis as any)[name] = value;
		dom.window.close();
	}
}

describe("expanded simulation workspace", () => {
	test("isolates the lesson and restores pre-existing attributes and overflow", () =>
		fixture((document) => {
			const figure = document.getElementById("sim-0")!;
			const oldInert = document.getElementById("already-inert") as HTMLElement;
			oldInert.inert = true;
			figure.setAttribute("role", "group");
			document.body.style.overflow = "clip";
			bkExpandLab(figure);
			expect(figure.getAttribute("role")).toBe("dialog");
			expect(figure.getAttribute("aria-modal")).toBe("false");
			expect((document.getElementById("navigation") as HTMLElement).inert).toBe(
				true,
			);
			expect((document.getElementById("sim-1") as HTMLElement).inert).toBe(
				true,
			);
			bkCollapseLab();
			expect(figure.getAttribute("role")).toBe("group");
			expect(figure.hasAttribute("aria-modal")).toBe(false);
			expect(
				(document.getElementById("navigation") as HTMLElement).inert,
			).toBeFalsy();
			expect(oldInert.inert).toBe(true);
			expect(document.body.style.overflow).toBe("clip");
		}));

	test("pause leaves the scene interactive and survives close and reopen", () =>
		fixture((document, messages) => {
			const figure = document.getElementById("sim-0")!;
			bkExpandLab(figure);
			bkSetLabPlayback(figure, false);
			expect(
				figure
					.querySelector(".bk-sim-preview")!
					.classList.contains("is-interactive"),
			).toBe(true);
			expect(figure.querySelector("[data-bk-playback]")!.textContent).toBe(
				"Play",
			);
			expect(messages).toContainEqual({ type: "bk:pause" });
			bkCollapseLab();
			messages.length = 0;
			bkExpandLab(figure);
			expect(messages).not.toContainEqual({ type: "bk:play" });
		}));

	test("custom reset restores controls and publishes deterministic defaults and playback", () =>
		fixture((document, messages) => {
			const figure = document.getElementById("sim-0")!;
			figure.dataset.bkResetHandler = "true";
			let resetId: string | undefined;
			document.addEventListener("bk:simulation-reset", (event) => {
				resetId = (event as CustomEvent).detail.id;
			});
			bkExpandLab(figure);
			bkSetLabPlayback(figure, false);
			bkResetLab(figure);
			expect(
				(figure.querySelector('[data-bk-prop="speed"]') as HTMLInputElement)
					.value,
			).toBe("1");
			expect(
				(figure.querySelector('[data-bk-prop="enabled"]') as HTMLInputElement)
					.checked,
			).toBe(true);
			expect(resetId).toBe("sim-0");
			expect(messages).toContainEqual({
				type: "bk:reset",
				props: { speed: 1, enabled: true },
				playing: false,
			});
		}));

	test("observe simulations reset from config defaults without generated controls", () =>
		fixture((document, messages) => {
			const figure = document.getElementById("sim-0")!;
			figure.querySelector(".bk-sim-controls")!.remove();
			const config = document.createElement("script");
			config.className = "bk-sim-config";
			config.type = "application/json";
			config.textContent = JSON.stringify({ props: { hiddenInitialMass: 42 } });
			figure.append(config);
			figure.dataset.bkResetHandler = "true";
			bkExpandLab(figure);
			bkResetLab(figure);
			expect(messages).toContainEqual({
				type: "bk:reset",
				props: { hiddenInitialMass: 42 },
				playing: true,
			});
		}));

	test("switching labs pauses the old iframe and transfers background isolation", () =>
		fixture((document, messages) => {
			const first = document.getElementById("sim-0")!;
			const second = document.getElementById("sim-1")!;
			bkExpandLab(first);
			messages.length = 0;
			bkExpandLab(second);
			expect(first.classList.contains("bk-object--maximized")).toBe(false);
			expect(first.inert).toBe(true);
			expect(second.inert).toBeFalsy();
			expect(second.getAttribute("aria-modal")).toBe("false");
			expect(messages).toContainEqual({ type: "bk:pause" });
		}));

	test("only the active iframe may close the workspace", () =>
		fixture((document) => {
			bkWireWorkspace();
			const figure = document.getElementById("sim-0")!;
			bkExpandLab(figure);
			window.dispatchEvent(
				new window.MessageEvent("message", {
					source: document.querySelectorAll("iframe")[1]!.contentWindow,
					data: { type: "bk:workspace-close" },
				}),
			);
			expect(figure.classList.contains("bk-object--maximized")).toBe(true);
			window.dispatchEvent(
				new window.MessageEvent("message", {
					source: figure.querySelector("iframe")!.contentWindow,
					data: { type: "bk:workspace-close" },
				}),
			);
			expect(figure.classList.contains("bk-object--maximized")).toBe(false);
		}));
 test("fullscreen Space works from transport focus and shows a resumable paused overlay", () =>
  fixture((document) => {
   bkWireWorkspace();
   const figure=document.getElementById("sim-0")!;
   bkExpandLab(figure);
   const button=figure.querySelector<HTMLButtonElement>("[data-bk-playback]")!;
   button.focus();
   const key=new window.KeyboardEvent("keydown", {key:" ",bubbles:true,cancelable:true});
   button.dispatchEvent(key);
   expect(key.defaultPrevented).toBe(true);
   expect(figure.dataset.bkPlaybackState).toBe("paused");
   expect(figure.querySelector<HTMLElement>(".bk-sim-pause-overlay")?.hidden).toBe(false);
   button.dispatchEvent(new window.KeyboardEvent("keydown", {key:" ",repeat:true,bubbles:true,cancelable:true}));
   expect(figure.dataset.bkPlaybackState).toBe("paused");
   figure.querySelector<HTMLButtonElement>("[data-bk-playback]")!.click();
   expect(figure.dataset.bkPlaybackState).toBe("playing");
   expect(figure.querySelector<HTMLElement>(".bk-sim-pause-overlay")?.hidden).toBe(true);
  }));

	test("iframe shortcuts require the active frame and preserve editable text inputs", () =>
		fixture((document) => {
			bkWireWorkspace();
			const figure = document.getElementById("sim-0")!;
			bkExpandLab(figure);
			const textInput = figure.querySelector<HTMLInputElement>('input[type="text"]')!;
			textInput.focus();
			const textKey = new window.KeyboardEvent("keydown", {
				key: " ",
				bubbles: true,
				cancelable: true,
			});
			textInput.dispatchEvent(textKey);
			expect(textKey.defaultPrevented).toBe(false);
			expect(figure.dataset.bkPlaybackState).not.toBe("paused");
			window.dispatchEvent(
				new window.MessageEvent("message", {
					source: document.querySelectorAll("iframe")[1]!.contentWindow,
					data: { type: "bk:workspace-keydown", key: " " },
				}),
			);
			expect(figure.dataset.bkPlaybackState).not.toBe("paused");
			window.dispatchEvent(
				new window.MessageEvent("message", {
					source: figure.querySelector("iframe")!.contentWindow,
					data: { type: "bk:workspace-keydown", key: " " },
				}),
			);
			expect(figure.dataset.bkPlaybackState).toBe("paused");
		}));

	test("Space toggles playback when focus is on host controls (range slider, checkbox, buttons)", () =>
		fixture((document) => {
			bkWireWorkspace();
			const figure = document.getElementById("sim-0")!;
			bkExpandLab(figure);
			expect(figure.dataset.bkPlaybackState).not.toBe("paused");

			// Focus on range slider
			const range = figure.querySelector<HTMLInputElement>('input[type="range"]')!;
			range.focus();
			const spaceOnSlider = new window.KeyboardEvent("keydown", {
				key: " ",
				bubbles: true,
				cancelable: true,
			});
			range.dispatchEvent(spaceOnSlider);
			expect(spaceOnSlider.defaultPrevented).toBe(true);
			expect(figure.dataset.bkPlaybackState).toBe("paused");
			expect(figure.querySelector<HTMLElement>(".bk-sim-pause-overlay")?.hidden).toBe(false);

			// Press Space again on slider to resume
			const spaceOnSlider2 = new window.KeyboardEvent("keydown", {
				key: " ",
				bubbles: true,
				cancelable: true,
			});
			range.dispatchEvent(spaceOnSlider2);
			expect(spaceOnSlider2.defaultPrevented).toBe(true);
			expect(figure.dataset.bkPlaybackState).toBe("playing");
			expect(figure.querySelector<HTMLElement>(".bk-sim-pause-overlay")?.hidden).toBe(true);

			// Focus on checkbox
			const checkbox = figure.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
			checkbox.focus();
			const spaceOnCheckbox = new window.KeyboardEvent("keydown", {
				key: " ",
				bubbles: true,
				cancelable: true,
			});
			checkbox.dispatchEvent(spaceOnCheckbox);
			expect(spaceOnCheckbox.defaultPrevented).toBe(true);
			expect(figure.dataset.bkPlaybackState).toBe("paused");
		}));

	test("changing simulation controls while paused resumes playback consistently", () =>
		fixture((document, messages) => {
			bkWireWorkspace();
			bkWireSimControls();
			const figure = document.getElementById("sim-0")!;
			bkExpandLab(figure);

			// Pause playback
			bkSetLabPlayback(figure, false);
			expect(figure.dataset.bkPlaybackState).toBe("paused");
			expect(figure.querySelector<HTMLElement>(".bk-sim-pause-overlay")?.hidden).toBe(false);

			// Changing range slider while paused resumes playback
			const range = figure.querySelector<HTMLInputElement>('input[type="range"]')!;
			range.value = "4";
			range.dispatchEvent(new window.Event("input", { bubbles: true }));

			expect(figure.dataset.bkPlaybackState).toBe("playing");
			expect(figure.querySelector<HTMLElement>(".bk-sim-pause-overlay")?.hidden).toBe(true);
			expect(figure.querySelector("[data-bk-playback]")!.textContent).toBe("Pause");
			expect(messages).toContainEqual({ type: "bk:play" });
		}));

	test("isTextEditable correctly identifies typing inputs vs host controls", () =>
		fixture((document) => {
			const text = document.createElement("input");
			text.type = "text";
			expect(isTextEditable(text)).toBe(true);

			const search = document.createElement("input");
			search.type = "search";
			expect(isTextEditable(search)).toBe(true);

			const textarea = document.createElement("textarea");
			expect(isTextEditable(textarea)).toBe(true);

			const contentEditable = document.createElement("div");
			contentEditable.setAttribute("contenteditable", "true");
			expect(isTextEditable(contentEditable)).toBe(true);

			const range = document.createElement("input");
			range.type = "range";
			expect(isTextEditable(range)).toBe(false);

			const numberInput = document.createElement("input");
			numberInput.type = "number";
			expect(isTextEditable(numberInput)).toBe(false);

			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			expect(isTextEditable(checkbox)).toBe(false);

			const select = document.createElement("select");
			expect(isTextEditable(select)).toBe(false);

			const button = document.createElement("button");
			expect(isTextEditable(button)).toBe(false);
		}));

	test("paused status stays beside playback without covering the scene", () =>
		fixture((document) => {
			bkWireWorkspace();
			const figure = document.getElementById("sim-0")!;
			bkExpandLab(figure);
			bkSetLabPlayback(figure, false);

			const overlay = figure.querySelector<HTMLElement>(".bk-sim-pause-overlay")!;
			expect(overlay).not.toBeNull();
			expect(overlay.hidden).toBe(false);
			expect(window.getComputedStyle(overlay).position).toBe("static");
			expect(overlay.closest(".bk-steps-controls")).not.toBeNull();
			expect(overlay.querySelector('[role="status"]')?.textContent).toBe("Paused");
			expect(overlay.querySelector("button")).toBeNull();
			figure.querySelector<HTMLButtonElement>("[data-bk-playback]")!.click();
			expect(figure.dataset.bkPlaybackState).toBe("playing");
			expect(overlay.hidden).toBe(true);
			expect(window.getComputedStyle(overlay).display).toBe("none");
		}));

	test("normal and fullscreen pause/resume lifecycle maintains correct overlay visibility and playback state", () =>
		fixture((document, messages) => {
			bkWireWorkspace();
			const figure = document.getElementById("sim-0")!;

			// 1. In normal inline view (not maximized), pause overlay is always hidden
			bkSetLabPlayback(figure, false);
			const overlay = figure.querySelector<HTMLElement>(".bk-sim-pause-overlay");
			if (overlay) {
				expect(overlay.hidden).toBe(true);
			}

			// 2. Expand lab workspace
			bkExpandLab(figure);
			expect(figure.classList.contains("bk-object--maximized")).toBe(true);
			const expandedOverlay = figure.querySelector<HTMLElement>(".bk-sim-pause-overlay")!;
			expect(expandedOverlay.hidden).toBe(false);

			// 3. Resume via resume button
			const resumeBtn = figure.querySelector<HTMLButtonElement>("[data-bk-playback]")!;
			resumeBtn.click();
			expect(figure.dataset.bkPlaybackState).toBe("playing");
			expect(expandedOverlay.hidden).toBe(true);
			expect(messages).toContainEqual({ type: "bk:play" });

			// 4. Pause again
			bkSetLabPlayback(figure, false);
			expect(figure.dataset.bkPlaybackState).toBe("paused");
			expect(expandedOverlay.hidden).toBe(false);

			// 5. Collapse back to normal inline layout
			bkCollapseLab();
			expect(figure.classList.contains("bk-object--maximized")).toBe(false);
			expect(expandedOverlay.hidden).toBe(true);

			// 6. Re-expand: preserved paused state is maintained and overlay is visible again
			messages.length = 0;
			bkExpandLab(figure);
			expect(messages).not.toContainEqual({ type: "bk:play" });
			expect(figure.dataset.bkPlaybackState).toBe("paused");
			expect(expandedOverlay.hidden).toBe(false);
		}));
});
