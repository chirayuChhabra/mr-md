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
let draggedLessonIndex: number | null = null;
let isNavigatingAnimation = false;
let pendingDeleteThemeKey: string | null = null;

const BUILTIN_PALETTES = ["ink", "field", "ember", "elixir", "trunk", "lava"];

const studioBroadcast =
	typeof BroadcastChannel !== "undefined"
		? new BroadcastChannel("mrmd-studio-sync")
		: null;

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
}

// ── DOM Helpers ────────────────────────────────────────────────────────────

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
	document.getElementById(id) as T | null;

function setStatus(status: "saved" | "saving" | "unsaved", msg?: string) {
	const dot = $("st-status-dot");
	const text = $("st-status-text");
	if (!dot || !text) return;

	dot.className = "st-status-dot";
	if (status === "saving") {
		dot.classList.add("saving");
		text.textContent = msg || "Saving...";
	} else if (status === "unsaved") {
		dot.classList.add("dirty");
		text.textContent = msg || "Unsaved";
	} else {
		text.textContent = msg || "Synced";
	}
}

// ── Niri Ribbon Spatial Navigation ─────────────────────────────────────────

function smoothScrollTo(
	element: HTMLElement,
	targetLeft: number,
	duration = 380,
) {
	const startLeft = element.scrollLeft;
	const change = targetLeft - startLeft;
	if (Math.abs(change) < 2) {
		element.scrollLeft = targetLeft;
		syncNavButtons();
		return;
	}

	isNavigatingAnimation = true;
	// Temporarily bypass scroll-snap during programmatic glide so button clicks are silky-smooth
	element.style.scrollSnapType = "none";

	const startTime = performance.now();

	function easeOutCubic(t: number): number {
		return 1 - (1 - t) ** 3;
	}

	function step(now: number) {
		const elapsed = now - startTime;
		const progress = Math.min(elapsed / duration, 1);
		const eased = easeOutCubic(progress);
		element.scrollLeft = startLeft + change * eased;
		if (progress < 1) {
			requestAnimationFrame(step);
		} else {
			element.scrollLeft = targetLeft;
			// Re-enable native magnetic hardware snap detents once glide lands
			element.style.scrollSnapType = "x mandatory";
			isNavigatingAnimation = false;
			syncNavButtons();
		}
	}
	requestAnimationFrame(step);
}

function syncNavButtons() {
	if (isNavigatingAnimation) return;
	const canvas = $("st-infinite-canvas");
	if (!canvas) return;

	const scrollLeft = canvas.scrollLeft;
	const clientWidth = canvas.clientWidth;
	const scrollWidth = canvas.scrollWidth;

	const courseSlab = $("st-slab-course");
	if (!courseSlab) return;

	// Calculate deterministic positions of the 3 magnetic dock detents:
	// 1. Curriculum detent (left-docked)
	const curriculumDetent = 0;
	// 2. Desktop course detent (center-docked)
	const courseDetent = Math.max(
		0,
		courseSlab.offsetLeft -
			Math.max(0, (clientWidth - courseSlab.offsetWidth) / 2),
	);
	// 3. Themes & Design detent (right-docked)
	const designDetent = Math.max(0, scrollWidth - clientWidth);

	const dCurriculum = Math.abs(scrollLeft - curriculumDetent);
	const dCourse = Math.abs(scrollLeft - courseDetent);
	const dDesign = Math.abs(scrollLeft - designDetent);

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

	document.querySelectorAll(".st-nav-slab-btn").forEach((btn) => {
		if ((btn as HTMLElement).dataset.target === target) {
			btn.classList.add("active");
		} else {
			btn.classList.remove("active");
		}
	});

	if (target === "curriculum") {
		smoothScrollTo(canvas, 0);
	} else if (target === "design") {
		smoothScrollTo(canvas, canvas.scrollWidth - canvas.clientWidth);
	} else {
		// Center the course slab smoothly
		const courseSlab = $("st-slab-course");
		if (courseSlab) {
			const slabLeft = courseSlab.offsetLeft;
			const slabWidth = courseSlab.offsetWidth;
			const canvasWidth = canvas.clientWidth;
			const targetScroll = Math.max(
				0,
				slabLeft - Math.max(0, (canvasWidth - slabWidth) / 2),
			);
			smoothScrollTo(canvas, targetScroll);
		}
	}
}

// ── API Operations ─────────────────────────────────────────────────────────

async function fetchConfig() {
	try {
		const res = await fetch("/__api/config");
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = await res.json();
		currentConfig = data.config || {};
		unassignedFiles = data.unassignedFiles || [];

		if (
			!activeLessonFile &&
			currentConfig.lessons &&
			currentConfig.lessons.length > 0
		) {
			const first = currentConfig.lessons[0];
			activeLessonFile = typeof first === "string" ? first : first.file;
		}

		renderAll();
		updateLiveViewport();

		// Only center the desktop course slab on initial cold page load
		if (isInitialBoot) {
			isInitialBoot = false;
			setTimeout(() => {
				scrollToSlab("course");
			}, 120);
		}
	} catch (err) {
		console.error("Failed to load studio config:", err);
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

function updateLiveViewport(targetFile?: string) {
	if (targetFile !== undefined) {
		activeLessonFile = targetFile;
	}

	const iframe = $<HTMLIFrameElement>("st-course-iframe");
	const urlDisplay = $("st-viewport-url");
	const openTabBtn = $<HTMLAnchorElement>("st-btn-open-active-tab");

	let htmlPath = "/";
	if (activeLessonFile) {
		htmlPath = `/${activeLessonFile.replace(/\.md$/, "")}.html`;
	}

	if (iframe) {
		const fullUrl = new URL(htmlPath, window.location.origin).href;
		if (iframe.src !== fullUrl) {
			iframe.src = htmlPath;
		}
	}

	if (urlDisplay) {
		urlDisplay.textContent = `${window.location.origin}${htmlPath}`;
	}

	if (openTabBtn) {
		openTabBtn.href = htmlPath;
	}

	const homeCard = $("st-course-home-card");
	if (homeCard) {
		if (!activeLessonFile) {
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

// ── Rendering ──────────────────────────────────────────────────────────────

function renderAll() {
	renderCurriculum();
	renderUnassigned();
	renderMetadata();
	renderThemeMode();
	renderUiMode();
	renderPalettes();
	renderCustomPalettes();
}

function inferBadge(
	file: string,
	title: string,
): { text: string; cls: string } | null {
	const t = `${file} ${title}`.toLowerCase();
	if (t.includes("wave") || t.includes("sim") || t.includes("interactive")) {
		return { text: "SIM", cls: "sim" };
	}
	if (t.includes("quiz") || t.includes("exam") || t.includes("test")) {
		return { text: "QUIZ", cls: "quiz" };
	}
	return null;
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
			typeof entry === "string"
				? file
						.replace(/^\d+[-_]?/, "")
						.replace(/\.md$/, "")
						.replace(/[-_]/g, " ")
						.replace(/\b\w/g, (c) => c.toUpperCase())
				: entry.title || file;

		if (
			query &&
			!title.toLowerCase().includes(query) &&
			!file.toLowerCase().includes(query)
		) {
			return;
		}

		const badge = inferBadge(file, title);
		const formattedNum = String(idx + 1).padStart(2, "0");
		const isActive = file === activeLessonFile;

		const card = document.createElement("div");
		card.className = `st-lesson-card ${isActive ? "active" : ""}`;
		const canDrag = !query;
		card.draggable = canDrag;
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
          ${badge ? `<span class="st-card-tag ${badge.cls}"><span class="st-card-tag-dot"></span>${badge.text}</span>` : ""}
        </div>
      </div>
      <div class="st-card-actions">
        <a class="st-card-btn" href="/${file.replace(/\.md$/, "")}.html" target="_blank" title="Open lesson in new tab">
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

		// Drag & drop handlers with tactile indicators
		card.addEventListener("dragstart", (e) => {
			if (!card.draggable) return;
			isDraggingLesson = true;
			draggedLessonIndex = idx;
			card.classList.add("dragging");
			e.dataTransfer?.setData("text/plain", String(idx));
			if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
		});

		card.addEventListener("dragend", () => {
			card.classList.remove("dragging");
			document.querySelectorAll(".st-lesson-card").forEach((i) => {
				i.classList.remove(
					"drop-indicator-top",
					"drop-indicator-bottom",
					"drag-over",
				);
			});
			setTimeout(() => {
				isDraggingLesson = false;
				draggedLessonIndex = null;
			}, 120);
		});

		card.addEventListener("dragover", (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "move";

			const rect = card.getBoundingClientRect();
			const isBelow = e.clientY > rect.top + rect.height / 2;

			document.querySelectorAll(".st-lesson-card").forEach((c) => {
				if (c !== card) {
					c.classList.remove("drop-indicator-top", "drop-indicator-bottom");
				}
			});

			if (isBelow) {
				card.classList.remove("drop-indicator-top");
				card.classList.add("drop-indicator-bottom");
			} else {
				card.classList.remove("drop-indicator-bottom");
				card.classList.add("drop-indicator-top");
			}
		});

		card.addEventListener("dragleave", (e) => {
			const rel = e.relatedTarget as Node | null;
			if (!rel || !card.contains(rel)) {
				card.classList.remove("drop-indicator-top", "drop-indicator-bottom");
			}
		});

		card.addEventListener("drop", (e) => {
			e.preventDefault();
			e.stopPropagation();
			card.classList.remove("drop-indicator-top", "drop-indicator-bottom");

			const fromIdx =
				draggedLessonIndex !== null
					? draggedLessonIndex
					: parseInt(e.dataTransfer?.getData("text/plain") || "-1", 10);

			if (fromIdx < 0) return;

			const rect = card.getBoundingClientRect();
			const isBelow = e.clientY > rect.top + rect.height / 2;
			const targetSlot = isBelow ? idx + 1 : idx;

			if (targetSlot === fromIdx || targetSlot === fromIdx + 1) {
				return;
			}

			const list = [...(currentConfig.lessons || [])];
			const [moved] = list.splice(fromIdx, 1);
			const newIndex = fromIdx < targetSlot ? targetSlot - 1 : targetSlot;
			list.splice(newIndex, 0, moved);
			currentConfig.lessons = list;
			renderCurriculum();
			saveConfig();
		});

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

			if (activeLessonFile === fileName && list.length > 0) {
				const next = list[0];
				activeLessonFile = typeof next === "string" ? next : next.file;
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

function renderMetadata() {
	const titleInput = $<HTMLInputElement>("st-meta-title");
	const descInput = $<HTMLTextAreaElement>("st-meta-desc");
	const authorInput = $<HTMLInputElement>("st-meta-author");
	const headerTitle = $("st-header-title");

	const courseTitle = currentConfig.title || "Interactive Course";
	const homeTitle = $("st-course-home-title");

	if (titleInput && document.activeElement !== titleInput) {
		titleInput.value = currentConfig.title || "";
	}
	if (descInput && document.activeElement !== descInput) {
		descInput.value = currentConfig.description || "";
	}
	if (authorInput && document.activeElement !== authorInput) {
		authorInput.value = currentConfig.author || "";
	}
	if (headerTitle) headerTitle.textContent = courseTitle;
	if (homeTitle) homeTitle.textContent = currentConfig.title || "Course Home";
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
	const active = currentConfig.palette || "ink";
	document
		.querySelectorAll<HTMLElement>("#st-builtin-palettes [data-palette]")
		.forEach((card) => {
			if (card.dataset.palette === active) {
				card.classList.add("active");
			} else {
				card.classList.remove("active");
			}
		});
}

function renderCustomPalettes() {
	const container = $("st-custom-palettes-list");
	if (!container) return;

	const palettes = currentConfig.customPalettes || {};
	const keys = Object.keys(palettes);
	const activePalette = currentConfig.palette;

	container.innerHTML = "";

	if (keys.length === 0) {
		container.innerHTML = `
      <div style="font-size: 11px; color: var(--st-text-muted); padding: 8px 10px; background: var(--st-surface); border: 1px dashed var(--st-border); border-radius: var(--st-radius-sm); text-align: center;">
        No custom themes. Click "+ New" above.
      </div>`;
		return;
	}

	keys.forEach((key) => {
		const p = palettes[key];
		const card = document.createElement("div");
		card.className = `st-custom-card ${activePalette === key ? "active" : ""}`;

		card.innerHTML = `
      <div class="st-custom-card-left">
        <div class="st-swatch-disc" style="--swatch-color: ${escapeHtml(p.accent)};">
          <span class="st-swatch-inner" style="background: ${escapeHtml(p.accent)};"></span>
        </div>
        <div class="st-swatch-info">
          <span class="st-swatch-name">${escapeHtml(p.name || key)}</span>
          <span class="st-swatch-hex">${escapeHtml(p.accent)}</span>
        </div>
      </div>
      <div class="st-custom-actions">
        <button class="st-card-btn st-edit-palette-btn" title="Edit theme">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
        </button>
        <button class="st-card-btn danger st-delete-palette-btn" title="Delete theme">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    `;

		card.addEventListener("click", (e) => {
			if ((e.target as HTMLElement).closest("button")) return;
			currentConfig.palette = key;
			localStorage.setItem("bk-palette", key);
			renderPalettes();
			renderCustomPalettes();
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

		container.appendChild(card);
	});
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
		canvas.addEventListener(
			"scroll",
			() => {
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
				syncNavButtons();
			},
			{ passive: true },
		);
	}

	// Curriculum container whitespace drop handling (drop below cards places item at end)
	const lessonContainer = $("st-lesson-list");
	if (lessonContainer) {
		lessonContainer.addEventListener("dragover", (e) => {
			if (!isDraggingLesson) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "move";

			const cards = Array.from(
				lessonContainer.querySelectorAll(".st-lesson-card"),
			) as HTMLElement[];
			if (cards.length > 0) {
				const lastCard = cards[cards.length - 1];
				const lastRect = lastCard.getBoundingClientRect();
				if (e.clientY > lastRect.bottom) {
					cards.forEach((c) => {
						c.classList.remove("drop-indicator-top", "drop-indicator-bottom");
					});
					lastCard.classList.add("drop-indicator-bottom");
				}
			}
		});

		lessonContainer.addEventListener("drop", (e) => {
			if (!isDraggingLesson) return;
			const targetCard = (e.target as HTMLElement).closest(".st-lesson-card");
			if (targetCard) return; // handled by individual card drop handler

			e.preventDefault();
			e.stopPropagation();

			document.querySelectorAll(".st-lesson-card").forEach((c) => {
				c.classList.remove("drop-indicator-top", "drop-indicator-bottom");
			});

			const fromIdx =
				draggedLessonIndex !== null
					? draggedLessonIndex
					: parseInt(e.dataTransfer?.getData("text/plain") || "-1", 10);

			const list = [...(currentConfig.lessons || [])];
			if (fromIdx >= 0 && fromIdx < list.length - 1) {
				const [moved] = list.splice(fromIdx, 1);
				list.push(moved);
				currentConfig.lessons = list;
				renderCurriculum();
				saveConfig();
			}
		});
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
	if (iframe) {
		iframe.addEventListener("load", () => {
			try {
				const path = iframe.contentWindow?.location.pathname;
				if (path) {
					const urlDisplay = $("st-viewport-url");
					if (urlDisplay) {
						urlDisplay.textContent = `${window.location.origin}${path}`;
					}
					const openTabBtn = $<HTMLAnchorElement>("st-btn-open-active-tab");
					if (openTabBtn) {
						openTabBtn.href = path;
					}
					const slug = path.replace(/^\//, "").replace(/\.html$/, "");
					if (slug) {
						const matchingFile = `${slug}.md`;
						activeLessonFile = matchingFile;
						const homeCardEl = $("st-course-home-card");
						if (homeCardEl) homeCardEl.classList.remove("active");
						document
							.querySelectorAll(".st-lesson-card:not(#st-course-home-card)")
							.forEach((c) => {
								if ((c as HTMLElement).dataset.file === matchingFile) {
									c.classList.add("active");
								} else {
									c.classList.remove("active");
								}
							});
					} else {
						activeLessonFile = "";
						const homeCardEl = $("st-course-home-card");
						if (homeCardEl) homeCardEl.classList.add("active");
						document
							.querySelectorAll(".st-lesson-card:not(#st-course-home-card)")
							.forEach((c) => {
								c.classList.remove("active");
							});
					}
				}
			} catch {}
		});
	}

	// Keyboard navigation shortcuts (1: Curriculum, 2: Course, 3: Design)
	window.addEventListener("keydown", (e) => {
		const target = e.target as HTMLElement | null;
		const isEditing =
			target &&
			(target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable);
		if (!isEditing && !e.metaKey && !e.ctrlKey && !e.altKey) {
			if (e.key === "1") {
				scrollToSlab("curriculum");
			} else if (e.key === "2") {
				scrollToSlab("course");
			} else if (e.key === "3") {
				scrollToSlab("design");
			} else if (e.key === "/") {
				e.preventDefault();
				$("st-lesson-search")?.focus();
			}
		} else if (
			(e.metaKey || e.ctrlKey) &&
			e.key.toLowerCase() === "k" &&
			!isEditing
		) {
			e.preventDefault();
			$("st-lesson-search")?.focus();
		}
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
					if (copyTimer) clearTimeout(copyTimer);
					copyTimer = setTimeout(() => {
						toast.classList.remove("show");
					}, 1800);
				}
			} catch (err) {
				console.error("Failed to copy URL:", err);
			}
		}
	});

	// Lesson search input
	$("st-lesson-search")?.addEventListener("input", (e) => {
		lessonSearchQuery = (e.target as HTMLInputElement).value;
		renderCurriculum();
	});

	// Metadata inputs
	$("st-meta-title")?.addEventListener("input", (e) => {
		const val = (e.target as HTMLInputElement).value;
		currentConfig.title = val;
		const crumb = $("st-header-title");
		if (crumb) crumb.textContent = val || "Interactive Course";
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

	// Builtin palette swatches
	document
		.querySelectorAll("#st-builtin-palettes [data-palette]")
		.forEach((card) => {
			card.addEventListener("click", () => {
				const val = (card as HTMLElement).dataset.palette;
				currentConfig.palette = val;
				if (val) localStorage.setItem("bk-palette", val);
				renderPalettes();
				renderCustomPalettes();
				broadcastAppearanceChange();
				saveConfig();
			});
		});

	// New Lesson modal
	const newLessonModal = $("st-modal-new-lesson");
	const newLessonInput = $<HTMLInputElement>("st-new-lesson-name");

	$("st-btn-new-lesson")?.addEventListener("click", () => {
		if (newLessonModal && newLessonInput) {
			newLessonInput.value = "";
			newLessonModal.style.display = "flex";
			newLessonInput.focus();
		}
	});

	newLessonInput?.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			$("st-modal-confirm-lesson")?.click();
		}
	});

	$("st-modal-close-lesson")?.addEventListener("click", () => {
		if (newLessonModal) newLessonModal.style.display = "none";
	});
	$("st-modal-cancel-lesson")?.addEventListener("click", () => {
		if (newLessonModal) newLessonModal.style.display = "none";
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
				updateLiveViewport(data.file);
			}
			setStatus("saved");
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
	});
	$("st-modal-cancel-delete")?.addEventListener("click", () => {
		if (confirmDeleteModal) confirmDeleteModal.style.display = "none";
		pendingDeleteThemeKey = null;
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
			renderCustomPalettes();
			broadcastAppearanceChange();
			saveConfig();
		}
	});

	// Click outside modal backdrop
	[newLessonModal, $("st-modal-custom-theme"), confirmDeleteModal].forEach(
		(modal) => {
			modal?.addEventListener("click", (e) => {
				if (e.target === modal) {
					modal.style.display = "none";
					if (modal === confirmDeleteModal) pendingDeleteThemeKey = null;
				}
			});
		},
	);

	// Escape key to dismiss modals
	window.addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			if (newLessonModal) newLessonModal.style.display = "none";
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
		titleEl.textContent = key ? "Edit Custom Theme" : "New Custom Theme";
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
		const rawName = nameInput?.value.trim() || "Custom Theme";
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
		renderCustomPalettes();
		broadcastAppearanceChange();
		saveConfig();
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

// ── Startup ────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
	wireEvents();
	fetchConfig();
});
