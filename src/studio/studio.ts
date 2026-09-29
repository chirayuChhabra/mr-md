import type { CustomPalette, MrmdConfig } from "../types.js";

// ── State ──────────────────────────────────────────────────────────────────

let currentConfig: MrmdConfig = {};
let unassignedFiles: string[] = [];
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let editingCustomPaletteKey: string | null = null;
let lessonSearchQuery = "";

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
		text.textContent = msg || "Saving changes...";
	} else if (status === "unsaved") {
		dot.classList.add("dirty");
		text.textContent = msg || "Unsaved changes";
	} else {
		text.textContent = msg || "All changes synced";
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
		renderAll();
	} catch (err) {
		console.error("Failed to load studio config:", err);
		setStatus("unsaved", "Error loading config");
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

const BUILTIN_PALETTES: Record<
	string,
	{
		name: string;
		accent: string;
		lightBg: string;
		lightPaper: string;
		darkBg: string;
		darkPaper: string;
		lightInk: string;
		darkInk: string;
	}
> = {
	ink: {
		name: "Ink",
		accent: "#2563eb",
		lightBg: "#f5f8fc",
		lightPaper: "#ffffff",
		darkBg: "#07090c",
		darkPaper: "#121212",
		lightInk: "#09090b",
		darkInk: "#f0f0f0",
	},
	field: {
		name: "Field",
		accent: "#0d9488",
		lightBg: "#f2fcf5",
		lightPaper: "#ffffff",
		darkBg: "#050a0a",
		darkPaper: "#121212",
		lightInk: "#09090b",
		darkInk: "#f0f0f0",
	},
	ember: {
		name: "Ember",
		accent: "#ea580c",
		lightBg: "#fffcf8",
		lightPaper: "#ffffff",
		darkBg: "#0d0a08",
		darkPaper: "#121212",
		lightInk: "#09090b",
		darkInk: "#f0f0f0",
	},
	elixir: {
		name: "Elixir",
		accent: "#a855f7",
		lightBg: "#f8f5fc",
		lightPaper: "#ffffff",
		darkBg: "#0b0a0e",
		darkPaper: "#121212",
		lightInk: "#09090b",
		darkInk: "#f0f0f0",
	},
	trunk: {
		name: "Trunk",
		accent: "#78350f",
		lightBg: "#fdfaf8",
		lightPaper: "#ffffff",
		darkBg: "#0c0a09",
		darkPaper: "#121212",
		lightInk: "#09090b",
		darkInk: "#f0f0f0",
	},
	lava: {
		name: "Lava",
		accent: "#ef4444",
		lightBg: "#fff5f5",
		lightPaper: "#ffffff",
		darkBg: "#0f0808",
		darkPaper: "#121212",
		lightInk: "#09090b",
		darkInk: "#f0f0f0",
	},
};

// ── Rendering ──────────────────────────────────────────────────────────────

function renderAll() {
	renderCurriculum();
	renderUnassigned();
	renderMetadata();
	renderThemeMode();
	renderUiMode();
	renderPalettes();
	renderCustomPalettes();
	renderLiveAppearancePreview();
}

function renderLiveAppearancePreview() {
	const box = $("st-live-preview-box");
	const tag = $("st-prev-tag");
	const title = $("st-prev-title");
	const body = $("st-prev-body");
	const btn = $("st-prev-btn");
	const badge = $("st-appearance-preview-badge");
	if (!box || !btn) return;

	const theme = currentConfig.theme || "auto";
	const ui = currentConfig.ui || "standard";
	const paletteKey = currentConfig.palette || "ink";

	const isDark =
		theme === "dark" ||
		(theme === "auto" &&
			typeof window !== "undefined" &&
			window.matchMedia("(prefers-color-scheme: dark)").matches);

	// Resolve palette colors
	let accent = "#2563eb";
	let paper = isDark ? "#121212" : "#ffffff";
	let ink = isDark ? "#f0f0f0" : "#09090b";
	let paletteName = paletteKey;

	const builtin = BUILTIN_PALETTES[paletteKey];
	if (builtin) {
		accent = builtin.accent;
		paper = isDark ? builtin.darkPaper : builtin.lightPaper;
		ink = isDark ? builtin.darkInk : builtin.lightInk;
		paletteName = builtin.name;
	} else if (currentConfig.customPalettes?.[paletteKey]) {
		const custom = currentConfig.customPalettes[paletteKey];
		accent = custom.accent || "#3b82f6";
		if (isDark) {
			paper = custom.dark?.paper || "#121620";
			ink = custom.dark?.ink || "#f0f0f0";
		} else {
			paper = custom.light?.paper || "#ffffff";
			ink = custom.light?.ink || "#09090b";
		}
		paletteName = custom.name || paletteKey;
	}

	if (badge) {
		badge.textContent = `${theme.toUpperCase()} · ${ui.toUpperCase()} · ${paletteName}`;
	}

	// Apply colors
	box.style.backgroundColor = paper;
	box.style.color = ink;
	if (title) title.style.color = ink;
	if (body) body.style.color = ink;
	if (tag) {
		tag.style.backgroundColor = `${accent}20`;
		tag.style.color = accent;
	}

	// Apply UI aesthetic
	if (ui === "neo") {
		box.style.borderRadius = "0px";
		box.style.border = `2px solid ${ink}`;
		box.style.boxShadow = `4px 4px 0px 0px ${ink}`;
		box.style.fontFamily = '"Archivo", sans-serif';
		btn.style.borderRadius = "0px";
		btn.style.border = `2px solid ${ink}`;
		btn.style.boxShadow = `2px 2px 0px 0px ${ink}`;
		btn.style.backgroundColor = accent;
	} else if (ui === "playful") {
		box.style.borderRadius = "20px";
		box.style.border = `1px solid ${accent}30`;
		box.style.boxShadow = `0 10px 25px -5px ${accent}25`;
		box.style.fontFamily = '"Nunito", -apple-system, sans-serif';
		btn.style.borderRadius = "14px";
		btn.style.border = "none";
		btn.style.boxShadow = `0 4px 12px ${accent}40`;
		btn.style.backgroundColor = accent;
	} else {
		// standard
		box.style.borderRadius = "8px";
		box.style.border = "1px solid var(--st-border)";
		box.style.boxShadow = "0 4px 14px rgba(0, 0, 0, 0.08)";
		box.style.fontFamily = "inherit";
		btn.style.borderRadius = "6px";
		btn.style.border = "none";
		btn.style.boxShadow = "none";
		btn.style.backgroundColor = accent;
	}
}

function inferLessonTag(fileName: string, title: string): string {
	const text = `${fileName} ${title}`.toLowerCase();
	if (
		text.includes("wave") ||
		text.includes("sim") ||
		text.includes("interactive")
	) {
		return "Simulation";
	}
	if (text.includes("quiz") || text.includes("exam") || text.includes("test")) {
		return "Quiz";
	}
	if (
		text.includes("welcome") ||
		text.includes("intro") ||
		text.includes("start")
	) {
		return "Overview";
	}
	return "Lesson";
}

function renderCurriculum() {
	const container = $("st-lesson-list");
	const countPill = $("st-lesson-count-pill");
	if (!container) return;

	const allLessons = currentConfig.lessons || [];

	if (countPill) {
		countPill.textContent = `${allLessons.length} ${allLessons.length === 1 ? "lesson" : "lessons"}`;
	}

	container.innerHTML = "";

	if (allLessons.length === 0) {
		container.innerHTML = `
      <div style="padding: 36px 20px; text-align: center; color: var(--st-text-muted); font-size: 13px; background: var(--st-surface-elevated); border: 1px dashed var(--st-border); border-radius: var(--st-radius);">
        <p style="font-weight: 600; color: var(--st-text); margin-bottom: 4px;">No lessons in course yet</p>
        <p style="font-size: 12px;">Click "+ New Lesson" above or add from unassigned drafts below.</p>
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

		// Search filtering
		if (
			query &&
			!title.toLowerCase().includes(query) &&
			!file.toLowerCase().includes(query)
		) {
			return;
		}

		const tag = inferLessonTag(file, title);
		const formattedNum = String(idx + 1).padStart(2, "0");

		const el = document.createElement("div");
		el.className = "st-lesson-item";
		el.draggable = true;
		el.dataset.index = String(idx);

		el.innerHTML = `
      <div class="st-lesson-left">
        <span class="st-drag-handle" title="Drag to reorder">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="8" cy="5" r="2.2"/>
            <circle cx="16" cy="5" r="2.2"/>
            <circle cx="8" cy="12" r="2.2"/>
            <circle cx="16" cy="12" r="2.2"/>
            <circle cx="8" cy="19" r="2.2"/>
            <circle cx="16" cy="19" r="2.2"/>
          </svg>
        </span>
        <span class="st-lesson-num">${formattedNum}</span>
        <div class="st-lesson-info">
          <div class="st-lesson-title-row">
            <span class="st-lesson-title">${escapeHtml(title)}</span>
            <span class="st-lesson-pill-tag">${tag}</span>
          </div>
          <div class="st-lesson-file">${escapeHtml(file)}</div>
        </div>
      </div>
      <div class="st-lesson-actions">
        <a class="st-btn st-btn-sm st-btn-ghost" href="/${file.replace(/\.md$/, "")}.html" target="_blank" title="Preview lesson in new tab">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        </a>
        <button class="st-btn st-btn-sm st-btn-danger-ghost st-btn-remove-lesson" data-index="${idx}" title="Remove from course curriculum">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    `;

		// Drag & drop handlers
		el.addEventListener("dragstart", (e) => {
			el.classList.add("dragging");
			e.dataTransfer?.setData("text/plain", String(idx));
			if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
		});

		el.addEventListener("dragend", () => {
			el.classList.remove("dragging");
			document.querySelectorAll(".st-lesson-item").forEach((i) => {
				i.classList.remove("drag-over");
			});
		});

		el.addEventListener("dragover", (e) => {
			e.preventDefault();
			el.classList.add("drag-over");
			if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
		});

		el.addEventListener("dragleave", () => {
			el.classList.remove("drag-over");
		});

		el.addEventListener("drop", (e) => {
			e.preventDefault();
			el.classList.remove("drag-over");
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

		// Remove lesson handler
		const removeBtn = el.querySelector(".st-btn-remove-lesson");
		removeBtn?.addEventListener("click", () => {
			const list = [...(currentConfig.lessons || [])];
			const removed = list.splice(idx, 1)[0];
			currentConfig.lessons = list;

			const fileName = typeof removed === "string" ? removed : removed.file;
			if (!unassignedFiles.includes(fileName)) {
				unassignedFiles.push(fileName);
			}

			renderCurriculum();
			renderUnassigned();
			saveConfig();
		});

		container.appendChild(el);
	});
}

function renderUnassigned() {
	const panel = $("st-unassigned-panel");
	const container = $("st-unassigned-list");
	const countPill = $("st-unassigned-count-pill");
	if (!panel || !container) return;

	if (countPill) {
		countPill.textContent = `${unassignedFiles.length} ${unassignedFiles.length === 1 ? "draft" : "drafts"}`;
	}

	if (unassignedFiles.length === 0) {
		panel.style.display = "none";
		return;
	}

	panel.style.display = "block";
	container.innerHTML = "";

	unassignedFiles.forEach((file) => {
		const pill = document.createElement("div");
		pill.className = "st-unassigned-pill";
		pill.innerHTML = `
      <span>${escapeHtml(file)}</span>
      <button type="button" title="Add to course curriculum">＋ Add</button>
    `;

		pill.querySelector("button")?.addEventListener("click", () => {
			currentConfig.lessons = [...(currentConfig.lessons || []), file];
			unassignedFiles = unassignedFiles.filter((f) => f !== file);
			renderCurriculum();
			renderUnassigned();
			saveConfig();
		});

		container.appendChild(pill);
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
		.querySelectorAll<HTMLButtonElement>("#st-builtin-palettes button")
		.forEach((btn) => {
			if (btn.dataset.palette === active) {
				btn.classList.add("active");
			} else {
				btn.classList.remove("active");
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
      <div style="font-size: 12px; color: var(--st-text-muted); padding: 12px 14px; background: var(--st-surface-elevated); border: 1px dashed var(--st-border); border-radius: var(--st-radius-sm); text-align: center;">
        No custom themes created yet. Click "+ New Theme" to design your own.
      </div>`;
		return;
	}

	keys.forEach((key) => {
		const p = palettes[key];
		const item = document.createElement("div");
		item.className = `st-custom-theme-item ${activePalette === key ? "active" : ""}`;

		const lightBg = p.light?.bg || "#f8fafc";
		const lightPaper = p.light?.paper || "#ffffff";

		item.innerHTML = `
      <div class="st-custom-theme-info">
        <div class="st-theme-swatch-pill" title="Accent, card & background preview">
          <span style="flex: 2; background: ${escapeHtml(p.accent)};"></span>
          <span style="flex: 1; background: ${escapeHtml(lightPaper)};"></span>
          <span style="flex: 1; background: ${escapeHtml(lightBg)};"></span>
        </div>
        <div>
          <div style="font-size: 13px; font-weight: 600; color: var(--st-text);">${escapeHtml(p.name || key)}</div>
          <div style="font-size: 11px; color: var(--st-text-muted); font-family: var(--st-mono);">${escapeHtml(p.accent)}</div>
        </div>
      </div>
      <div style="display: flex; gap: 4px;">
        <button class="st-btn st-btn-sm st-btn-ghost st-edit-palette-btn" title="Edit theme colors">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
        </button>
        <button class="st-btn st-btn-sm st-btn-danger-ghost st-delete-palette-btn" title="Delete theme">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    `;

		// Select as active palette on item click
		item.addEventListener("click", (e) => {
			if ((e.target as HTMLElement).closest("button")) return;
			currentConfig.palette = key;
			localStorage.setItem("bk-palette", key);
			renderPalettes();
			renderCustomPalettes();
			renderLiveAppearancePreview();
			broadcastAppearanceChange();
			saveConfig();
		});

		// Edit button
		item
			.querySelector(".st-edit-palette-btn")
			?.addEventListener("click", (e) => {
				e.stopPropagation();
				openCustomThemeModal(key, p);
			});

		// Delete button
		item
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
				renderLiveAppearancePreview();
				broadcastAppearanceChange();
				saveConfig();
			});

		container.appendChild(item);
	});
}

// ── Modals & Interactive Events ────────────────────────────────────────────

function wireEvents() {
	// Search filter
	$("st-lesson-search")?.addEventListener("input", (e) => {
		lessonSearchQuery = (e.target as HTMLInputElement).value;
		renderCurriculum();
	});

	// Metadata inputs
	$("st-meta-title")?.addEventListener("input", (e) => {
		const val = (e.target as HTMLInputElement).value;
		currentConfig.title = val;
		const headerTitle = $("st-header-title");
		if (headerTitle) headerTitle.textContent = val || "Interactive Course";
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
	document
		.querySelectorAll<HTMLButtonElement>("#st-theme-mode button")
		.forEach((btn) => {
			btn.addEventListener("click", () => {
				const val = btn.dataset.value as "light" | "dark" | "auto";
				currentConfig.theme = val;
				localStorage.setItem("bk-theme", val);
				renderThemeMode();
				renderLiveAppearancePreview();
				broadcastAppearanceChange();
				saveConfig();
			});
		});

	// UI style segmented control
	document
		.querySelectorAll<HTMLButtonElement>("#st-ui-mode button")
		.forEach((btn) => {
			btn.addEventListener("click", () => {
				const val = btn.dataset.value as "standard" | "neo" | "playful";
				currentConfig.ui = val;
				localStorage.setItem("bk-ui", val);
				renderUiMode();
				renderLiveAppearancePreview();
				broadcastAppearanceChange();
				saveConfig();
			});
		});

	// Built-in color swatches
	document
		.querySelectorAll<HTMLButtonElement>("#st-builtin-palettes button")
		.forEach((btn) => {
			btn.addEventListener("click", () => {
				const val = btn.dataset.palette;
				currentConfig.palette = val;
				if (val) localStorage.setItem("bk-palette", val);
				renderPalettes();
				renderCustomPalettes();
				renderLiveAppearancePreview();
				broadcastAppearanceChange();
				saveConfig();
			});
		});

	// New Lesson Modal
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

		setStatus("saving", "Creating lesson...");
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
			setStatus("unsaved", "Failed to create lesson");
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

	// Close modals on clicking backdrop
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
			const customThemeModal = $("st-modal-custom-theme");
			if (customThemeModal) customThemeModal.style.display = "none";
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

	updateThemePreview();

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
			updateThemePreview();
		});

		textEl?.addEventListener("input", () => {
			if (colorEl && /^#[0-9a-f]{6}$/i.test(textEl.value)) {
				colorEl.value = textEl.value;
			}
			updateThemePreview();
		});
	});

	// Save custom theme button
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
		renderLiveAppearancePreview();
		broadcastAppearanceChange();
		saveConfig();
	});
}

function updateThemePreview() {
	const accent = getPickerColor("st-theme-accent");
	const lightPaper = getPickerColor("st-theme-light-paper");

	const card = $("st-theme-preview-card");
	const heading = $("st-preview-heading");
	const btn = $("st-preview-btn");

	if (card) {
		card.style.backgroundColor = lightPaper;
		card.style.borderColor = accent;
	}
	if (heading) {
		heading.style.color = accent;
	}
	if (btn) {
		btn.style.backgroundColor = accent;
	}
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
