import type { CustomPalette, MrmdConfig } from "../types.js";

// ── State ──────────────────────────────────────────────────────────────────

let currentConfig: MrmdConfig = {};
let unassignedFiles: string[] = [];
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let editingCustomPaletteKey: string | null = null;

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
		text.textContent = msg || "All changes saved";
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

function renderCurriculum() {
	const container = $("st-lesson-list");
	if (!container) return;

	const lessons = currentConfig.lessons || [];
	container.innerHTML = "";

	if (lessons.length === 0) {
		container.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--st-text-muted); font-size: 13px;">
        No lessons in course yet. Click "New Lesson" or add from unassigned files below.
      </div>`;
		return;
	}

	lessons.forEach((entry, idx) => {
		const file = typeof entry === "string" ? entry : entry.file;
		const title =
			typeof entry === "string"
				? file
						.replace(/^\d+[-_]?/, "")
						.replace(/\.md$/, "")
						.replace(/[-_]/g, " ")
						.replace(/\b\w/g, (c) => c.toUpperCase())
				: entry.title || file;

		const el = document.createElement("div");
		el.className = "st-lesson-item";
		el.draggable = true;
		el.dataset.index = String(idx);

		el.innerHTML = `
      <div class="st-lesson-left">
        <span class="st-drag-handle">⠿</span>
        <span class="st-lesson-num">${idx + 1}</span>
        <div class="st-lesson-info">
          <div class="st-lesson-title">${escapeHtml(title)}</div>
          <div class="st-lesson-file">${escapeHtml(file)}</div>
        </div>
      </div>
      <div class="st-lesson-actions">
        <a class="st-btn st-btn-sm" href="/${file.replace(/\.md$/, "")}.html" target="_blank" title="Preview lesson">
          ↗
        </a>
        <button class="st-btn st-btn-sm st-btn-danger-ghost st-btn-remove-lesson" data-index="${idx}" title="Remove from course">
          ✕
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
				queueSave();
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
			queueSave();
		});

		container.appendChild(el);
	});
}

function renderUnassigned() {
	const panel = $("st-unassigned-panel");
	const container = $("st-unassigned-list");
	if (!panel || !container) return;

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
      <button type="button" title="Add to curriculum">＋</button>
    `;

		pill.querySelector("button")?.addEventListener("click", () => {
			currentConfig.lessons = [...(currentConfig.lessons || []), file];
			unassignedFiles = unassignedFiles.filter((f) => f !== file);
			renderCurriculum();
			renderUnassigned();
			queueSave();
		});

		container.appendChild(pill);
	});
}

function renderMetadata() {
	const titleInput = $<HTMLInputElement>("st-meta-title");
	const descInput = $<HTMLTextAreaElement>("st-meta-desc");
	const authorInput = $<HTMLInputElement>("st-meta-author");

	if (titleInput) titleInput.value = currentConfig.title || "";
	if (descInput) descInput.value = currentConfig.description || "";
	if (authorInput) authorInput.value = currentConfig.author || "";
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
      <div style="font-size: 12px; color: var(--st-text-faint); padding: 8px 0;">
        No custom themes created yet.
      </div>`;
		return;
	}

	keys.forEach((key) => {
		const p = palettes[key];
		const item = document.createElement("div");
		item.className = `st-custom-theme-item ${activePalette === key ? "active" : ""}`;

		item.innerHTML = `
      <div class="st-custom-theme-info">
        <span class="st-swatch-circle" style="background: ${escapeHtml(p.accent)};"></span>
        <span style="font-size: 13px; font-weight: 600;">${escapeHtml(p.name || key)}</span>
      </div>
      <div style="display: flex; gap: 4px;">
        <button class="st-btn st-btn-sm st-edit-palette-btn" title="Edit theme">✎</button>
        <button class="st-btn st-btn-sm st-btn-danger-ghost st-delete-palette-btn" title="Delete theme">✕</button>
      </div>
    `;

		// Select as active palette on item click
		item.addEventListener("click", (e) => {
			if ((e.target as HTMLElement).tagName === "BUTTON") return;
			currentConfig.palette = key;
			renderPalettes();
			renderCustomPalettes();
			queueSave();
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
				}
				renderPalettes();
				renderCustomPalettes();
				queueSave();
			});

		container.appendChild(item);
	});
}

// ── Modals & Interactive Events ────────────────────────────────────────────

function wireEvents() {
	// Metadata inputs
	$("st-meta-title")?.addEventListener("input", (e) => {
		currentConfig.title = (e.target as HTMLInputElement).value;
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
				currentConfig.theme = btn.dataset.value as "light" | "dark" | "auto";
				renderThemeMode();
				queueSave();
			});
		});

	// UI style segmented control
	document
		.querySelectorAll<HTMLButtonElement>("#st-ui-mode button")
		.forEach((btn) => {
			btn.addEventListener("click", () => {
				currentConfig.ui = btn.dataset.value as "standard" | "neo" | "playful";
				renderUiMode();
				queueSave();
			});
		});

	// Built-in color swatches
	document
		.querySelectorAll<HTMLButtonElement>("#st-builtin-palettes button")
		.forEach((btn) => {
			btn.addEventListener("click", () => {
				currentConfig.palette = btn.dataset.palette;
				renderPalettes();
				renderCustomPalettes();
				queueSave();
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

		const modal = $("st-modal-custom-theme");
		if (modal) modal.style.display = "none";

		renderPalettes();
		renderCustomPalettes();
		queueSave();
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
