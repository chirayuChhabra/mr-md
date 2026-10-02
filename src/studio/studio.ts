import type { CustomPalette, MrmdConfig } from "../types.js";

// ── State ──────────────────────────────────────────────────────────────────

let currentConfig: MrmdConfig = {};
let unassignedFiles: string[] = [];
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let editingCustomPaletteKey: string | null = null;
let lessonSearchQuery = "";
let activeLessonFile = "";
let isInitialBoot = true;
let isDraggingLesson = false;
let isNavigatingAnimation = false;
let pendingDeleteThemeKey: string | null = null;
let currentGlideRaf: number | null = null;
let cachedDetents: {
	curriculum: number;
	course: number;
	design: number;
} | null = null;

let studioMode: "single" | "course" = "course";
let _currentLessonOutline: Array<{
	id: string;
	label: string;
	kind: string;
	level?: number;
}> = [];
let currentLessonFrontmatter: Record<string, unknown> = {};
let currentTargetFile: string | null = null;
let allFilesList: string[] = [];
let frontmatterDebounceTimer: ReturnType<typeof setTimeout> | null = null;
interface PendingFrontmatterSave {
	target: string;
	title?: string;
	description?: string;
	author?: string;
	tags?: string[];
}
let pendingFrontmatterSave: PendingFrontmatterSave | null = null;

const BUILTIN_PALETTES = ["ink", "field", "ember", "elixir", "trunk", "lava"];

const studioBroadcast =
	typeof BroadcastChannel !== "undefined"
		? new BroadcastChannel("mrmd-studio-sync")
		: null;

// ── DOM Helpers ────────────────────────────────────────────────────────────

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
	document.getElementById(id) as T | null;

function syncAppearanceToIframe() {
	const iframe = $<HTMLIFrameElement>("st-course-iframe");
	if (!iframe?.contentWindow || !iframe.contentDocument) return;
	try {
		const doc = iframe.contentDocument;
		const win = iframe.contentWindow;
		const theme =
			currentConfig.theme ||
			(localStorage.getItem("bk-theme") as "light" | "dark" | "auto") ||
			"auto";
		const palette =
			currentConfig.palette || localStorage.getItem("bk-palette") || "ink";
		const ui =
			currentConfig.ui ||
			(localStorage.getItem("bk-ui") as "standard" | "neo" | "playful") ||
			"standard";

		try {
			if (theme) win.localStorage.setItem("bk-theme", theme);
			if (palette) win.localStorage.setItem("bk-palette", palette);
			if (ui) win.localStorage.setItem("bk-ui", ui);
		} catch (_) {}

		let resolvedTheme = theme;
		if (resolvedTheme === "auto") {
			resolvedTheme = win.matchMedia?.("(prefers-color-scheme: dark)").matches
				? "dark"
				: "light";
		}

		const pal = palette === "green" ? "field" : palette;
		doc.documentElement.setAttribute("data-theme", resolvedTheme);
		doc.documentElement.setAttribute("data-palette", pal);
		doc.documentElement.setAttribute("data-ui", ui);

		const shell = doc.querySelector(".bk-shell");
		if (shell) {
			shell.setAttribute("data-theme", resolvedTheme);
			shell.setAttribute("data-palette", pal);
			shell.setAttribute("data-ui", ui);
		}

		// Sync live custom palette styles into iframe
		let customStyleEl = doc.getElementById("mrmd-custom-palettes-live");
		if (
			currentConfig.customPalettes &&
			Object.keys(currentConfig.customPalettes).length > 0
		) {
			if (!customStyleEl) {
				customStyleEl = doc.createElement("style");
				customStyleEl.id = "mrmd-custom-palettes-live";
				doc.head.appendChild(customStyleEl);
			}
			let css = "";
			for (const [key, p] of Object.entries(currentConfig.customPalettes)) {
				const light = p.light ?? {};
				const dark = p.dark ?? {};
				const accentSoft = p.accentSoft ?? `${p.accent}1a`;
				css += `html[data-palette="${key}"], .bk-shell[data-palette="${key}"] { --accent: ${light.accent ?? p.accent}; --accent-soft: ${light.accentSoft ?? accentSoft}; ${light.bg ? `--bg: ${light.bg};` : ""} ${light.paper ? `--paper: ${light.paper};` : ""} }\n`;
				css += `html[data-palette="${key}"][data-theme="dark"], .bk-shell[data-palette="${key}"][data-theme="dark"] { --accent: ${dark.accent ?? p.accent}; --accent-soft: ${dark.accentSoft ?? accentSoft}; ${dark.bg ? `--bg: ${dark.bg};` : ""} ${dark.paper ? `--paper: ${dark.paper};` : ""} }\n`;
			}
			customStyleEl.textContent = css;
		} else if (customStyleEl) {
			customStyleEl.remove();
		}
	} catch (_) {}
}

function broadcastAppearanceChange() {
	if (studioBroadcast) {
		studioBroadcast.postMessage({
			type: "appearance-update",
			theme: currentConfig.theme || "auto",
			palette: currentConfig.palette || "ink",
			ui: currentConfig.ui || "standard",
			customPalettes: currentConfig.customPalettes || {},
		});
	}
	syncAppearanceToIframe();
}

function slugifyFileName(fileName: string): string {
	return fileName
		.replace(/\.md$/, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}

function formatFileAsTitle(file: string): string {
	return (
		file
			.replace(/^\d+[-_]?/, "")
			.replace(/\.md$/, "")
			.replace(/[-_]/g, " ")
			.replace(/\b\w/g, (c) => c.toUpperCase()) || file
	);
}

function setStatus(status: "saved" | "saving" | "unsaved", msg?: string) {
	const dot = $("st-status-dot");
	const statusWrap = $("st-status");
	if (!dot) return;

	dot.className = "st-status-dot";
	if (status === "saving") {
		dot.classList.add("saving");
		if (statusWrap) statusWrap.title = msg || "Saving changes to disk...";
	} else if (status === "unsaved") {
		dot.classList.add("dirty");
		if (statusWrap) statusWrap.title = msg || "Unsaved changes";
	} else {
		if (statusWrap) statusWrap.title = msg || "Preview synchronized with disk";
	}
}

// ── Niri Ribbon Spatial Navigation ─────────────────────────────────────────

function updateCachedDetents() {
	const canvas = $("st-infinite-canvas");
	const courseSlab = $("st-slab-course");
	if (!canvas || !courseSlab) return;

	const clientWidth = canvas.clientWidth;
	const scrollWidth = canvas.scrollWidth;
	const slabLeft = courseSlab.offsetLeft;
	const slabWidth = courseSlab.offsetWidth;

	cachedDetents = {
		curriculum: 0,
		course: Math.max(0, slabLeft - Math.max(0, (clientWidth - slabWidth) / 2)),
		design: Math.max(0, scrollWidth - clientWidth),
	};
}

function smoothScrollTo(
	element: HTMLElement,
	targetLeft: number,
	duration = 380,
) {
	// Cancel any currently running glide immediately so multiple keypresses never fight
	if (currentGlideRaf !== null) {
		cancelAnimationFrame(currentGlideRaf);
		currentGlideRaf = null;
	}

	const startLeft = element.scrollLeft;
	const change = targetLeft - startLeft;
	if (Math.abs(change) < 2) {
		element.scrollLeft = targetLeft;
		element.classList.remove("is-gliding");
		isNavigatingAnimation = false;
		syncNavButtons();
		return;
	}

	isNavigatingAnimation = true;
	element.classList.add("is-gliding");
	// Temporarily bypass scroll-snap during programmatic glide so button clicks are silky-smooth
	element.style.scrollSnapType = "none";

	const startTime = performance.now();

	function easeOutQuart(t: number): number {
		return 1 - (1 - t) ** 4;
	}

	function step(now: number) {
		const elapsed = now - startTime;
		const progress = Math.min(elapsed / duration, 1);
		const eased = easeOutQuart(progress);
		element.scrollLeft = Math.round(startLeft + change * eased);
		if (progress < 1) {
			currentGlideRaf = requestAnimationFrame(step);
		} else {
			element.scrollLeft = targetLeft;
			// Re-enable native magnetic hardware snap detents once glide lands
			element.style.scrollSnapType = "x mandatory";
			element.classList.remove("is-gliding");
			isNavigatingAnimation = false;
			currentGlideRaf = null;
			syncNavButtons();
		}
	}
	currentGlideRaf = requestAnimationFrame(step);
}

function syncNavButtons() {
	if (isNavigatingAnimation) return;
	const canvas = $("st-infinite-canvas");
	if (!canvas) return;

	if (!cachedDetents) {
		updateCachedDetents();
	}
	if (!cachedDetents) return;

	const scrollLeft = canvas.scrollLeft;
	const dCurriculum = Math.abs(scrollLeft - cachedDetents.curriculum);
	const dCourse = Math.abs(scrollLeft - cachedDetents.course);
	const dDesign = Math.abs(scrollLeft - cachedDetents.design);

	let activeTarget: "curriculum" | "course" | "design" = "course";
	const min = Math.min(dCurriculum, dCourse, dDesign);
	if (min === dCurriculum) {
		activeTarget = "curriculum";
	} else if (min === dDesign) {
		activeTarget = "design";
	}

	document.querySelectorAll(".st-nav-slab-btn").forEach((btn) => {
		if ((btn as HTMLElement).dataset.target === activeTarget) {
			btn.classList.add("active");
		} else {
			btn.classList.remove("active");
		}
	});
}

function scrollToSlab(target: "curriculum" | "course" | "design") {
	const canvas = $("st-infinite-canvas");
	if (!canvas) return;

	// Instant visual feedback on ribbon nav
	document.querySelectorAll(".st-nav-slab-btn").forEach((btn) => {
		if ((btn as HTMLElement).dataset.target === target) {
			btn.classList.add("active");
		} else {
			btn.classList.remove("active");
		}
	});

	if (!cachedDetents) {
		updateCachedDetents();
	}
	const detents = cachedDetents || {
		curriculum: 0,
		course: 500,
		design: 1000,
	};

	if (target === "curriculum") {
		smoothScrollTo(canvas, detents.curriculum);
	} else if (target === "design") {
		smoothScrollTo(canvas, detents.design);
	} else {
		smoothScrollTo(canvas, detents.course);
	}
}

// ── API Operations ─────────────────────────────────────────────────────────

async function fetchConfig() {
	try {
		const res = await fetch("/__api/context");
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = await res.json();
		studioMode = data.mode || "course";
		currentConfig = data.config || {};
		allFilesList = data.allFiles || [];
		unassignedFiles = data.unassignedFiles || [];
		_currentLessonOutline = data.outline || [];
		currentLessonFrontmatter = data.frontmatter || {};
		currentTargetFile = data.targetFile || null;

		// Hydrate theme/palette from localStorage if not explicitly configured
		const savedTheme = localStorage.getItem("bk-theme");
		if (!currentConfig.theme && savedTheme) {
			currentConfig.theme = savedTheme as "light" | "dark" | "auto";
		}
		const savedPalette = localStorage.getItem("bk-palette");
		if (!currentConfig.palette && savedPalette) {
			currentConfig.palette = savedPalette;
		}
		const savedUi = localStorage.getItem("bk-ui");
		if (!currentConfig.ui && savedUi) {
			currentConfig.ui = savedUi as "standard" | "neo" | "playful";
		}

		broadcastAppearanceChange();
		syncAppearanceToIframe();

		const modePill = $("st-mode-pill");
		if (modePill) {
			modePill.style.display = studioMode === "single" ? "inline-flex" : "none";
			modePill.textContent = "Lesson";
		}
		const navCurriculumLabel = $("st-nav-curriculum-label");
		if (navCurriculumLabel) {
			navCurriculumLabel.textContent =
				studioMode === "single" ? "Lesson" : "Lessons";
		}

		if (studioMode === "single") {
			if (!activeLessonFile || !allFilesList.includes(activeLessonFile)) {
				activeLessonFile = data.targetFile || allFilesList[0] || "";
			}
			const headerTitle = $("st-header-title");
			if (headerTitle) {
				headerTitle.textContent =
					(currentLessonFrontmatter.title as string) ||
					data.title ||
					data.targetFile ||
					"Lesson";
			}
		} else {
			const headerTitle = $("st-header-title");
			if (headerTitle) {
				headerTitle.textContent = currentConfig.title || "Untitled Course";
			}
			// Default to Course Home on initial load if course mode
			if (isInitialBoot) {
				activeLessonFile = "";
			}
		}

		renderAll();
		updateLiveViewport();
		updateCachedDetents();

		// Only center the desktop course slab on initial cold page load
		if (isInitialBoot) {
			isInitialBoot = false;
			setTimeout(() => {
				updateCachedDetents();
				scrollToSlab("course");
			}, 120);
		}
	} catch (err) {
		console.error("Failed to load studio context:", err);
		setStatus("unsaved", "Error loading");
	}
}

async function saveConfig() {
	setStatus("saving");
	try {
		const res = await fetch("/__api/config", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(currentConfig),
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		setStatus("saved");
	} catch (err) {
		console.error("Failed to save config:", err);
		setStatus("unsaved", "Save failed");
	}
}

function queueSave() {
	setStatus("unsaved");
	if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
	saveDebounceTimer = setTimeout(() => {
		saveConfig();
	}, 600);
}

// ── Viewport Control ───────────────────────────────────────────────────────

let lastSyncedUrl = "";

function syncIframeUrl(forcedPathOrUrl?: string) {
	const iframe = $<HTMLIFrameElement>("st-course-iframe");
	let rawUrl = forcedPathOrUrl;

	if (!rawUrl && iframe?.contentWindow) {
		try {
			const loc = iframe.contentWindow.location;
			if (loc.href && loc.href !== "about:blank") {
				rawUrl = loc.href;
			}
		} catch {}
	}

	if (!rawUrl) return;

	let urlObj: URL;
	try {
		urlObj = new URL(rawUrl, window.location.origin);
	} catch {
		return;
	}

	const fullUrl = urlObj.href;
	const pathWithQueryAndHash = urlObj.pathname + urlObj.search + urlObj.hash;

	if (fullUrl === lastSyncedUrl) return;
	lastSyncedUrl = fullUrl;

	const urlDisplay = $("st-viewport-url");
	if (urlDisplay && urlDisplay.textContent !== fullUrl) {
		urlDisplay.textContent = fullUrl;
	}

	const openTabBtn = $<HTMLAnchorElement>("st-btn-open-active-tab");
	if (openTabBtn) {
		openTabBtn.href = pathWithQueryAndHash;
	}

	// Update lesson card active highlights
	const slug = urlObj.pathname.replace(/^\//, "").replace(/\.html$/, "");
	if (slug && slug !== "index") {
		const matchingFile =
			allFilesList.find((f) => slugifyFileName(f) === slug) ||
			(currentConfig.lessons || [])
				.map((e) => (typeof e === "string" ? e : e.file))
				.find((f) => slugifyFileName(f) === slug) ||
			`${slug}.md`;
		const prev = activeLessonFile;
		if (prev !== matchingFile) {
			flushPendingFrontmatterSave();
			activeLessonFile = matchingFile;
			syncInspectorContext();
		}
		const homeCardEl = $("st-course-home-card");
		if (homeCardEl) homeCardEl.classList.remove("active");
		document
			.querySelectorAll(
				".st-lesson-card:not(#st-course-home-card), .st-single-lesson-card",
			)
			.forEach((c) => {
				if ((c as HTMLElement).dataset.file === matchingFile) {
					c.classList.add("active");
				} else {
					c.classList.remove("active");
				}
			});
	} else {
		const prev = activeLessonFile;
		if (prev !== "") {
			flushPendingFrontmatterSave();
			activeLessonFile = "";
			syncInspectorContext();
		}
		const homeCardEl = $("st-course-home-card");
		if (homeCardEl) homeCardEl.classList.add("active");
		document
			.querySelectorAll(
				".st-lesson-card:not(#st-course-home-card), .st-single-lesson-card",
			)
			.forEach((c) => {
				c.classList.remove("active");
			});
	}
}

function updateLiveViewport(targetFile?: string) {
	if (targetFile !== undefined) {
		const prev = activeLessonFile;
		if (prev !== targetFile) {
			flushPendingFrontmatterSave();
			activeLessonFile = targetFile;
			syncInspectorContext();
		}
	} else if (
		!activeLessonFile &&
		studioMode === "single" &&
		currentTargetFile
	) {
		activeLessonFile = currentTargetFile;
		syncInspectorContext();
	}

	const iframe = $<HTMLIFrameElement>("st-course-iframe");
	const urlDisplay = $("st-viewport-url");
	const openTabBtn = $<HTMLAnchorElement>("st-btn-open-active-tab");

	let htmlPath = "/";
	if (activeLessonFile) {
		htmlPath = `/${slugifyFileName(activeLessonFile)}.html`;
	}

	if (iframe) {
		let currentPath = "";
		try {
			if (iframe.contentWindow?.location?.pathname) {
				currentPath = iframe.contentWindow.location.pathname;
			}
		} catch {}

		const normalizedCurrent = currentPath === "/index.html" ? "/" : currentPath;
		const normalizedTarget = htmlPath === "/index.html" ? "/" : htmlPath;

		if (
			normalizedCurrent !== normalizedTarget ||
			!iframe.src ||
			iframe.src === "about:blank"
		) {
			let navigatedSeamlessly = false;
			try {
				const iframeWin = iframe.contentWindow as unknown as {
					location?: Location;
					__bk_navigate?: (path: string) => boolean;
				};
				if (
					iframeWin?.location?.origin === window.location.origin &&
					typeof iframeWin.__bk_navigate === "function"
				) {
					navigatedSeamlessly = Boolean(iframeWin.__bk_navigate(htmlPath));
				}
			} catch {}
			if (!navigatedSeamlessly) {
				iframe.src = htmlPath;
			}
		}
	}

	const fullUrl = `${window.location.origin}${htmlPath}`;
	lastSyncedUrl = fullUrl;

	if (urlDisplay) {
		urlDisplay.textContent = fullUrl;
	}

	if (openTabBtn) {
		openTabBtn.href = htmlPath;
	}

	const homeCard = $("st-course-home-card");
	if (homeCard) {
		if (!activeLessonFile && studioMode !== "single") {
			homeCard.classList.add("active");
		} else {
			homeCard.classList.remove("active");
		}
	}

	document
		.querySelectorAll(".st-lesson-card:not(#st-course-home-card)")
		.forEach((card) => {
			if ((card as HTMLElement).dataset.file === activeLessonFile) {
				card.classList.add("active");
			} else {
				card.classList.remove("active");
			}
		});
}

// ── Contextual Inspector Switching ─────────────────────────────────────────

async function loadLessonFrontmatter(file: string) {
	try {
		const res = await fetch(
			`/__api/lesson/frontmatter?file=${encodeURIComponent(file)}`,
		);
		if (res.ok) {
			const data = await res.json();
			currentLessonFrontmatter = data.frontmatter || {};
			renderLessonFrontmatter();
		}
	} catch (err) {
		console.error("Failed to load frontmatter for", file, err);
	}
}

async function syncInspectorContext() {
	const lessonInfoSec = $("st-lesson-info-section");
	const courseInfoSec = $("st-course-info-section");

	if (studioMode === "single") {
		if (lessonInfoSec) lessonInfoSec.style.display = "block";
		if (courseInfoSec) courseInfoSec.style.display = "none";
		renderLessonFrontmatter();
		return;
	}

	// Course Mode
	if (!activeLessonFile) {
		// Course Home Overview
		if (lessonInfoSec) lessonInfoSec.style.display = "none";
		if (courseInfoSec) courseInfoSec.style.display = "block";
		renderMetadata();
	} else {
		// Inspecting a specific lesson
		if (lessonInfoSec) lessonInfoSec.style.display = "block";
		if (courseInfoSec) courseInfoSec.style.display = "none";
		await loadLessonFrontmatter(activeLessonFile);
	}
}

// ── Rendering ──────────────────────────────────────────────────────────────

function renderAll() {
	if (studioMode === "single") {
		renderSingleFileView();
		renderLessonFrontmatter();
	} else {
		const singleView = $("st-single-file-view");
		const courseWrap = $("st-course-curriculum-wrap");
		if (singleView) singleView.style.display = "none";
		if (courseWrap) courseWrap.style.display = "block";

		renderCurriculum();
		renderUnassigned();
		syncInspectorContext();
	}
	renderThemeMode();
	renderUiMode();
	renderPalettes();
}

function openConvertCourseModal() {
	const modal = $("st-modal-convert-course");
	const nameInput = $<HTMLInputElement>("st-convert-course-name");
	const confirmBtn = $<HTMLButtonElement>("st-btn-confirm-convert");
	const errorEl = $("st-convert-error-msg");
	if (!modal) return;
	if (nameInput) {
		nameInput.value = "";
		nameInput.classList.remove("st-input-error");
	}
	if (confirmBtn) {
		confirmBtn.disabled = true;
	}
	if (errorEl) {
		errorEl.textContent = "";
		errorEl.style.display = "none";
	}
	modal.style.display = "flex";
	nameInput?.focus();
}

function renderSingleFileView() {
	const singleView = $("st-single-file-view");
	const courseWrap = $("st-course-curriculum-wrap");
	const container = $("st-single-lesson-container");

	if (singleView) singleView.style.display = "flex";
	if (courseWrap) courseWrap.style.display = "none";
	if (!container) return;

	if (allFilesList.length > 1) {
		container.innerHTML = "";

		// Convert to Course banner
		const banner = document.createElement("div");
		banner.className = "st-convert-banner";
		banner.innerHTML = `
			<div class="st-convert-banner-info">
				<strong>Multiple Lessons Found</strong>
				<p>Organize into a full course series with shared navigation.</p>
			</div>
			<button type="button" class="st-btn st-btn-sm st-btn-primary" id="st-btn-banner-convert">Convert to Course</button>
		`;
		banner
			.querySelector("#st-btn-banner-convert")
			?.addEventListener("click", () => {
				openConvertCourseModal();
			});
		container.appendChild(banner);

		// Render a card for each independent file
		allFilesList.forEach((file) => {
			const card = document.createElement("div");
			const isActive =
				activeLessonFile === file ||
				(!activeLessonFile && file === currentTargetFile);
			card.className = `st-single-lesson-card clickable ${isActive ? "active" : ""}`;
			card.dataset.file = file;

			const title =
				isActive && currentLessonFrontmatter.title
					? (currentLessonFrontmatter.title as string)
					: formatFileAsTitle(file);
			const desc = isActive
				? (currentLessonFrontmatter.description as string) ||
					"Previewing live in center viewport."
				: "Click to preview and edit frontmatter.";

			card.innerHTML = `
				<div class="st-single-lesson-header">
					<div class="st-single-lesson-icon">
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
							<polyline points="14 2 14 8 20 8"></polyline>
							<line x1="16" y1="13" x2="8" y2="13"></line>
							<line x1="16" y1="17" x2="8" y2="17"></line>
						</svg>
					</div>
					<div class="st-single-lesson-meta">
						<span class="st-single-lesson-title">${escapeHtml(title)}</span>
						<span class="st-single-lesson-file">${escapeHtml(file)}</span>
					</div>
					${isActive ? '<span class="st-single-lesson-badge">ACTIVE</span>' : ""}
				</div>
				<div class="st-single-lesson-body">
					<p class="st-single-lesson-desc">${escapeHtml(desc)}</p>
				</div>
			`;

			card.addEventListener("click", async () => {
				await flushPendingFrontmatterSave();
				activeLessonFile = file;
				updateLiveViewport(file);
				await loadLessonFrontmatter(file);
				renderSingleFileView();
			});

			card.addEventListener("dblclick", async () => {
				await flushPendingFrontmatterSave();
				activeLessonFile = file;
				updateLiveViewport(file);
				await loadLessonFrontmatter(file);
				renderSingleFileView();
				scrollToSlab("course");
			});

			container.appendChild(card);
		});
	} else {
		// Single file only
		container.innerHTML = `
			<div class="st-single-lesson-card" id="st-single-lesson-card">
				<div class="st-single-lesson-header">
					<div class="st-single-lesson-icon">
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
							<polyline points="14 2 14 8 20 8"></polyline>
							<line x1="16" y1="13" x2="8" y2="13"></line>
							<line x1="16" y1="17" x2="8" y2="17"></line>
						</svg>
					</div>
					<div class="st-single-lesson-meta">
						<span class="st-single-lesson-title" id="st-single-lesson-title">Lesson</span>
						<span class="st-single-lesson-file" id="st-single-lesson-file">file.md</span>
					</div>
					<span class="st-single-lesson-badge">ACTIVE</span>
				</div>
				<div class="st-single-lesson-body">
					<p id="st-single-lesson-desc" class="st-single-lesson-desc">Previewing live in center viewport.</p>
				</div>
			</div>
		`;
		const file = currentTargetFile || activeLessonFile || "lesson.md";
		const title =
			(currentLessonFrontmatter.title as string) || file.replace(/\.md$/, "");
		const desc =
			(currentLessonFrontmatter.description as string) ||
			"Previewing live in center viewport.";

		const singleTitle = $("st-single-lesson-title");
		const singleFile = $("st-single-lesson-file");
		const singleDesc = $("st-single-lesson-desc");

		if (singleTitle) singleTitle.textContent = title;
		if (singleFile) singleFile.textContent = file;
		if (singleDesc) singleDesc.textContent = desc;
	}

	syncInspectorContext();
}

function renderLessonFrontmatter() {
	const titleInput = $<HTMLInputElement>("st-lesson-title");
	const descInput = $<HTMLTextAreaElement>("st-lesson-desc");
	const authorInput = $<HTMLInputElement>("st-lesson-author");
	const tagsInput = $<HTMLInputElement>("st-lesson-tags");

	if (titleInput && document.activeElement !== titleInput) {
		titleInput.value = (currentLessonFrontmatter.title as string) || "";
	}
	if (descInput && document.activeElement !== descInput) {
		descInput.value = (currentLessonFrontmatter.description as string) || "";
	}
	if (authorInput && document.activeElement !== authorInput) {
		authorInput.value = (currentLessonFrontmatter.author as string) || "";
	}
	if (tagsInput && document.activeElement !== tagsInput) {
		const tags = currentLessonFrontmatter.tags;
		tagsInput.value = Array.isArray(tags)
			? tags.join(", ")
			: (tags as string) || "";
	}
}

function queueFrontmatterSave() {
	setStatus("unsaved");
	const target = activeLessonFile || currentTargetFile || undefined;
	if (!target) return;

	const title = $<HTMLInputElement>("st-lesson-title")?.value;
	const description = $<HTMLTextAreaElement>("st-lesson-desc")?.value;
	const author = $<HTMLInputElement>("st-lesson-author")?.value;
	const tagsRaw = $<HTMLInputElement>("st-lesson-tags")?.value;
	const tags = tagsRaw
		? tagsRaw
				.split(",")
				.map((t) => t.trim())
				.filter(Boolean)
		: [];

	pendingFrontmatterSave = {
		target,
		title,
		description,
		author,
		tags,
	};

	if (frontmatterDebounceTimer) clearTimeout(frontmatterDebounceTimer);
	frontmatterDebounceTimer = setTimeout(async () => {
		await flushPendingFrontmatterSave();
	}, 600);
}

async function flushPendingFrontmatterSave() {
	if (!pendingFrontmatterSave) return;
	if (frontmatterDebounceTimer) {
		clearTimeout(frontmatterDebounceTimer);
		frontmatterDebounceTimer = null;
	}

	const savePayload = pendingFrontmatterSave;
	pendingFrontmatterSave = null;

	setStatus("saving");
	try {
		const res = await fetch("/__api/lesson/frontmatter", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				file: savePayload.target,
				title: savePayload.title,
				description: savePayload.description,
				author: savePayload.author,
				tags: savePayload.tags,
			}),
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = await res.json();
		if (
			activeLessonFile === savePayload.target ||
			(!activeLessonFile && currentTargetFile === savePayload.target)
		) {
			currentLessonFrontmatter = data.frontmatter || {};
		}

		if (studioMode === "single") {
			const headerTitle = $("st-header-title");
			if (headerTitle && savePayload.title) {
				headerTitle.textContent = savePayload.title;
			}
			renderSingleFileView();
		} else if (savePayload.target && savePayload.title) {
			const matchingCard = document.querySelector(
				`.st-lesson-card[data-file="${savePayload.target}"] .st-card-title`,
			);
			if (matchingCard) {
				matchingCard.textContent = savePayload.title;
			}
		}
		setStatus("saved");
	} catch (err) {
		console.error("Failed to save frontmatter:", err);
		setStatus("unsaved", "Save failed");
	}
}

function attachLessonSortable(card: HTMLElement, fromIndex: number) {
	let startX = 0;
	let startY = 0;
	let hasStartedDrag = false;
	let ghost: HTMLElement | null = null;
	let placeholder: HTMLElement | null = null;
	let grabOffsetX = 0;
	let grabOffsetY = 0;
	let initialCardRect: DOMRect | null = null;

	const onPointerDown = (e: PointerEvent) => {
		if (e.button !== 0) return;
		if ((e.target as HTMLElement).closest(".st-card-actions")) return;

		startX = e.clientX;
		startY = e.clientY;
		hasStartedDrag = false;

		const isHandle = Boolean(
			(e.target as HTMLElement).closest(".st-card-drag"),
		);
		const dragThreshold = isHandle ? 2 : 5;

		const onPointerMove = (moveEv: PointerEvent) => {
			if (!hasStartedDrag) {
				const dist = Math.hypot(
					moveEv.clientX - startX,
					moveEv.clientY - startY,
				);
				if (dist < dragThreshold) return;

				hasStartedDrag = true;
				isDraggingLesson = true;

				const container = $("st-lesson-list");
				if (!container) return;

				initialCardRect = card.getBoundingClientRect();
				grabOffsetX = startX - initialCardRect.left;
				grabOffsetY = startY - initialCardRect.top;

				placeholder = document.createElement("div");
				placeholder.className = "st-lesson-slot-placeholder";
				placeholder.style.height = `${initialCardRect.height}px`;

				ghost = card.cloneNode(true) as HTMLElement;
				ghost.className = "st-lesson-card-floating";
				ghost.style.width = `${initialCardRect.width}px`;
				ghost.style.height = `${initialCardRect.height}px`;
				ghost.style.transform = `translate3d(${initialCardRect.left}px, ${initialCardRect.top}px, 0) scale(1.02)`;
				document.body.appendChild(ghost);

				card.after(placeholder);
				card.classList.add("is-drag-origin");

				try {
					card.setPointerCapture(moveEv.pointerId);
				} catch {
					// safe fallback
				}
			}

			if (hasStartedDrag && ghost && placeholder) {
				moveEv.preventDefault();

				const currentX = moveEv.clientX - grabOffsetX;
				const currentY = moveEv.clientY - grabOffsetY;
				ghost.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) scale(1.02)`;

				const container = $("st-lesson-list");
				if (container) {
					const cRect = container.getBoundingClientRect();
					const zone = 40;
					if (moveEv.clientY < cRect.top + zone && container.scrollTop > 0) {
						container.scrollTop -= 6;
					} else if (moveEv.clientY > cRect.bottom - zone) {
						container.scrollTop += 6;
					}

					const ghostCenterY = currentY + (initialCardRect?.height || 42) / 2;
					const siblings = (
						Array.from(container.children) as HTMLElement[]
					).filter(
						(el) =>
							el !== placeholder &&
							el !== card &&
							el.classList.contains("st-lesson-card"),
					);

					let targetNode: HTMLElement | null = null;
					for (const sibling of siblings) {
						const sRect = sibling.getBoundingClientRect();
						const sMid = sRect.top + sRect.height / 2;
						if (ghostCenterY < sMid) {
							targetNode = sibling;
							break;
						}
					}

					const currentNext = placeholder.nextElementSibling;
					if (targetNode !== currentNext) {
						const firstRects = new Map<HTMLElement, DOMRect>();
						for (const s of siblings) {
							firstRects.set(s, s.getBoundingClientRect());
						}

						if (targetNode) {
							container.insertBefore(placeholder, targetNode);
						} else {
							container.appendChild(placeholder);
						}

						for (const s of siblings) {
							const first = firstRects.get(s);
							if (!first) continue;
							const last = s.getBoundingClientRect();
							const deltaY = first.top - last.top;
							if (Math.abs(deltaY) > 0.5) {
								s.style.transition = "none";
								s.style.transform = `translateY(${deltaY}px)`;
							}
						}

						requestAnimationFrame(() => {
							for (const s of siblings) {
								s.style.transition =
									"transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)";
								s.style.transform = "";
							}
						});
					}
				}
			}
		};

		const onPointerUp = (upEv: PointerEvent) => {
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerup", onPointerUp);
			window.removeEventListener("pointercancel", onPointerUp);

			try {
				card.releasePointerCapture(upEv.pointerId);
			} catch {
				// safe fallback
			}

			if (!hasStartedDrag) {
				return;
			}

			const container = $("st-lesson-list");
			if (!container || !ghost || !placeholder) {
				cleanup();
				return;
			}

			const destRect = placeholder.getBoundingClientRect();
			ghost.style.transition =
				"transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s ease";
			ghost.style.transform = `translate3d(${destRect.left}px, ${destRect.top}px, 0) scale(1)`;
			ghost.style.boxShadow = "none";

			const children = Array.from(container.children) as HTMLElement[];
			const visibleSlots = children.filter(
				(el) =>
					el === placeholder ||
					(el !== card && el.classList.contains("st-lesson-card")),
			);
			const newIndex = visibleSlots.indexOf(placeholder);

			setTimeout(() => {
				cleanup();

				if (newIndex >= 0 && newIndex !== fromIndex) {
					const list = [...(currentConfig.lessons || [])];
					const [moved] = list.splice(fromIndex, 1);
					list.splice(newIndex, 0, moved);
					currentConfig.lessons = list;
					renderCurriculum();
					saveConfig();
				}

				setTimeout(() => {
					isDraggingLesson = false;
				}, 60);
			}, 190);
		};

		const cleanup = () => {
			if (ghost?.parentElement) ghost.remove();
			if (placeholder?.parentElement) placeholder.remove();
			card.classList.remove("is-drag-origin");
			card.style.display = "";
			const container = $("st-lesson-list");
			if (container) {
				Array.from(container.children).forEach((child) => {
					(child as HTMLElement).style.transform = "";
					(child as HTMLElement).style.transition = "";
				});
			}
		};

		window.addEventListener("pointermove", onPointerMove);
		window.addEventListener("pointerup", onPointerUp);
		window.addEventListener("pointercancel", onPointerUp);
	};

	card.addEventListener("pointerdown", onPointerDown);
}

function renderCurriculum() {
	const container = $("st-lesson-list");
	const countPill = $("st-lesson-count-pill");
	if (!container) return;

	const prevScrollTop = container.scrollTop;
	const allLessons = currentConfig.lessons || [];

	if (countPill) {
		countPill.textContent = String(allLessons.length);
	}

	container.innerHTML = "";

	if (allLessons.length === 0) {
		container.innerHTML = `
      <div class="st-empty-state">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
        <span>No lessons yet</span>
        <p>Create a lesson to get started.</p>
      </div>`;
		return;
	}

	const query = lessonSearchQuery.trim().toLowerCase();

	allLessons.forEach((entry, idx) => {
		const file = typeof entry === "string" ? entry : entry.file;
		const title =
			typeof entry === "string" ? formatFileAsTitle(file) : entry.title || file;

		if (
			query &&
			!title.toLowerCase().includes(query) &&
			!file.toLowerCase().includes(query)
		) {
			return;
		}

		const formattedNum = String(idx + 1).padStart(2, "0");
		const isActive = file === activeLessonFile;

		const card = document.createElement("div");
		card.className = `st-lesson-card ${isActive ? "active" : ""}`.trim();
		const canDrag = !query;
		card.dataset.index = String(idx);
		card.dataset.file = file;

		card.innerHTML = `
      <div class="st-card-left">
        <span class="st-card-drag" title="${canDrag ? "Drag to reorder" : "Reordering disabled while searching"}">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="8" cy="5" r="2.2"/><circle cx="16" cy="5" r="2.2"/>
            <circle cx="8" cy="12" r="2.2"/><circle cx="16" cy="12" r="2.2"/>
            <circle cx="8" cy="19" r="2.2"/><circle cx="16" cy="19" r="2.2"/>
          </svg>
        </span>
        <span class="st-card-num">${formattedNum}</span>
        <div class="st-card-text">
          <span class="st-card-title">${escapeHtml(title)}</span>
        </div>
      </div>
      <div class="st-card-actions">
        <a class="st-card-btn" href="/${slugifyFileName(file)}.html" target="_blank" title="Open lesson in new tab">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        </a>
        <button class="st-card-btn danger st-remove-btn" title="Remove lesson">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    `;

		// Select lesson without snapping the camera
		card.addEventListener("click", (e) => {
			if (isDraggingLesson) return;
			if ((e.target as HTMLElement).closest(".st-card-actions")) return;
			updateLiveViewport(file);
		});

		// Double-click to select AND smoothly glide camera to desktop course
		card.addEventListener("dblclick", (e) => {
			if (isDraggingLesson) return;
			if ((e.target as HTMLElement).closest(".st-card-actions")) return;
			updateLiveViewport(file);
			scrollToSlab("course");
		});

		// Fluid pointer-based sortable drag with dynamic gap creation
		if (canDrag) {
			attachLessonSortable(card, idx);
		}

		// Remove lesson
		card.querySelector(".st-remove-btn")?.addEventListener("click", (e) => {
			e.stopPropagation();
			const list = [...(currentConfig.lessons || [])];
			const removed = list.splice(idx, 1)[0];
			currentConfig.lessons = list;

			const fileName = typeof removed === "string" ? removed : removed.file;
			if (!unassignedFiles.includes(fileName)) {
				unassignedFiles.push(fileName);
			}

			if (activeLessonFile === fileName) {
				if (list.length > 0) {
					const next = list[0];
					activeLessonFile = typeof next === "string" ? next : next.file;
				} else {
					activeLessonFile = "";
				}
				updateLiveViewport();
			}

			renderCurriculum();
			renderUnassigned();
			saveConfig();
		});

		container.appendChild(card);
	});

	container.scrollTop = prevScrollTop;
}

function renderUnassigned() {
	const panel = $("st-unassigned-panel");
	const container = $("st-unassigned-list");
	const countPill = $("st-unassigned-count-pill");
	if (!panel || !container) return;

	if (countPill) {
		countPill.textContent = String(unassignedFiles.length);
	}

	if (unassignedFiles.length === 0) {
		panel.style.display = "none";
		return;
	}

	panel.style.display = "block";
	container.innerHTML = "";

	unassignedFiles.forEach((file) => {
		const chip = document.createElement("div");
		chip.className = "st-unassigned-chip";
		chip.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
      <span>${escapeHtml(file)}</span>
      <button type="button" class="st-chip-add-btn" title="Add to lessons">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </button>
    `;

		chip.querySelector("button")?.addEventListener("click", () => {
			currentConfig.lessons = [...(currentConfig.lessons || []), file];
			unassignedFiles = unassignedFiles.filter((f) => f !== file);
			renderCurriculum();
			renderUnassigned();
			saveConfig();
		});

		container.appendChild(chip);
	});
}

function updateCourseTitles(val: string) {
	const crumb = $("st-header-title");
	if (crumb) crumb.textContent = val || "Interactive Course";

	const homeTitle = $("st-course-home-title");
	if (homeTitle) homeTitle.textContent = val || "Course Home";

	const slabTitle = $("st-curriculum-course-title");
	if (slabTitle) slabTitle.textContent = val || "";
}

function renderMetadata() {
	const titleInput = $<HTMLInputElement>("st-meta-title");
	const descInput = $<HTMLTextAreaElement>("st-meta-desc");
	const authorInput = $<HTMLInputElement>("st-meta-author");

	if (titleInput && document.activeElement !== titleInput) {
		titleInput.value = currentConfig.title || "";
	}
	if (descInput && document.activeElement !== descInput) {
		descInput.value = currentConfig.description || "";
	}
	if (authorInput && document.activeElement !== authorInput) {
		authorInput.value = currentConfig.author || "";
	}

	updateCourseTitles(currentConfig.title || "");
}

function renderThemeMode() {
	const mode = currentConfig.theme || "auto";
	document
		.querySelectorAll<HTMLButtonElement>("#st-theme-mode button")
		.forEach((btn) => {
			if (btn.dataset.value === mode) {
				btn.classList.add("active");
			} else {
				btn.classList.remove("active");
			}
		});
}

function renderUiMode() {
	const ui = currentConfig.ui || "standard";
	document
		.querySelectorAll<HTMLButtonElement>("#st-ui-mode button")
		.forEach((btn) => {
			if (btn.dataset.value === ui) {
				btn.classList.add("active");
			} else {
				btn.classList.remove("active");
			}
		});
}

function renderPalettes() {
	const container = $("st-builtin-palettes");
	if (!container) return;

	container.innerHTML = "";
	const active = currentConfig.palette || "ink";

	// 1. Builtin Palettes
	const builtinDefs = [
		{ key: "ink", name: "Ink", hex: "#2563eb" },
		{ key: "field", name: "Field", hex: "#0d9488" },
		{ key: "ember", name: "Ember", hex: "#ea580c" },
		{ key: "elixir", name: "Elixir", hex: "#a855f7" },
		{ key: "trunk", name: "Trunk", hex: "#d97706" },
		{ key: "lava", name: "Lava", hex: "#ef4444" },
	];

	let activeElement: HTMLElement | null = null;

	builtinDefs.forEach((p) => {
		const card = document.createElement("div");
		card.className = `st-swatch-card ${p.key === active ? "active" : ""}`;
		card.dataset.palette = p.key;
		card.style.setProperty("--swatch-color", p.hex);
		card.innerHTML = `
			<div class="st-swatch-disc"></div>
			<div class="st-swatch-info">
				<span class="st-swatch-name">${p.name}</span>
				<span class="st-swatch-hex">${p.hex}</span>
			</div>
			<div class="st-swatch-check">
				<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
			</div>
		`;

		card.addEventListener("click", () => {
			currentConfig.palette = p.key;
			localStorage.setItem("bk-palette", p.key);
			renderPalettes();
			broadcastAppearanceChange();
			saveConfig();
		});

		if (p.key === active) {
			activeElement = card;
		}

		container.appendChild(card);
	});

	// 2. Custom Palettes
	const customPalettes = currentConfig.customPalettes || {};
	const customKeys = Object.keys(customPalettes);

	customKeys.forEach((key) => {
		const p = customPalettes[key];
		const card = document.createElement("div");
		card.className = `st-swatch-card custom ${key === active ? "active" : ""}`;
		card.dataset.palette = key;
		card.style.setProperty("--swatch-color", p.accent);

		card.innerHTML = `
			<div class="st-swatch-disc" style="--swatch-color: ${escapeHtml(p.accent)};"></div>
			<div class="st-swatch-info">
				<span class="st-swatch-name">${escapeHtml(p.name || key)}</span>
				<span class="st-swatch-hex">${escapeHtml(p.accent)}</span>
			</div>
			<div class="st-swatch-check">
				<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
			</div>
			<div class="st-swatch-actions">
				<button type="button" class="st-card-btn-mini st-edit-palette-btn" title="Edit palette" aria-label="Edit palette">
					<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
				</button>
				<button type="button" class="st-card-btn-mini danger st-delete-palette-btn" title="Delete palette" aria-label="Delete palette">
					<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
				</button>
			</div>
		`;

		card.addEventListener("click", (e) => {
			if ((e.target as HTMLElement).closest("button")) return;
			currentConfig.palette = key;
			localStorage.setItem("bk-palette", key);
			renderPalettes();
			broadcastAppearanceChange();
			saveConfig();
		});

		card
			.querySelector(".st-edit-palette-btn")
			?.addEventListener("click", (e) => {
				e.stopPropagation();
				openCustomThemeModal(key, p);
			});

		card
			.querySelector(".st-delete-palette-btn")
			?.addEventListener("click", (e) => {
				e.stopPropagation();
				pendingDeleteThemeKey = key;
				const deleteModal = $("st-modal-confirm-delete");
				const deleteMsg = $("st-delete-confirm-msg");
				if (deleteMsg) {
					const themeName = p.name || key;
					deleteMsg.textContent = `Are you sure you want to delete "${themeName}"? This action cannot be undone.`;
				}
				if (deleteModal) deleteModal.style.display = "flex";
			});

		if (key === active) {
			activeElement = card;
		}

		container.appendChild(card);
	});

	// 3. Add Custom Palette Slot ("+")
	const addSlot = document.createElement("button");
	addSlot.type = "button";
	addSlot.className = "st-swatch-slot empty";
	addSlot.title = "Add custom palette";
	addSlot.setAttribute("aria-label", "Add custom palette");
	addSlot.innerHTML = `
		<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
	`;
	addSlot.addEventListener("click", () => {
		openCustomThemeModal();
	});
	container.appendChild(addSlot);

	// Update palette count pill in section header
	const countPill = $("st-palette-count-pill");
	if (countPill) {
		countPill.textContent = String(builtinDefs.length + customKeys.length);
	}

	// Auto-scroll active card into view inside the palette viewport only (never scroll the outer canvas)
	const vp = $("st-palette-scroll-viewport");
	if (activeElement && vp) {
		const cardTop = (activeElement as HTMLElement).offsetTop;
		const cardBottom = cardTop + (activeElement as HTMLElement).offsetHeight;
		if (cardTop < vp.scrollTop) {
			vp.scrollTop = cardTop;
		} else if (cardBottom > vp.scrollTop + vp.clientHeight) {
			vp.scrollTop = cardBottom - vp.clientHeight;
		}
	}

	requestAnimationFrame(() => {
		updatePaletteScrollIndicators();
	});
}

function updatePaletteScrollIndicators() {
	const vp = $("st-palette-scroll-viewport");
	const container = $("st-palette-scroll-container");
	const track = $("st-palette-scrollbar");
	const thumb = $("st-palette-scrollbar-thumb");
	if (!vp || !container) return;

	const scrollHeight = vp.scrollHeight;
	const clientHeight = vp.clientHeight;
	const maxScroll = scrollHeight - clientHeight;
	const hasOverflow = maxScroll > 2;

	container.classList.toggle("has-overflow", hasOverflow);
	container.classList.toggle(
		"can-scroll-down",
		hasOverflow && vp.scrollTop < maxScroll - 4,
	);
	container.classList.toggle("can-scroll-up", hasOverflow && vp.scrollTop > 4);

	if (!track || !thumb) return;

	if (!hasOverflow) {
		thumb.style.height = "0px";
		return;
	}

	const trackHeight = track.clientHeight;
	if (trackHeight <= 0) return;

	const visibleRatio = clientHeight / scrollHeight;
	const thumbHeight = Math.max(
		26,
		Math.min(trackHeight * visibleRatio, trackHeight - 12),
	);
	thumb.style.height = `${thumbHeight}px`;

	const maxThumbTravel = trackHeight - thumbHeight;
	const scrollRatio = maxScroll > 0 ? vp.scrollTop / maxScroll : 0;
	const thumbTop = Math.max(
		0,
		Math.min(scrollRatio * maxThumbTravel, maxThumbTravel),
	);
	thumb.style.transform = `translateY(${thumbTop}px)`;
}

// ── Universal Input Editing Detection & Shortcuts ──────────────────────────

function isEditingActive(e?: KeyboardEvent | Event): boolean {
	const checkElement = (el: HTMLElement | null | undefined): boolean => {
		if (!el) return false;
		const tag = el.tagName?.toUpperCase();
		if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
			return true;
		}
		if (el.isContentEditable) {
			return true;
		}
		if (
			typeof el.closest === "function" &&
			el.closest("input, textarea, select, [contenteditable='true']")
		) {
			return true;
		}
		return false;
	};

	if (checkElement(e?.target as HTMLElement)) {
		return true;
	}

	if (checkElement(document.activeElement as HTMLElement)) {
		return true;
	}

	const iframe = $<HTMLIFrameElement>("st-course-iframe");
	try {
		if (checkElement(iframe?.contentDocument?.activeElement as HTMLElement)) {
			return true;
		}
	} catch {}

	return false;
}

function handleGlobalKeydown(e: KeyboardEvent) {
	const isKey1 = e.key === "1" || e.code === "Digit1" || e.code === "Numpad1";
	const isKey2 = e.key === "2" || e.code === "Digit2" || e.code === "Numpad2";
	const isKey3 = e.key === "3" || e.code === "Digit3" || e.code === "Numpad3";

	// Escape key: clears focus from active inputs so 1/2/3 spatial navigation can resume immediately
	if (e.key === "Escape") {
		if (isEditingActive(e)) {
			(document.activeElement as HTMLElement)?.blur?.();
			try {
				const iframe = $<HTMLIFrameElement>("st-course-iframe");
				(iframe?.contentDocument?.activeElement as HTMLElement)?.blur?.();
			} catch {}
		}
		return;
	}

	// Alt / Option + 1, 2, 3: Power shortcut that always jumps to the slab, even if editing
	if (e.altKey && !e.metaKey && !e.ctrlKey) {
		if (isKey1) {
			e.preventDefault();
			scrollToSlab("curriculum");
			return;
		}
		if (isKey2) {
			e.preventDefault();
			scrollToSlab("course");
			return;
		}
		if (isKey3) {
			e.preventDefault();
			scrollToSlab("design");
			return;
		}
	}

	const isEditing = isEditingActive(e);

	// Cmd/Ctrl + K focuses search (when not actively inside a field)
	if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !isEditing) {
		e.preventDefault();
		$("st-lesson-search")?.focus();
		return;
	}

	// If editing is active or modifier keys (Cmd, Ctrl, Alt) are pressed, ignore bare keys
	// This guarantees numbers like "10", "3.14", or "2026" typed in any field NEVER cause camera jumps!
	if (isEditing || e.metaKey || e.ctrlKey || e.altKey) {
		return;
	}

	if (isKey1) {
		e.preventDefault();
		scrollToSlab("curriculum");
	} else if (isKey2) {
		e.preventDefault();
		scrollToSlab("course");
	} else if (isKey3) {
		e.preventDefault();
		scrollToSlab("design");
	} else if (e.key === "/") {
		e.preventDefault();
		$("st-lesson-search")?.focus();
	}
}

// ── Event Wiring ───────────────────────────────────────────────────────────

function wireEvents() {
	// Niri Ribbon Slab Navigation Buttons
	document.querySelectorAll(".st-nav-slab-btn").forEach((btn) => {
		btn.addEventListener("click", () => {
			const target = (btn as HTMLElement).dataset.target as
				| "curriculum"
				| "course"
				| "design";
			if (target) {
				scrollToSlab(target);
			}
		});
	});

	// Canvas scroll sync with segmented nav buttons
	const canvas = $("st-infinite-canvas");
	if (canvas) {
		let scrollRaf: number | null = null;
		let scrollSettleTimer: ReturnType<typeof setTimeout> | null = null;
		canvas.addEventListener(
			"scroll",
			() => {
				canvas.classList.add("is-scrolling");
				if (scrollSettleTimer) clearTimeout(scrollSettleTimer);
				scrollSettleTimer = setTimeout(() => {
					canvas.classList.remove("is-scrolling");
				}, 120);

				if (scrollRaf) cancelAnimationFrame(scrollRaf);
				scrollRaf = requestAnimationFrame(() => {
					syncNavButtons();
				});
			},
			{ passive: true },
		);

		// Synchronize active nav button when magnetic snap docking settles
		canvas.addEventListener(
			"scrollend",
			() => {
				canvas.classList.remove("is-scrolling");
				syncNavButtons();
			},
			{ passive: true },
		);
	}

	// Course Home / Landing Page Card
	const homeCard = $("st-course-home-card");
	if (homeCard) {
		homeCard.addEventListener("click", (e) => {
			if ((e.target as HTMLElement).closest(".st-card-actions")) return;
			updateLiveViewport("");
		});
		homeCard.addEventListener("dblclick", (e) => {
			if ((e.target as HTMLElement).closest(".st-card-actions")) return;
			updateLiveViewport("");
			scrollToSlab("course");
		});
	}

	// Live preview iframe navigation listener (sync URL & active card without moving canvas)
	const iframe = $<HTMLIFrameElement>("st-course-iframe");
	const wireIframeWindow = () => {
		try {
			if (!iframe?.contentWindow) return;
			const win = iframe.contentWindow;

			// Forward keyboard shortcuts
			win.removeEventListener("keydown", handleGlobalKeydown);
			win.addEventListener("keydown", handleGlobalKeydown);

			// Listen for PJAX and navigation events from iframe
			const onNav = () => syncIframeUrl();
			win.removeEventListener("bk-page-loaded", onNav);
			win.addEventListener("bk-page-loaded", onNav);
			win.removeEventListener("popstate", onNav);
			win.addEventListener("popstate", onNav);
			win.removeEventListener("hashchange", onNav);
			win.addEventListener("hashchange", onNav);

			// Intercept pushState and replaceState in iframe history
			try {
				const winWithMarker = win as unknown as {
					__mrmd_history_wired?: boolean;
				};
				if (!winWithMarker.__mrmd_history_wired) {
					const origPush = win.history.pushState.bind(win.history);
					win.history.pushState = (
						...args: Parameters<History["pushState"]>
					) => {
						const res = origPush(...args);
						syncIframeUrl();
						return res;
					};
					const origReplace = win.history.replaceState.bind(win.history);
					win.history.replaceState = (
						...args: Parameters<History["replaceState"]>
					) => {
						const res = origReplace(...args);
						syncIframeUrl();
						return res;
					};
					winWithMarker.__mrmd_history_wired = true;
				}
			} catch {}
		} catch {}
	};

	if (iframe) {
		iframe.addEventListener("load", () => {
			wireIframeWindow();
			syncIframeUrl();
			syncAppearanceToIframe();
		});
	}

	// Listen for postMessage from client router
	window.addEventListener("message", (e) => {
		if (e.data?.type === "mrmd-route-change") {
			syncIframeUrl(e.data.url || e.data.path);
		}
	});

	// Polling fallback to guarantee URL is always fresh across PJAX/history navigations
	setInterval(() => {
		syncIframeUrl();
	}, 400);

	// Keyboard navigation shortcuts (1: Curriculum, 2: Course, 3: Design)
	window.addEventListener("keydown", handleGlobalKeydown);
	wireIframeWindow();

	// Window resize: recompute detents and active nav button
	window.addEventListener("resize", () => {
		updateCachedDetents();
		syncNavButtons();
	});

	// Viewport reload button
	$("st-btn-reload-frame")?.addEventListener("click", () => {
		const iframe = $<HTMLIFrameElement>("st-course-iframe");
		if (iframe?.contentWindow) {
			iframe.contentWindow.location.reload();
		}
	});

	// URL Capsule click-to-copy
	const capsule = $("st-url-capsule");
	const toast = $("st-copy-toast");
	let copyTimer: ReturnType<typeof setTimeout> | null = null;
	capsule?.addEventListener("click", async () => {
		const urlText = $("st-viewport-url")?.textContent;
		if (urlText && navigator.clipboard) {
			try {
				await navigator.clipboard.writeText(urlText);
				if (toast) {
					toast.classList.add("show");
					capsule.classList.add("copied");
					if (copyTimer) clearTimeout(copyTimer);
					copyTimer = setTimeout(() => {
						toast.classList.remove("show");
						capsule.classList.remove("copied");
					}, 1500);
				}
			} catch (err) {
				console.error("Failed to copy URL:", err);
			}
		}
	});

	// Lesson search input (debounced with rAF)
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	$("st-lesson-search")?.addEventListener("input", (e) => {
		lessonSearchQuery = (e.target as HTMLInputElement).value;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			requestAnimationFrame(() => {
				renderCurriculum();
			});
		}, 60);
	});

	// Metadata inputs
	$("st-meta-title")?.addEventListener("input", (e) => {
		const val = (e.target as HTMLInputElement).value;
		currentConfig.title = val;
		updateCourseTitles(val);
		queueSave();
	});
	$("st-meta-desc")?.addEventListener("input", (e) => {
		currentConfig.description = (e.target as HTMLTextAreaElement).value;
		queueSave();
	});
	$("st-meta-author")?.addEventListener("input", (e) => {
		currentConfig.author = (e.target as HTMLInputElement).value;
		queueSave();
	});

	// Immediate save on blur / change
	["st-meta-title", "st-meta-desc", "st-meta-author"].forEach((id) => {
		$(id)?.addEventListener("change", () => {
			if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
			saveConfig();
		});
	});

	// Theme mode segmented control
	document.querySelectorAll("#st-theme-mode button").forEach((btn) => {
		btn.addEventListener("click", () => {
			const val = (btn as HTMLElement).dataset.value as
				| "light"
				| "dark"
				| "auto";
			currentConfig.theme = val;
			localStorage.setItem("bk-theme", val);
			renderThemeMode();
			broadcastAppearanceChange();
			saveConfig();
		});
	});

	// UI style segmented control
	document.querySelectorAll("#st-ui-mode button").forEach((btn) => {
		btn.addEventListener("click", () => {
			const val = (btn as HTMLElement).dataset.value as
				| "standard"
				| "neo"
				| "playful";
			currentConfig.ui = val;
			localStorage.setItem("bk-ui", val);
			renderUiMode();
			broadcastAppearanceChange();
			saveConfig();
		});
	});

	// Fancy custom palette scrollbar wiring
	const paletteVp = $("st-palette-scroll-viewport");
	const paletteTrack = $("st-palette-scrollbar");
	const paletteThumb = $("st-palette-scrollbar-thumb");

	paletteVp?.addEventListener("scroll", updatePaletteScrollIndicators, {
		passive: true,
	});

	if (paletteTrack && paletteThumb && paletteVp) {
		let isDraggingThumb = false;
		let dragStartY = 0;
		let dragStartScrollTop = 0;

		paletteThumb.addEventListener("pointerdown", (e) => {
			isDraggingThumb = true;
			paletteTrack.classList.add("is-dragging");
			paletteThumb.setPointerCapture(e.pointerId);
			dragStartY = e.clientY;
			dragStartScrollTop = paletteVp.scrollTop;
			e.preventDefault();
		});

		paletteThumb.addEventListener("pointermove", (e) => {
			if (!isDraggingThumb) return;
			const deltaY = e.clientY - dragStartY;
			const trackHeight = paletteTrack.clientHeight;
			const thumbHeight = paletteThumb.clientHeight;
			const maxThumbTravel = trackHeight - thumbHeight;
			const maxScroll = paletteVp.scrollHeight - paletteVp.clientHeight;
			if (maxThumbTravel > 0 && maxScroll > 0) {
				const scrollDelta = (deltaY / maxThumbTravel) * maxScroll;
				paletteVp.scrollTop = dragStartScrollTop + scrollDelta;
			}
		});

		const stopThumbDrag = (e: PointerEvent) => {
			if (isDraggingThumb) {
				isDraggingThumb = false;
				paletteTrack.classList.remove("is-dragging");
				try {
					paletteThumb.releasePointerCapture(e.pointerId);
				} catch {}
			}
		};

		paletteThumb.addEventListener("pointerup", stopThumbDrag);
		paletteThumb.addEventListener("pointercancel", stopThumbDrag);

		paletteTrack.addEventListener("pointerdown", (e) => {
			if (e.target === paletteThumb) return;
			const trackRect = paletteTrack.getBoundingClientRect();
			const clickY = e.clientY - trackRect.top;
			const trackHeight = trackRect.height;
			const thumbHeight = paletteThumb.clientHeight;
			const targetThumbTop = clickY - thumbHeight / 2;
			const maxThumbTravel = trackHeight - thumbHeight;
			if (maxThumbTravel > 0) {
				const ratio = Math.max(0, Math.min(targetThumbTop / maxThumbTravel, 1));
				const maxScroll = paletteVp.scrollHeight - paletteVp.clientHeight;
				paletteVp.scrollTo({ top: ratio * maxScroll, behavior: "smooth" });
			}
		});
	}

	window.addEventListener("resize", updatePaletteScrollIndicators, {
		passive: true,
	});

	// New Lesson modal
	const newLessonModal = $("st-modal-new-lesson");
	const newLessonInput = $<HTMLInputElement>("st-new-lesson-name");

	const openNewLessonModal = () => {
		if (!newLessonModal) return;
		if (newLessonInput) newLessonInput.value = "";
		newLessonModal.style.display = "flex";
		newLessonInput?.focus();
	};

	$("st-btn-new-lesson")?.addEventListener("click", openNewLessonModal);
	$("st-btn-single-new-lesson")?.addEventListener("click", openNewLessonModal);

	// Convert to Course Modal
	const convertCourseModal = $("st-modal-convert-course");
	const convertCourseInput = $<HTMLInputElement>("st-convert-course-name");
	const confirmConvertBtn = $<HTMLButtonElement>("st-btn-confirm-convert");
	const convertErrorEl = $("st-convert-error-msg");

	const closeConvertModal = () => {
		if (convertCourseModal) convertCourseModal.style.display = "none";
		if (convertCourseInput) {
			convertCourseInput.value = "";
			convertCourseInput.classList.remove("st-input-error");
		}
		if (convertErrorEl) {
			convertErrorEl.textContent = "";
			convertErrorEl.style.display = "none";
		}
		if (confirmConvertBtn) {
			confirmConvertBtn.disabled = true;
		}
	};

	$("st-modal-close-convert")?.addEventListener("click", closeConvertModal);

	$("st-btn-keep-independent")?.addEventListener("click", () => {
		closeConvertModal();
		fetchConfig();
	});

	convertCourseInput?.addEventListener("input", () => {
		const val = convertCourseInput.value.trim();
		if (confirmConvertBtn) {
			confirmConvertBtn.disabled = !val;
		}
		if (convertErrorEl && convertErrorEl.style.display !== "none") {
			convertErrorEl.textContent = "";
			convertErrorEl.style.display = "none";
			convertCourseInput.classList.remove("st-input-error");
		}
	});

	convertCourseInput?.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			if (!confirmConvertBtn?.disabled) {
				confirmConvertBtn?.click();
			}
		}
	});

	confirmConvertBtn?.addEventListener("click", async () => {
		const courseName = convertCourseInput?.value.trim() || "";
		if (!courseName) {
			if (convertErrorEl) {
				convertErrorEl.textContent = "Course name is required.";
				convertErrorEl.style.display = "block";
			}
			convertCourseInput?.classList.add("st-input-error");
			convertCourseInput?.focus();
			return;
		}

		setStatus("saving", "Converting to course...");
		try {
			const res = await fetch("/__api/course/convert", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ courseName }),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				const errMsg = data.error || "Failed to convert to course.";
				if (convertErrorEl) {
					convertErrorEl.textContent = errMsg;
					convertErrorEl.style.display = "block";
				}
				convertCourseInput?.classList.add("st-input-error");
				convertCourseInput?.focus();
				setStatus("unsaved", "Conversion blocked");
				return;
			}
			closeConvertModal();
			await fetchConfig();
			scrollToSlab("curriculum");
			setStatus("saved", "Converted to course");
		} catch (err) {
			console.error("Failed to convert to course:", err);
			const errMsg = err instanceof Error ? err.message : String(err);
			if (convertErrorEl) {
				convertErrorEl.textContent = errMsg;
				convertErrorEl.style.display = "block";
			}
			convertCourseInput?.classList.add("st-input-error");
			setStatus("unsaved", "Conversion failed");
		}
	});

	// Lesson frontmatter live inputs
	[
		"st-lesson-title",
		"st-lesson-desc",
		"st-lesson-author",
		"st-lesson-tags",
	].forEach((id) => {
		$(id)?.addEventListener("input", () => {
			queueFrontmatterSave();
		});
		$(id)?.addEventListener("change", () => {
			flushPendingFrontmatterSave();
		});
	});

	newLessonInput?.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			$("st-modal-confirm-lesson")?.click();
		}
	});

	$("st-modal-close-lesson")?.addEventListener("click", () => {
		if (newLessonModal) newLessonModal.style.display = "none";
		if (newLessonInput) newLessonInput.value = "";
	});
	$("st-modal-cancel-lesson")?.addEventListener("click", () => {
		if (newLessonModal) newLessonModal.style.display = "none";
		if (newLessonInput) newLessonInput.value = "";
	});

	$("st-modal-confirm-lesson")?.addEventListener("click", async () => {
		const rawName = newLessonInput?.value.trim();
		if (!rawName) return;

		setStatus("saving", "Creating...");
		try {
			const res = await fetch("/__api/lessons/new", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: rawName }),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			if (newLessonModal) newLessonModal.style.display = "none";
			await fetchConfig();
			if (data.file) {
				activeLessonFile = data.file;
				updateLiveViewport(data.file);
				await loadLessonFrontmatter(data.file);
			}
			setStatus("saved");

			// In single mode, offer visual choice: Convert to Course vs Keep Independent
			if (studioMode === "single") {
				openConvertCourseModal();
			}
		} catch (err) {
			console.error("Failed to create lesson:", err);
			setStatus("unsaved", "Failed");
		}
	});

	// Custom Theme Modal
	$("st-btn-new-theme")?.addEventListener("click", () => {
		openCustomThemeModal();
	});
	$("st-modal-close-theme")?.addEventListener("click", () => {
		const m = $("st-modal-custom-theme");
		if (m) m.style.display = "none";
	});
	$("st-modal-cancel-theme")?.addEventListener("click", () => {
		const m = $("st-modal-custom-theme");
		if (m) m.style.display = "none";
	});

	// Delete Theme Confirmation Modal
	const confirmDeleteModal = $("st-modal-confirm-delete");
	$("st-modal-close-delete")?.addEventListener("click", () => {
		if (confirmDeleteModal) confirmDeleteModal.style.display = "none";
		pendingDeleteThemeKey = null;
		scrollToSlab("design");
	});
	$("st-modal-cancel-delete")?.addEventListener("click", () => {
		if (confirmDeleteModal) confirmDeleteModal.style.display = "none";
		pendingDeleteThemeKey = null;
		scrollToSlab("design");
	});
	$("st-modal-confirm-delete-btn")?.addEventListener("click", () => {
		if (pendingDeleteThemeKey) {
			delete currentConfig.customPalettes?.[pendingDeleteThemeKey];
			if (currentConfig.palette === pendingDeleteThemeKey) {
				currentConfig.palette = "ink";
				localStorage.setItem("bk-palette", "ink");
			}
			pendingDeleteThemeKey = null;
			if (confirmDeleteModal) confirmDeleteModal.style.display = "none";
			renderPalettes();
			broadcastAppearanceChange();
			saveConfig();
			// Keep camera locked on the design/palette panel
			scrollToSlab("design");
		}
	});

	// Click outside modal backdrop
	[
		newLessonModal,
		convertCourseModal,
		$("st-modal-custom-theme"),
		confirmDeleteModal,
	].forEach((modal) => {
		modal?.addEventListener("click", (e) => {
			if (e.target === modal) {
				if (modal === convertCourseModal) {
					closeConvertModal();
				} else {
					modal.style.display = "none";
					if (modal === newLessonModal && newLessonInput) {
						newLessonInput.value = "";
					}
					if (modal === confirmDeleteModal) pendingDeleteThemeKey = null;
				}
			}
		});
	});

	// Escape key to dismiss modals
	window.addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			if (newLessonModal) {
				newLessonModal.style.display = "none";
				if (newLessonInput) newLessonInput.value = "";
			}
			if (convertCourseModal) closeConvertModal();
			const customModal = $("st-modal-custom-theme");
			if (customModal) customModal.style.display = "none";
			if (confirmDeleteModal) {
				confirmDeleteModal.style.display = "none";
				pendingDeleteThemeKey = null;
			}
		}
	});

	// Flush debounced saves on window unload
	window.addEventListener("beforeunload", () => {
		if (saveDebounceTimer) {
			clearTimeout(saveDebounceTimer);
			saveDebounceTimer = null;
			try {
				navigator.sendBeacon(
					"/__api/config",
					new Blob([JSON.stringify(currentConfig)], {
						type: "application/json",
					}),
				);
			} catch {}
		}
	});

	wireCustomThemeInputs();
}

function openCustomThemeModal(key?: string, existing?: CustomPalette) {
	const modal = $("st-modal-custom-theme");
	const titleEl = $("st-theme-modal-title");
	const nameInput = $<HTMLInputElement>("st-theme-name");

	editingCustomPaletteKey = key || null;

	if (titleEl) {
		titleEl.textContent = key ? "Edit Custom Palette" : "New Custom Palette";
	}

	if (existing) {
		if (nameInput) nameInput.value = existing.name || key || "";
		setPickerColor("st-theme-accent", existing.accent || "#3b82f6");
		setPickerColor("st-theme-light-bg", existing.light?.bg || "#f8fafc");
		setPickerColor("st-theme-light-paper", existing.light?.paper || "#ffffff");
		setPickerColor("st-theme-dark-bg", existing.dark?.bg || "#090a0f");
		setPickerColor("st-theme-dark-paper", existing.dark?.paper || "#121620");
	} else {
		if (nameInput) nameInput.value = "";
		setPickerColor("st-theme-accent", "#3b82f6");
		setPickerColor("st-theme-light-bg", "#f8fafc");
		setPickerColor("st-theme-light-paper", "#ffffff");
		setPickerColor("st-theme-dark-bg", "#090a0f");
		setPickerColor("st-theme-dark-paper", "#121620");
	}

	if (modal) {
		modal.style.display = "flex";
		nameInput?.focus();
	}
}

function wireCustomThemeInputs() {
	const pairs = [
		"st-theme-accent",
		"st-theme-light-bg",
		"st-theme-light-paper",
		"st-theme-dark-bg",
		"st-theme-dark-paper",
	];

	pairs.forEach((id) => {
		const colorEl = $<HTMLInputElement>(`${id}-color`);
		const textEl = $<HTMLInputElement>(`${id}-text`);

		colorEl?.addEventListener("input", () => {
			if (textEl) textEl.value = colorEl.value;
		});

		textEl?.addEventListener("input", () => {
			if (colorEl && /^#[0-9a-f]{6}$/i.test(textEl.value)) {
				colorEl.value = textEl.value;
			}
		});
	});

	$("st-theme-name")?.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			$("st-modal-save-theme")?.click();
		}
	});

	$("st-modal-save-theme")?.addEventListener("click", () => {
		const nameInput = $<HTMLInputElement>("st-theme-name");
		const rawName = nameInput?.value.trim() || "Custom Palette";
		let key = editingCustomPaletteKey;
		if (!key) {
			const baseSlug =
				rawName
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, "-")
					.replace(/(^-|-$)/g, "") || "custom";
			key = BUILTIN_PALETTES.includes(baseSlug)
				? `custom-${baseSlug}`
				: baseSlug;
		}

		const accent = getPickerColor("st-theme-accent");
		const lightBg = getPickerColor("st-theme-light-bg");
		const lightPaper = getPickerColor("st-theme-light-paper");
		const darkBg = getPickerColor("st-theme-dark-bg");
		const darkPaper = getPickerColor("st-theme-dark-paper");

		if (!currentConfig.customPalettes) {
			currentConfig.customPalettes = {};
		}

		currentConfig.customPalettes[key] = {
			name: rawName,
			accent,
			light: {
				bg: lightBg,
				paper: lightPaper,
				accent,
			},
			dark: {
				bg: darkBg,
				paper: darkPaper,
				accent,
			},
		};

		currentConfig.palette = key;
		localStorage.setItem("bk-palette", key);

		const modal = $("st-modal-custom-theme");
		if (modal) modal.style.display = "none";

		renderPalettes();
		broadcastAppearanceChange();
		saveConfig();
		scrollToSlab("design");
	});
}

function getPickerColor(idPrefix: string): string {
	const textEl = $<HTMLInputElement>(`${idPrefix}-text`);
	return textEl?.value || "#3b82f6";
}

function setPickerColor(idPrefix: string, val: string) {
	const colorEl = $<HTMLInputElement>(`${idPrefix}-color`);
	const textEl = $<HTMLInputElement>(`${idPrefix}-text`);
	if (colorEl) colorEl.value = val;
	if (textEl) textEl.value = val;
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function initStudioWebSocket() {
	let ws: WebSocket | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	function connect() {
		try {
			if (ws) {
				try {
					ws.close();
				} catch (_) {}
			}
			const protocol = location.protocol === "https:" ? "wss:" : "ws:";
			ws = new WebSocket(`${protocol}//${location.host}/`);

			ws.onmessage = async (e) => {
				if (typeof e.data === "string") {
					if (e.data === "reload") {
						await fetchConfig();
					} else if (e.data.startsWith("redirect:")) {
						const newUrl = e.data.slice(9);
						const fileGuess = newUrl
							.replace(/^\//, "")
							.replace(/\.html$/, ".md");
						updateLiveViewport(fileGuess);
						await fetchConfig();
					} else if (e.data.startsWith("{")) {
						try {
							const msg = JSON.parse(e.data);
							if (msg.type === "appearance-update") {
								await fetchConfig();
							}
						} catch (_) {}
					}
				}
			};

			ws.onclose = () => {
				if (reconnectTimer) clearTimeout(reconnectTimer);
				reconnectTimer = setTimeout(connect, 1200);
			};

			ws.onerror = () => {
				try {
					ws?.close();
				} catch (_) {}
			};
		} catch (_) {
			if (reconnectTimer) clearTimeout(reconnectTimer);
			reconnectTimer = setTimeout(connect, 2000);
		}
	}

	connect();

	// Listen for postMessage from preview iframe reloads
	window.addEventListener("message", (e) => {
		if (e.data?.type === "bk-page-reloaded") {
			fetchConfig();
		}
	});
}

// ── Startup ────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
	wireEvents();
	fetchConfig();
	initStudioWebSocket();
});
