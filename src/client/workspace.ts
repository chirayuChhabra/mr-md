import { PAUSE_ICON, PLAY_ICON, RESET_ICON } from "../simulation-toolbar.js";
import { bkApplyPropsToControls } from "./simulation.js";

export interface LabExpansionOptions {
	focusReturn?: HTMLElement;
	defaultTab?: "controls" | "telemetry";
}

const EXPAND_ICON =
	'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';

let savedScrollY: number | null = null;
let savedFocusEl: HTMLElement | null = null;
let activeExpandedSimId: string | null = null;

let wiredDocument: Document | null = null;
let savedOverflow: string | null = null;
let stateDocument: Document | null = null;
let topbarPlaceholder: Comment | null = null;

function restoreHeader(): void {
	const topbar = document.getElementById("bk-topbar");
	document.getElementById("bk-lab-exit-topbar-btn")?.remove();
	document.querySelectorAll(".bk-lab-crumb").forEach((el) => {
		el.remove();
	});
	if (topbar && topbarPlaceholder) topbarPlaceholder.replaceWith(topbar);
	topbarPlaceholder = null;
}

const inertElements = new Map<HTMLElement, boolean>();
const modalAttributes = new Map<Element, Map<string, string | null>>();

function restoreBackground(): void {
	for (const [element, wasInert] of inertElements) element.inert = wasInert;
	inertElements.clear();
}

function isolateWorkspace(figure: HTMLElement): void {
	restoreBackground();
	let branch: Element = figure;
	while (branch.parentElement) {
		for (const sibling of branch.parentElement.children) {
			if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
			inertElements.set(sibling, sibling.inert);
			sibling.inert = true;
		}
		branch = branch.parentElement;
		if (branch === document.body) break;
	}
	if (!modalAttributes.has(figure)) {
		modalAttributes.set(
			figure,
			new Map(
				["role", "aria-modal", "aria-label", "tabindex"].map((name) => [
					name,
					figure.getAttribute?.(name) ?? null,
				]),
			),
		);
	}
	figure.setAttribute?.("role", "dialog");
	figure.setAttribute?.("aria-modal", "true");
	figure.setAttribute?.(
		"aria-label",
		figure.querySelector(".bk-object-title")?.textContent?.trim() ||
			"Simulation workspace",
	);
	figure.setAttribute?.("tabindex", "-1");
}

function restoreModal(figure: Element): void {
	for (const [name, value] of modalAttributes.get(figure) || []) {
		if (value === null) figure.removeAttribute?.(name);
		else figure.setAttribute?.(name, value);
	}
	modalAttributes.delete(figure);
}

function focusableElements(figure: Element): HTMLElement[] {
	return Array.from(
		figure.querySelectorAll<HTMLElement>(
			"button, a[href], input, select, textarea, iframe, [tabindex]",
		),
	).filter(
		(el) =>
			el.tabIndex >= 0 &&
			!el.hasAttribute("disabled") &&
			!el.closest("[hidden], [inert]") &&
			el.getClientRects().length > 0 &&
			getComputedStyle(el).visibility !== "hidden",
	);
}

function focusWithin(figure: Element, last = false): void {
	const elements = focusableElements(figure);
	(elements[last ? elements.length - 1 : 0] || (figure as HTMLElement)).focus?.(
		{ preventScroll: true },
	);
}

function postPlayback(figure: Element, playing: boolean): void {
	figure
		.querySelector<HTMLIFrameElement>(".bk-sim-preview iframe")
		?.contentWindow?.postMessage(
			{ type: playing ? "bk:play" : "bk:pause" },
			"*",
		);
}

export function bkSyncLabPauseOverlay(figure: HTMLElement): void {
	const preview = figure.querySelector<HTMLElement>(".bk-sim-preview");
	if (!preview) return;
	let overlay = preview.querySelector<HTMLElement>(".bk-sim-pause-overlay");
	if (!overlay) {
		overlay = document.createElement("div");
		overlay.className = "bk-sim-pause-overlay";
		overlay.hidden = true;
		overlay.innerHTML = `<div class="bk-sim-pause-content"><span class="bk-sim-pause-title" role="status">Simulation paused</span><button type="button" data-bk-resume aria-label="Resume simulation">${PLAY_ICON.replace(' style="display:none;"', "")}<span>Resume</span></button><span class="bk-sim-pause-hint">Press Space to resume</span></div>`;
		preview.append(overlay);
	}
	overlay.hidden =
		!figure.classList.contains("bk-object--maximized") ||
		figure.dataset.bkPlaybackState !== "paused";
	if (overlay.hidden && overlay.contains(document.activeElement)) {
		figure
			.querySelector<HTMLElement>("[data-bk-playback], .bk-steps-btn--play")
			?.focus();
	}
	figure
		.querySelector(".bk-steps-btn--play")
		?.setAttribute("aria-keyshortcuts", "Space");
	figure
		.querySelector(".bk-steps-btn--reset")
		?.setAttribute("aria-keyshortcuts", "R");
	figure
		.querySelector(".bk-steps-btn--prev")
		?.setAttribute("aria-keyshortcuts", "ArrowLeft");
	figure
		.querySelector(".bk-steps-btn--next")
		?.setAttribute("aria-keyshortcuts", "ArrowRight");
}

export function isTextEditable(target: Element | null): boolean {
	if (!target) return false;
	const el = target.closest(
		"input, textarea, [contenteditable], [role='textbox'], [role='searchbox']",
	);
	if (!el) return false;
	const anyEl = el as any;
	if (el.tagName === "TEXTAREA") {
		return !anyEl.readOnly && !anyEl.disabled;
	}
	if (el.tagName === "INPUT") {
		if (anyEl.readOnly || anyEl.disabled) return false;
		const type = (anyEl.type || "text").toLowerCase();
		return ["text", "search", "url", "tel", "email", "password"].includes(type);
	}
	if (
		anyEl.isContentEditable ||
		el.getAttribute?.("contenteditable") === "true" ||
		el.getAttribute?.("contenteditable") === ""
	) {
		return true;
	}
	const role = el.getAttribute?.("role");
	return role === "textbox" || role === "searchbox";
}

function editableShortcutTarget(target: Element | null): boolean {
	return Boolean(
		target?.closest(
			'input, select, textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="slider"], [role="combobox"]',
		),
	);
}

export function bkResumeSimulationIfPaused(figure: HTMLElement): void {
	if (!figure) return;
	const isSteps = figure.classList.contains("bk-steps-object");
	if (isSteps) {
		const playBtn = figure.querySelector<HTMLButtonElement>(
			".bk-steps-btn--play",
		);
		const isPaused =
			figure.dataset.bkPlaybackState === "paused" ||
			Boolean(playBtn && !playBtn.classList.contains("is-active"));
		if (isPaused) {
			if (playBtn && !playBtn.classList.contains("is-active")) {
				playBtn.click();
			} else {
				bkSetLabPlayback(figure, true);
				figure.dispatchEvent(
					new CustomEvent("bk:steps-activate", { bubbles: true }),
				);
			}
		}
	} else {
		if (figure.dataset.bkPlaybackState === "paused") {
			bkSetLabPlayback(figure, true);
		}
	}
}

function handleWorkspaceShortcut(figure: HTMLElement, key: string): boolean {
	const isSteps = figure.classList.contains("bk-steps-object");
	let selector: string | undefined;
	if (key === " " || key === "Space" || key === "Spacebar") {
		if (!isSteps) {
			if (figure.classList.contains("bk-object--maximized")) {
				bkSetLabPlayback(figure, figure.dataset.bkPlaybackState === "paused");
			}
		} else {
			selector = ".bk-steps-btn--play";
		}
	} else if (key.toLowerCase() === "r") {
		if (!isSteps) {
			if (figure.classList.contains("bk-object--maximized")) {
				bkResetLab(figure);
			}
		} else {
			selector = ".bk-steps-btn--reset";
		}
	} else if (isSteps && (key === "ArrowLeft" || key === "ArrowRight")) {
		selector =
			key === "ArrowLeft" ? ".bk-steps-btn--prev" : ".bk-steps-btn--next";
	} else return false;
	if (selector) figure.querySelector<HTMLButtonElement>(selector)?.click();
	return true;
}

function updatePlaybackButton(figure: HTMLElement): void {
	const button = figure.querySelector<HTMLButtonElement>("[data-bk-playback]");
	if (button) {
		const playing = figure.dataset.bkPlaybackState !== "paused";
		const label = button.querySelector("[data-bk-playback-label]");
		if (label) label.textContent = playing ? "Pause" : "Resume";
		button.classList.toggle("is-active", playing);
		button
			.querySelector<HTMLElement>(".bk-icon-pause")
			?.style.setProperty("display", playing ? "" : "none");
		button
			.querySelector<HTMLElement>(".bk-icon-play")
			?.style.setProperty("display", playing ? "none" : "");
		button.setAttribute(
			"aria-label",
			playing ? "Pause simulation" : "Resume simulation",
		);
	}

	const stepPlayBtn = figure.querySelector<HTMLButtonElement>(
		".bk-steps-btn--play",
	);
	if (stepPlayBtn) {
		const playing = figure.dataset.bkPlaybackState !== "paused";
		stepPlayBtn.classList.toggle("is-active", playing);
		stepPlayBtn.setAttribute(
			"title",
			playing ? "Pause simulation (Space)" : "Play simulation (Space)",
		);
		stepPlayBtn.setAttribute(
			"aria-label",
			playing ? "Pause simulation" : "Play simulation",
		);
		const iconPause = stepPlayBtn.querySelector<HTMLElement>(".bk-icon-pause");
		const iconPlay = stepPlayBtn.querySelector<HTMLElement>(".bk-icon-play");
		if (iconPause) iconPause.style.display = playing ? "" : "none";
		if (iconPlay) iconPlay.style.display = playing ? "none" : "";
	}
}

export function bkSetLabPlayback(figure: HTMLElement, playing: boolean): void {
	if (!figure.querySelector(".bk-sim-preview")) return;
	figure.dataset.bkPlaybackState = playing ? "playing" : "paused";
	postPlayback(
		figure,
		playing &&
			figure.classList.contains("bk-object--maximized") &&
			!document.hidden,
	);
	updatePlaybackButton(figure);
	bkSyncLabPauseOverlay(figure);
}

function ensurePlaybackControls(figure: HTMLElement): void {
	if (
		figure.classList.contains("bk-steps-object") ||
		!figure.querySelector(".bk-sim-preview") ||
		figure.querySelector("[data-bk-playback]")
	)
		return;
	let inspector = figure.querySelector(".bk-sim-inspector");
	if (!inspector) {
		inspector = document.createElement("aside");
		inspector.className = "bk-sim-inspector";
		inspector.setAttribute("aria-label", "Simulation inspector");
		figure.querySelector(".bk-sim-workspace")?.append(inspector);
	}
	const controls = document.createElement("div");
	controls.className = "bk-steps-controls bk-sim-playback";
	controls.setAttribute("role", "group");
	controls.setAttribute("aria-label", "Simulation playback");
	controls.innerHTML = `<div class="bk-steps-nav"><button type="button" class="bk-steps-btn" data-bk-playback aria-keyshortcuts="Space" title="Pause simulation (Space)">${PAUSE_ICON}${PLAY_ICON}<span class="bk-sr-only" data-bk-playback-label>Pause</span></button><button type="button" class="bk-steps-btn" data-bk-reset-simulation aria-keyshortcuts="R" aria-label="Reset simulation" title="Reset simulation">${RESET_ICON}<span class="bk-sr-only">Reset</span></button></div>`;
	(figure.querySelector(".bk-sim-stage") || inspector).append(controls);
	updatePlaybackButton(figure);
}

export function bkResetLab(figure: HTMLElement): void {
	const iframe = figure.querySelector<HTMLIFrameElement>(
		".bk-sim-preview iframe",
	);
	if (!iframe) return;
	let props: Record<string, unknown> = {};
	try {
		const controls = figure.querySelector(".bk-sim-controls");
		props = controls
			? JSON.parse(controls.getAttribute("data-bk-default-props") || "{}")
			: JSON.parse(figure.querySelector(".bk-sim-config")?.textContent || "{}")
					.props || {};
	} catch {
		return;
	}
	(
		figure as HTMLElement & { __bkCurrentProps?: Record<string, unknown> }
	).__bkCurrentProps = { ...props };
	bkApplyPropsToControls(figure, props);
	figure.querySelectorAll("[data-bk-preset].is-active").forEach((button) => {
		button.classList.remove("is-active");
	});
	figure
		.querySelectorAll<HTMLSelectElement>("select[data-bk-preset-select]")
		.forEach((select) => {
			select.value = "";
		});
	document.dispatchEvent(
		new CustomEvent("bk:simulation-reset", { detail: { id: figure.id } }),
	);
	const playing =
		figure.dataset.bkPlaybackState !== "paused" &&
		figure.classList.contains("bk-object--maximized") &&
		!document.hidden;
	if (figure.dataset.bkResetHandler === "true") {
		iframe.contentWindow?.postMessage(
			{ type: "bk:reset", props, playing },
			"*",
		);
		return;
	}
	// Reloading is the only deterministic reset for legacy simulations with private state.
	delete figure.dataset.bkResetHandler;
	iframe.addEventListener(
		"load",
		() => {
			iframe.contentWindow?.postMessage({ type: "bk:set-props", props }, "*");
			postPlayback(
				figure,
				figure.dataset.bkPlaybackState !== "paused" &&
					figure.classList.contains("bk-object--maximized") &&
					!document.hidden,
			);
			iframe.contentWindow?.postMessage({ type: "bk:runtime-query" }, "*");
		},
		{ once: true },
	);
	iframe.setAttribute("srcdoc", iframe.srcdoc);
}

function syncMultiSimPickers(_currentSimId: string): void {
	document.querySelectorAll(".bk-expanded-sim-picker").forEach((picker) => {
		picker.setAttribute("hidden", "");
		picker.replaceChildren();
	});
}

function restoreLabEntry(btn: HTMLElement): void {
	const isLab = btn.hasAttribute?.("data-bk-lab-entry");
	btn.innerHTML = EXPAND_ICON + (isLab ? "<span>Open lab</span>" : "");
	btn.setAttribute("aria-label", isLab ? "Open lab" : "Expand Lab");
	btn.title = isLab ? "Open lab" : "Expand Lab";
}

export function bkSelectInspectorTab(
	target: Element | string,
	tabKey: "controls" | "telemetry",
	shouldFocusTab = false,
): void {
	const figure =
		typeof target === "string"
			? document.getElementById(target)
			: (target.closest?.(".bk-object") as HTMLElement) ||
				(target as HTMLElement);

	if (!figure) return;

	const tablist = figure.querySelector(".bk-sim-tablist");
	if (!tablist) return;

	const tabs = Array.from(
		tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
	);
	const panels = Array.from(
		figure.querySelectorAll<HTMLElement>('[role="tabpanel"]'),
	);

	const targetTab = tabs.find((t) =>
		tabKey === "controls"
			? t.id.endsWith("-tab-controls") ||
				t.getAttribute("aria-controls")?.includes("controls")
			: t.id.endsWith("-tab-telemetry") ||
				t.getAttribute("aria-controls")?.includes("telemetry"),
	);

	if (!targetTab) return;

	tabs.forEach((tab) => {
		const isMatch = tab === targetTab;
		tab.setAttribute("aria-selected", isMatch ? "true" : "false");
		tab.setAttribute("tabindex", isMatch ? "0" : "-1");
		if (isMatch) {
			tab.classList.add("is-active");
		} else {
			tab.classList.remove("is-active");
		}
	});

	const targetPanelId = targetTab.getAttribute("aria-controls");
	panels.forEach((panel) => {
		const isMatch =
			panel.id === targetPanelId ||
			(tabKey === "controls" &&
				panel.classList.contains("bk-sim-tabpanel--controls")) ||
			(tabKey === "telemetry" &&
				panel.classList.contains("bk-sim-tabpanel--telemetry"));
		if (isMatch) {
			panel.removeAttribute("hidden");
			panel.classList.add("is-active");
		} else {
			panel.setAttribute("hidden", "");
			panel.classList.remove("is-active");
		}
	});

	if (shouldFocusTab && typeof targetTab.focus === "function") {
		targetTab.focus();
	}
}

function setPreviewActive(figure: HTMLElement, active: boolean): void {
	if (figure.classList.contains("bk-steps-object")) {
		figure.dispatchEvent(
			new CustomEvent(active ? "bk:steps-activate" : "bk:steps-deactivate", {
				bubbles: true,
			}),
		);
	}
	const frame = figure.querySelector(".bk-sim-preview");
	if (!frame) return;
	frame.classList.toggle("is-interactive", active);
	postPlayback(
		figure,
		active && figure.dataset.bkPlaybackState !== "paused" && !document.hidden,
	);
}

/**
 * Expand a simulation into the full-window expanded lab workspace.
 * Preserves live iframe state, active values, and saves scroll & focus for exit.
 */
export function bkExpandLab(
	target: Element | string,
	options?: {
		focusReturn?: HTMLElement;
		defaultTab?: "controls" | "telemetry";
	},
): void {
	const figure =
		typeof target === "string"
			? document.getElementById(target)
			: (target.closest?.(".bk-object") as HTMLElement) ||
				(target as HTMLElement);

	if (!figure) return;
	if (stateDocument !== document) {
		restoreBackground();
		modalAttributes.clear();
		savedOverflow = null;
		savedScrollY = null;
		savedFocusEl = null;
		stateDocument = document;
	}

	// Save scroll position before the first expansion
	if (savedScrollY === null) {
		savedScrollY =
			window.scrollY ||
			window.pageYOffset ||
			document?.documentElement?.scrollTop ||
			0;
	}

	// Save focus element
	if (!savedFocusEl) {
		if (options?.focusReturn) {
			savedFocusEl = options.focusReturn;
		} else if (
			typeof HTMLElement !== "undefined" &&
			document.activeElement instanceof HTMLElement
		) {
			savedFocusEl = document.activeElement;
		} else if (document.activeElement) {
			savedFocusEl = document.activeElement as HTMLElement;
		}
	}

	restoreHeader();

	// Unexpand any other expanded figure without resetting saved scroll or focus
	document
		.querySelectorAll<HTMLElement>(".bk-object--maximized")
		.forEach((obj) => {
			if (obj !== figure) {
				setPreviewActive(obj, false);
				restoreModal(obj);
				obj.classList.remove("bk-object--maximized");
				obj.classList.remove("bk-object--expanded");
				bkSyncLabPauseOverlay(obj);
				obj
					.querySelectorAll<HTMLDetailsElement>(".bk-sim-advanced")
					.forEach((details) => {
						details.open = false;
					});
				bkSelectInspectorTab(obj, "controls");
				const otherBtn = obj.querySelector<HTMLElement>(".bk-object-maximize");
				if (otherBtn) {
					restoreLabEntry(otherBtn);
				}
			}
		});

	const topbar = document.getElementById("bk-topbar");
	if (topbar?.parentNode) {
		topbarPlaceholder = document.createComment("topbar");
		topbar.before(topbarPlaceholder);
		figure.prepend(topbar);
		const exit = document.createElement("button");
		exit.id = "bk-lab-exit-topbar-btn";
		exit.type = "button";
		exit.className = "bk-icon-btn bk-topbar-btn bk-world-exit-topbar-btn";
		exit.setAttribute("aria-label", "Exit expanded view");
		exit.title = "Exit expanded view (Esc)";
		exit.innerHTML =
			'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
		exit.addEventListener("click", bkCollapseLab);
		const theme = topbar.querySelector("#bk-theme-toggle");
		if (theme?.parentElement) theme.before(exit);
		const crumbs = topbar.querySelector(".bk-topbar-breadcrumbs");
		const label = figure.querySelector(".bk-object-title")?.textContent?.trim();
		if (
			crumbs &&
			label &&
			crumbs.querySelector(".bk-topbar-active-section")?.textContent?.trim() !==
				label
		) {
			const sep = document.createElement("span");
			sep.className = "bk-topbar-crumb-sep bk-lab-crumb";
			sep.textContent = "/";
			const item = document.createElement("span");
			item.className = "bk-topbar-crumb-item bk-world-crumb-item bk-lab-crumb";
			item.textContent = label;
			crumbs.append(sep, item);
		}
	}
	isolateWorkspace(figure);
	ensurePlaybackControls(figure);
	figure.classList.add("bk-object--maximized");
	figure.classList.add("bk-object--expanded");
	setPreviewActive(figure, true);
	bkSyncLabPauseOverlay(figure);
	figure
		.querySelector("iframe")
		?.contentWindow?.postMessage({ type: "bk:runtime-query" }, "*");
	if (savedOverflow === null) savedOverflow = document.body.style.overflow;
	document.body.style.overflow = "hidden";
	document.body.classList.add("bk-expanded-lab-active");

	const simId = figure.id || figure.getAttribute("data-telemetry-id") || "";
	activeExpandedSimId = simId;

	const btn = figure.querySelector<HTMLElement>(".bk-object-maximize");
	if (btn && !topbar) {
		btn.innerHTML = "&times;";
		btn.setAttribute("aria-label", "Exit expanded view");
		btn.title = "Exit expanded view (Esc)";
	}

	const topbarBtn = document.getElementById("bk-doc-telemetry-btn");
	if (topbarBtn) {
		topbarBtn.setAttribute("aria-expanded", "true");
		topbarBtn.classList.add("is-active");
	}

	syncMultiSimPickers(simId);

	// Select default tab (Controls by default, or as requested)
	bkSelectInspectorTab(figure, options?.defaultTab || "controls");

	// Open advanced controls details
	figure
		.querySelectorAll<HTMLDetailsElement>(".bk-sim-advanced")
		.forEach((details) => {
			details.open = true;
		});

	// Focus the dialog so Space controls playback instead of activating the exit button.
	figure.focus?.({ preventScroll: true });
}

/**
 * Collapse the expanded lab workspace and restore normal inline layout,
 * exact prior document scroll, and prior input focus.
 */
export function bkCollapseLab(): void {
	const maximizedObjects = document.querySelectorAll<HTMLElement>(
		".bk-object--maximized",
	);
	if (maximizedObjects.length === 0) return;

	maximizedObjects.forEach((obj) => {
		setPreviewActive(obj, false);
		restoreModal(obj);
		obj.classList.remove("bk-object--maximized");
		obj.classList.remove("bk-object--expanded");
		bkSyncLabPauseOverlay(obj);

		obj
			.querySelectorAll<HTMLDetailsElement>(".bk-sim-advanced")
			.forEach((details) => {
				details.open = false;
			});
		bkSelectInspectorTab(obj, "controls");
		const btn = obj.querySelector<HTMLElement>(".bk-object-maximize");
		if (btn) {
			restoreLabEntry(btn);
		}
	});

	restoreHeader();
	restoreBackground();
	document.body.style.overflow = savedOverflow || "";
	savedOverflow = null;
	document.body.classList.remove("bk-expanded-lab-active");
	activeExpandedSimId = null;

	const topbarBtn = document.getElementById("bk-doc-telemetry-btn");
	if (topbarBtn) {
		topbarBtn.setAttribute("aria-expanded", "false");
		topbarBtn.classList.remove("is-active");
	}

	// Restore prior document scroll
	if (savedScrollY !== null) {
		const y = savedScrollY;
		savedScrollY = null;
		window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
	}

	// Restore prior focus
	if (savedFocusEl && typeof savedFocusEl.focus === "function") {
		const el = savedFocusEl;
		savedFocusEl = null;
		el.focus();
	}
}

export function bkToggleExpandLab(
	target?: Element | string,
	options?: {
		focusReturn?: HTMLElement;
		defaultTab?: "controls" | "telemetry";
	},
): void {
	if (!target) {
		// Toggle via document topbar button
		const currentMax = document.querySelector(".bk-object--maximized");
		if (currentMax) {
			bkCollapseLab();
			return;
		}

		// Determine target simulation deterministically
		let targetFigure: Element | null = null;
		if (activeExpandedSimId) {
			targetFigure = document.getElementById(activeExpandedSimId);
		}
		if (!targetFigure) {
			const telemetryFigs = Array.from(
				document.querySelectorAll<HTMLElement>(
					".bk-object:has(.bk-sim-telemetry)",
				),
			);
			if (telemetryFigs.length > 0) {
				const inView = telemetryFigs.find((fig) => {
					const rect = fig.getBoundingClientRect();
					return rect.top < window.innerHeight && rect.bottom > 0;
				});
				targetFigure = inView || telemetryFigs[0];
			}
		}
		if (!targetFigure) {
			targetFigure =
				document.querySelector(".bk-object:has(.bk-sim-workspace)") ||
				document.querySelector(".bk-object");
		}

		if (targetFigure) {
			bkExpandLab(targetFigure, options);
		}
		return;
	}

	const figure =
		typeof target === "string"
			? document.getElementById(target)
			: (target.closest?.(".bk-object") as HTMLElement) ||
				(target as HTMLElement);

	if (!figure) return;

	if (figure.classList.contains("bk-object--maximized")) {
		bkCollapseLab();
	} else {
		bkExpandLab(figure, options);
	}
}

export function bkWireWorkspace(): void {
	if (wiredDocument === document) return;
	wiredDocument = document;
	// Helper for keyboard navigation between inspector tabs
	function handleTabKeydown(e: KeyboardEvent, tab: HTMLButtonElement): void {
		const tablist = tab.closest(".bk-sim-tablist");
		if (!tablist) return;

		const tabs = Array.from(
			tablist.querySelectorAll<HTMLButtonElement>(
				'[role="tab"]:not([disabled])',
			),
		);
		const currentIndex = tabs.indexOf(tab);
		if (currentIndex === -1) return;

		let nextIndex: number | null = null;

		if (e.key === "ArrowRight" || e.key === "ArrowDown") {
			e.preventDefault();
			nextIndex = (currentIndex + 1) % tabs.length;
		} else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
			e.preventDefault();
			nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
		} else if (e.key === "Home") {
			e.preventDefault();
			nextIndex = 0;
		} else if (e.key === "End") {
			e.preventDefault();
			nextIndex = tabs.length - 1;
		}

		if (nextIndex !== null) {
			const nextTab = tabs[nextIndex];
			const figure = tablist.closest(".bk-object");
			if (figure && nextTab) {
				const isControls =
					nextTab.id.endsWith("-tab-controls") ||
					nextTab.getAttribute("aria-controls")?.includes("controls");
				bkSelectInspectorTab(
					figure,
					isControls ? "controls" : "telemetry",
					true,
				);
			}
		}
	}

	// 2. Global click handling for expanded lab entry/exit affordances and inspector tabs
	document.addEventListener("click", (e: MouseEvent) => {
		const target = e.target as HTMLElement;
		if (!target) return;

		const resume = target.closest?.("[data-bk-resume]");
		if (resume) {
			const figure = resume.closest<HTMLElement>(".bk-object");
			if (figure?.classList.contains("bk-steps-object"))
				figure.querySelector<HTMLButtonElement>(".bk-steps-btn--play")?.click();
			else if (figure) bkSetLabPlayback(figure, true);
			figure
				?.querySelector<HTMLElement>("[data-bk-playback], .bk-steps-btn--play")
				?.focus();
			return;
		}
		const playback = target.closest?.("button[data-bk-playback]");
		const reset = target.closest?.("[data-bk-reset-simulation]");
		if (playback || reset) {
			const figure = (playback || reset)?.closest<HTMLElement>(".bk-object");
			if (figure) {
				if (reset) bkResetLab(figure);
				else
					bkSetLabPlayback(figure, figure.dataset.bkPlaybackState === "paused");
			}
			return;
		}
		const entry = target.closest?.<HTMLElement>(
			"[data-bk-expand-preview], .bk-object-maximize, .bk-sim-advanced-summary",
		);
		if (entry) {
			const figure = entry.closest(".bk-object");
			if (
				figure &&
				(!entry.matches(".bk-sim-advanced-summary") ||
					!figure.classList.contains("bk-object--maximized"))
			) {
				e.preventDefault();
				bkToggleExpandLab(figure, {
					focusReturn: entry,
					defaultTab: "controls",
				});
			}
			return;
		}

		// Inspector tab button click
		const tab = target.closest?.('[role="tab"]') as HTMLButtonElement | null;
		if (tab && tab.closest(".bk-sim-tablist")) {
			const figure = tab.closest(".bk-object");
			if (figure) {
				const isControls =
					tab.id.endsWith("-tab-controls") ||
					tab.getAttribute("aria-controls")?.includes("controls");
				bkSelectInspectorTab(
					figure,
					isControls ? "controls" : "telemetry",
					true,
				);
				return;
			}
		}

		// Document Measurements toggle button (in topbar)
		const toggleBtn = target.closest?.(
			"#bk-doc-telemetry-btn, .bk-doc-telemetry-btn",
		) as HTMLElement;
		if (toggleBtn) {
			bkToggleExpandLab(undefined, {
				focusReturn: toggleBtn,
				defaultTab: "telemetry",
			});
			return;
		}

		// "Back to lesson" button in expanded lab header
		const backBtn = target.closest?.(".bk-expanded-back") as HTMLElement;
		if (backBtn) {
			bkCollapseLab();
			return;
		}

		// Close / compress button in header
		const closeBtn = target.closest?.(".bk-expanded-close") as HTMLElement;
		if (closeBtn) {
			bkCollapseLab();
			return;
		}
	});

	// 4. Keyboard accessibility: Arrows/Home/End for tabs and Escape collapses expanded workspace
	document.addEventListener(
		"keydown",
		(e: KeyboardEvent) => {
			const target = e.target as HTMLElement;
			const figure = (document.querySelector(".bk-object--maximized") ||
				target?.closest?.(".bk-object")) as HTMLElement | null;

			if (
				figure &&
				e.key === "Escape" &&
				figure.classList.contains("bk-object--maximized")
			) {
				e.preventDefault();
				bkCollapseLab();
				return;
			}
			if (
				figure &&
				e.key === "Tab" &&
				figure.classList.contains("bk-object--maximized")
			) {
				const elements = focusableElements(figure);
				const first = elements[0];
				const last = elements[elements.length - 1];
				if (
					!elements.length ||
					(e.shiftKey && document.activeElement === first) ||
					(!e.shiftKey && document.activeElement === last)
				) {
					e.preventDefault();
					focusWithin(figure, e.shiftKey);
					return;
				}
			}
			const tab = target?.closest?.('[role="tab"]') as HTMLButtonElement | null;
			if (tab && tab.closest(".bk-sim-tablist")) {
				if (![" ", "Space", "Spacebar"].includes(e.key)) {
					handleTabKeydown(e, tab);
					return;
				}
			}
			if (
				!figure ||
				e.defaultPrevented ||
				e.ctrlKey ||
				e.metaKey ||
				e.altKey ||
				e.isComposing
			)
				return;

			if ([" ", "Space", "Spacebar"].includes(e.key)) {
				if (isTextEditable(target)) return;
				e.preventDefault();
				if (e.repeat) return;
				handleWorkspaceShortcut(figure, e.key);
				return;
			}

			if (editableShortcutTarget(target)) return;
			if (
				(target?.closest(".bk-sim-inspector, .bk-topbar") &&
					!target.closest(".bk-steps-controls, .bk-sim-pause-overlay")) ||
				(target?.closest("button, a, summary") &&
					!target.closest(".bk-steps-controls, .bk-sim-pause-overlay"))
			)
				return;
			if (e.repeat) {
				if (["r", "R", "ArrowLeft", "ArrowRight"].includes(e.key))
					e.preventDefault();
				return;
			}
			if (handleWorkspaceShortcut(figure as HTMLElement, e.key))
				e.preventDefault();
		},
		true,
	);

	document.addEventListener("focusin", (event) => {
		const figure = document.querySelector(".bk-object--maximized");
		if (
			figure &&
			event.target instanceof Node &&
			!figure.contains(event.target)
		)
			focusWithin(figure);
	});
	window.addEventListener("message", (event) => {
		if (!event.source) return;
		const figure = Array.from(
			document.querySelectorAll<HTMLElement>(
				".bk-object:has(.bk-sim-workspace)",
			),
		).find(
			(item) => item.querySelector("iframe")?.contentWindow === event.source,
		);
		if (!figure || !event.data || typeof event.data !== "object") return;
		if (event.data.type === "bk:runtime-ready") {
			figure.dataset.bkResetHandler =
				event.data.reset === true ? "true" : "false";
			return;
		}
		if (!figure.classList.contains("bk-object--maximized")) return;
		if (
			event.data.type === "bk:workspace-keydown" &&
			typeof event.data.key === "string" &&
			!event.data.repeat &&
			!event.data.altKey &&
			!event.data.ctrlKey &&
			!event.data.metaKey
		)
			handleWorkspaceShortcut(figure, event.data.key);
		if (event.data.type === "bk:workspace-close") bkCollapseLab();
		if (event.data.type === "bk:workspace-focus") {
			const elements = focusableElements(figure);
			const iframe = figure.querySelector("iframe");
			const index = iframe ? elements.indexOf(iframe) : -1;
			const direction =
				event.data.direction === "backward"
					? -1
					: event.data.direction === "forward"
						? 1
						: 0;
			if (direction && index >= 0 && elements.length)
				elements[
					(index + direction + elements.length) % elements.length
				].focus();
		}
	});
	document.addEventListener(
		"load",
		(event) => {
			const iframe = event.target;
			if (!(iframe instanceof HTMLElement) || iframe.tagName !== "IFRAME")
				return;
			const figure = iframe.closest<HTMLElement>(".bk-object");
			if (!figure?.querySelector(".bk-sim-preview")) return;
			postPlayback(
				figure,
				figure.classList.contains("bk-object--maximized") &&
					figure.dataset.bkPlaybackState !== "paused" &&
					!document.hidden,
			);
			(iframe as HTMLIFrameElement).contentWindow?.postMessage(
				{ type: "bk:runtime-query" },
				"*",
			);
		},
		true,
	);

	document.addEventListener("visibilitychange", () => {
		const figure = document.querySelector<HTMLElement>(".bk-object--maximized");
		if (figure)
			postPlayback(
				figure,
				!document.hidden && figure.dataset.bkPlaybackState !== "paused",
			);
	});

	window.addEventListener("bk-page-loaded", () => {
		bkCollapseLab();
	});
}
