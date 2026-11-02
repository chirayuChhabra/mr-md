// @ts-nocheck
import { normalIcons, proIcons, proPalettes } from "./icons.js";

export function bkThemeColors(styles) {
	return {
		bg: styles.getPropertyValue("--bg").trim(),
		paper: styles.getPropertyValue("--paper").trim(),
		line: styles.getPropertyValue("--line").trim(),
		"line-strong": styles.getPropertyValue("--line-strong").trim(),
		text: styles.getPropertyValue("--ink").trim(),
		"text-light": styles.getPropertyValue("--muted").trim(),
		accent: styles.getPropertyValue("--accent").trim(),
		"accent-soft": styles.getPropertyValue("--accent-soft").trim(),
	};
}

export function bkBroadcastTheme(targetWindow) {
	const root = document.documentElement;
	const styles = getComputedStyle(root);
	const state = {
		theme: root.dataset.theme || "light",
		palette: root.dataset.palette || "ink",
		ui: root.dataset.ui || "standard",
		colors: bkThemeColors(styles),
	};
	if (targetWindow) {
		targetWindow.postMessage({ type: "bk:theme-sync", state }, "*");
	} else {
		document
			.querySelectorAll(".bk-embed-interactive iframe, .bk-steps-frame iframe")
			.forEach((iframe) => {
				if (iframe.contentWindow)
					iframe.contentWindow.postMessage(
						{ type: "bk:theme-sync", state },
						"*",
					);
			});
	}
}

export function bkWireThemeControls() {
	const root = document.documentElement;
	const themeBtns = document.querySelectorAll(
		".bk-theme-panel button[data-theme]",
	);
	const paletteBtns = document.querySelectorAll(
		".bk-theme-panel button[data-palette]",
	);
	const uiBtns = document.querySelectorAll(".bk-theme-panel button[data-ui]");
	let savedTheme = localStorage.getItem("bk-theme");
	if (!savedTheme) savedTheme = "auto";
	const savedPalette = localStorage.getItem("bk-palette");
	const savedUi = localStorage.getItem("bk-ui");

	function updateThemeBtn(val) {
		themeBtns.forEach((b) => {
			if (b.dataset.theme === val) b.classList.add("active");
			else b.classList.remove("active");
		});
	}

	function applyThemeSetting(val) {
		let resolved = val;
		if (val === "auto") {
			resolved = window.matchMedia("(prefers-color-scheme: dark)").matches
				? "dark"
				: "light";
		}
		root.setAttribute("data-theme", resolved);
		const shell = document.querySelector(".bk-shell");
		if (shell) shell.setAttribute("data-theme", resolved);
	}

	function updatePaletteBtn(val) {
		paletteBtns.forEach((b) => {
			const basePalette = b.dataset.palette;

			if (val === proPalettes[basePalette]) {
				b.innerHTML = proIcons[val];
				b.classList.add("active", "pro-active");
			} else if (val === basePalette) {
				b.innerHTML = normalIcons[basePalette];
				b.classList.add("active");
				b.classList.remove("pro-active");
			} else {
				b.innerHTML = normalIcons[basePalette];
				b.classList.remove("active", "pro-active");
			}
		});
	}

	function updateUiBtn(val) {
		uiBtns.forEach((b) => {
			if (b.dataset.ui === val) b.classList.add("active");
			else b.classList.remove("active");
		});
	}

	if (savedTheme) {
		updateThemeBtn(savedTheme);
		applyThemeSetting(savedTheme);
	}
	const shell = document.querySelector(".bk-shell");
	if (savedPalette) {
		const normalizedPalette = savedPalette === "green" ? "field" : savedPalette;
		updatePaletteBtn(normalizedPalette);
		root.setAttribute("data-palette", normalizedPalette);
		if (shell) shell.setAttribute("data-palette", normalizedPalette);
	}
	if (savedUi) {
		updateUiBtn(savedUi);
		root.setAttribute("data-ui", savedUi);
		if (shell) shell.setAttribute("data-ui", savedUi);
	}

	document.addEventListener("click", (event) => {
		const target = event.target as HTMLElement;
		const themeToggle = target.closest<HTMLElement>("#bk-theme-toggle");
		if (themeToggle) {
			event.stopPropagation();
			const current = root.getAttribute("data-theme") || "light";
			const next = current === "dark" ? "light" : "dark";
			localStorage.setItem("bk-theme", next);
			updateThemeBtn(next);
			applyThemeSetting(next);
			bkBroadcastTheme();
			return;
		}

		const sidebarBtn = target.closest<HTMLElement>("#bk-settings-button");
		if (sidebarBtn) {
			event.stopPropagation();
			const p = document.getElementById("bk-theme-panel");
			if (p) {
				const open = p.hasAttribute("hidden");
				p.hidden = !open;
				sidebarBtn.setAttribute("aria-expanded", String(open));
			}
			return;
		}

		const topbarBtn = target.closest<HTMLElement>("#bk-topbar-settings-btn");
		if (topbarBtn) {
			event.stopPropagation();
			const p = document.getElementById("bk-topbar-theme-panel");
			if (p) {
				const open = p.hasAttribute("hidden");
				p.hidden = !open;
				topbarBtn.setAttribute("aria-expanded", String(open));
			}
			return;
		}

		const tBtn = target.closest<HTMLElement>(
			".bk-theme-panel button[data-theme]",
		);
		if (tBtn) {
			event.stopPropagation();
			const val = tBtn.dataset.theme;
			if (val) {
				localStorage.setItem("bk-theme", val);
				updateThemeBtn(val);
				applyThemeSetting(val);
				bkBroadcastTheme();
			}
			return;
		}

		const pBtn = target.closest<HTMLElement>(
			".bk-theme-panel button[data-palette]",
		);
		if (pBtn) {
			event.stopPropagation();
			const baseVal = pBtn.dataset.palette;
			if (baseVal) {
				const currentVal = root.getAttribute("data-palette") || "ink";
				let newVal = baseVal;
				if (event.detail === 2) {
					newVal =
						currentVal === proPalettes[baseVal]
							? baseVal
							: proPalettes[baseVal];
				} else {
					newVal =
						currentVal === proPalettes[baseVal]
							? proPalettes[baseVal]
							: baseVal;
				}
				localStorage.setItem("bk-palette", newVal);
				updatePaletteBtn(newVal);
				root.setAttribute("data-palette", newVal);
				const shell = document.querySelector(".bk-shell");
				if (shell) shell.setAttribute("data-palette", newVal);
				bkBroadcastTheme();
			}
			return;
		}

		const uBtn = target.closest<HTMLElement>(".bk-theme-panel button[data-ui]");
		if (uBtn) {
			event.stopPropagation();
			const val = uBtn.dataset.ui;
			if (val) {
				localStorage.setItem("bk-ui", val);
				updateUiBtn(val);
				root.setAttribute("data-ui", val);
				const shell = document.querySelector(".bk-shell");
				if (shell) shell.setAttribute("data-ui", val);
				bkBroadcastTheme();
			}
			return;
		}

		if (target.closest(".bk-theme-panel")) {
			event.stopPropagation();
			return;
		}

		const p1 = document.getElementById("bk-theme-panel");
		const p2 = document.getElementById("bk-topbar-theme-panel");
		const b1 = document.getElementById("bk-settings-button");
		const b2 = document.getElementById("bk-topbar-settings-btn");
		if (p1 && !p1.hidden) {
			p1.hidden = true;
			b1?.setAttribute("aria-expanded", "false");
		}
		if (p2 && !p2.hidden) {
			p2.hidden = true;
			b2?.setAttribute("aria-expanded", "false");
		}
	});

	document.addEventListener("keydown", (event) => {
		if (event.key !== "Escape") return;
		const p1 = document.getElementById("bk-theme-panel");
		const p2 = document.getElementById("bk-topbar-theme-panel");
		const b1 = document.getElementById("bk-settings-button");
		const b2 = document.getElementById("bk-topbar-settings-btn");
		if (p1 && !p1.hidden) {
			p1.hidden = true;
			b1?.setAttribute("aria-expanded", "false");
			b1?.focus();
		}
		if (p2 && !p2.hidden) {
			p2.hidden = true;
			b2?.setAttribute("aria-expanded", "false");
			b2?.focus();
		}
	});

	window.addEventListener("bk-page-loaded", () => {
		updateThemeBtn(localStorage.getItem("bk-theme") || "auto");
		updatePaletteBtn(localStorage.getItem("bk-palette") || "ink");
		updateUiBtn(localStorage.getItem("bk-ui") || "standard");
	});

	// Broadcast the initial theme to any iframes already present
	// We use requestAnimationFrame to ensure CSS variables are fully computed
	requestAnimationFrame(() => bkBroadcastTheme());
}

// Global listeners for theme sync
if (typeof window !== "undefined") {
	window.addEventListener("message", (e) => {
		const isValidSource = Array.from(document.querySelectorAll("iframe")).some(
			(f) => f.contentWindow === e.source,
		);
		if (!isValidSource) return;

		if (e.data && e.data.type === "bk:request-theme") {
			// Small delay to ensure CSS has applied if this happens right on load
			requestAnimationFrame(() => bkBroadcastTheme(e.source));
		}
	});

	// Watch for OS theme changes if on auto
	window
		.matchMedia("(prefers-color-scheme: dark)")
		.addEventListener("change", () => {
			const currentSetting = localStorage.getItem("bk-theme") || "auto";
			if (currentSetting === "auto") {
				const resolved = window.matchMedia("(prefers-color-scheme: dark)")
					.matches
					? "dark"
					: "light";
				document.documentElement.setAttribute("data-theme", resolved);
				const shell = document.querySelector(".bk-shell");
				if (shell) shell.setAttribute("data-theme", resolved);
				bkBroadcastTheme();
			}
		});
}
