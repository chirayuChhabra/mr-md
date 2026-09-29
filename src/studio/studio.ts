import type { CustomPalette, MrmdConfig } from "../types.js";

// ── State ──────────────────────────────────────────────────────────────────

let currentConfig: MrmdConfig = {};
let unassignedFiles: string[] = [];
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let editingCustomPaletteKey: string | null = null;
let lessonSearchQuery = "";
let activeLessonFile = "";

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

// ── API Operations ─────────────────────────────────────────────────────────

async function fetchConfig() {
	try {
		const res = await fetch("/__api/config");
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = await res.json();
		currentConfig = data.config || {};
		unassignedFiles = data.unassignedFiles || [];

		// Default active lesson to first lesson in curriculum if not set
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
	if (targetFile) {
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

	// Update active card highlight in sidebar
	document.querySelectorAll(".st-lesson-card").forEach((card) => {
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

	const allLessons = currentConfig.lessons || [];

	if (countPill) {
		countPill.textContent = String(allLessons.length);
	}

	container.innerHTML = "";

	if (allLessons.length === 0) {
		container.innerHTML = `
      <div style="padding: 24px 14px; text-align: center; color: var(--st-text-muted); font-size: 12px;">
        No lessons in course yet.<br>Click "+ New Lesson" above.
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
		card.draggable = true;
		card.dataset.index = String(idx);
		card.dataset.file = file;

		card.innerHTML = `
      <div class="st-card-left">
        <span class="st-card-drag" title="Drag to reorder">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="8" cy="5" r="2.2"/><circle cx="16" cy="5" r="2.2"/>
            <circle cx="8" cy="12" r="2.2"/><circle cx="16" cy="12" r="2.2"/>
            <circle cx="8" cy="19" r="2.2"/><circle cx="16" cy="19" r="2.2"/>
          </svg>
        </span>
        <span class="st-card-num">${formattedNum}</span>
        <div class="st-card-text">
          <div style="display: flex; align-items: center;">
            <span class="st-card-title">${escapeHtml(title)}</span>
            ${badge ? `<span class="st-card-badge ${badge.cls}">${badge.text}</span>` : ""}
          </div>
          <span class="st-card-file">${escapeHtml(file)}</span>
        </div>
      </div>
      <div class="st-card-actions">
        <a class="st-card-btn" href="/${file.replace(/\.md$/, "")}.html" target="_blank" title="Open in new window">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        </a>
        <button class="st-card-btn danger st-remove-btn" title="Remove from course">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    `;

		// Select lesson on click
		card.addEventListener("click", (e) => {
			if ((e.target as HTMLElement).closest(".st-card-actions")) return;
			updateLiveViewport(file);
		});

		// Drag & drop handlers
		card.addEventListener("dragstart", (e) => {
			card.classList.add("dragging");
			e.dataTransfer?.setData("text/plain", String(idx));
			if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
		});

		card.addEventListener("dragend", () => {
			card.classList.remove("dragging");
			document.querySelectorAll(".st-lesson-card").forEach((i) => {
				i.classList.remove("drag-over");
			});
		});

		card.addEventListener("dragover", (e) => {
			e.preventDefault();
			card.classList.add("drag-over");
			if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
		});

		card.addEventListener("dragleave", () => {
			card.classList.remove("drag-over");
		});

		card.addEventListener("drop", (e) => {
			e.preventDefault();
			card.classList.remove("drag-over");
			const fromIdx = parseInt(
				e.dataTransfer?.getData("text/plain") || "-1",
				10,
			);
			const toIdx = idx;

			if (fromIdx >= 0 && fromIdx !== toIdx) {
				const list = [...(currentConfig.lessons || [])];
				const [moved] = list.splice(fromIdx, 1);
				list.splice(toIdx, 0, moved);
				currentConfig.lessons = list;
				renderCurriculum();
				saveConfig();
			}
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
      <span>${escapeHtml(file)}</span>
      <button type="button" title="Add to curriculum">＋</button>
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

	if (titleInput) titleInput.value = currentConfig.title || "";
	if (descInput) descInput.value = currentConfig.description || "";
	if (authorInput) authorInput.value = currentConfig.author || "";
	if (headerTitle) headerTitle.textContent = courseTitle;
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
        <span class="st-custom-pip" style="background: ${escapeHtml(p.accent)};"></span>
        <div>
          <div style="font-size: 12px; font-weight: 600; color: var(--st-text);">${escapeHtml(p.name || key)}</div>
          <div style="font-size: 10px; font-family: var(--st-mono); color: var(--st-text-muted);">${escapeHtml(p.accent)}</div>
        </div>
      </div>
      <div style="display: flex; gap: 2px;">
        <button class="st-card-btn st-edit-palette-btn" title="Edit theme">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
        </button>
        <button class="st-card-btn danger st-delete-palette-btn" title="Delete theme">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
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
				delete currentConfig.customPalettes?.[key];
				if (currentConfig.palette === key) {
					currentConfig.palette = "ink";
					localStorage.setItem("bk-palette", "ink");
				}
				renderPalettes();
				renderCustomPalettes();
				broadcastAppearanceChange();
				saveConfig();
			});

		container.appendChild(card);
	});
}

// ── Event Wiring ───────────────────────────────────────────────────────────

function wireEvents() {
	// Mode switcher (Curriculum / Split / Preview)
	document.querySelectorAll("#st-mode-tabs .st-mode-tab").forEach((tab) => {
		tab.addEventListener("click", () => {
			document.querySelectorAll("#st-mode-tabs .st-mode-tab").forEach((t) => {
				t.classList.remove("active");
			});
			tab.classList.add("active");

			const mode = (tab as HTMLElement).dataset.mode;
			const leftRail = $("st-sidebar-left");
			const rightRail = $("st-sidebar-right");

			if (mode === "curriculum") {
				if (leftRail) leftRail.style.display = "flex";
				if (rightRail) rightRail.style.display = "none";
			} else if (mode === "preview") {
				if (leftRail) leftRail.style.display = "none";
				if (rightRail) rightRail.style.display = "none";
			} else {
				// split
				if (leftRail) leftRail.style.display = "flex";
				if (rightRail) rightRail.style.display = "flex";
			}
		});
	});

	// Device toggles (Desktop / Tablet / Mobile)
	document
		.querySelectorAll("#st-device-toggles .st-device-btn")
		.forEach((btn) => {
			btn.addEventListener("click", () => {
				document
					.querySelectorAll("#st-device-toggles .st-device-btn")
					.forEach((b) => {
						b.classList.remove("active");
					});
				btn.classList.add("active");

				const device = (btn as HTMLElement).dataset.device || "desktop";
				const wrapper = $("st-frame-wrapper");
				if (wrapper) {
					wrapper.className = `st-frame-wrapper ${device}`;
				}
			});
		});

	// Viewport reload button
	$("st-btn-reload-frame")?.addEventListener("click", () => {
		const iframe = $<HTMLIFrameElement>("st-course-iframe");
		if (iframe?.contentWindow) {
			iframe.contentWindow.location.reload();
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
			if (newLessonModal) newLessonModal.style.display = "none";
			await fetchConfig();
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

	// Click outside modal backdrop
	[newLessonModal, $("st-modal-custom-theme")].forEach((modal) => {
		modal?.addEventListener("click", (e) => {
			if (e.target === modal) {
				modal.style.display = "none";
			}
		});
	});

	// Escape key to dismiss modals
	window.addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			if (newLessonModal) newLessonModal.style.display = "none";
			const customModal = $("st-modal-custom-theme");
			if (customModal) customModal.style.display = "none";
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

	$("st-modal-save-theme")?.addEventListener("click", () => {
		const nameInput = $<HTMLInputElement>("st-theme-name");
		const rawName = nameInput?.value.trim() || "Custom Theme";
		const key =
			editingCustomPaletteKey ||
			rawName
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/(^-|-$)/g, "");

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
