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
			.querySelectorAll(".bk-embed-interactive iframe")
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
	const button = document.getElementById("bk-settings-button");
	const panel = document.getElementById("bk-theme-panel");
	const themeBtns = document.querySelectorAll("#bk-theme-icons button");
	const paletteBtns = document.querySelectorAll("#bk-palette-icons button");
	const uiBtns = document.querySelectorAll("#bk-ui-icons button");
	const savedTheme = localStorage.getItem("bk-theme");
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

	const activeTheme = savedTheme || root.dataset.theme || "auto";
	updateThemeBtn(activeTheme);
	applyThemeSetting(activeTheme);

	const shell = document.querySelector(".bk-shell");
	const activePalette = savedPalette || root.dataset.palette || "ink";
	const normalizedPalette = activePalette === "green" ? "field" : activePalette;
	updatePaletteBtn(normalizedPalette);
	root.setAttribute("data-palette", normalizedPalette);
	if (shell) shell.setAttribute("data-palette", normalizedPalette);

	const activeUi = savedUi || root.dataset.ui || "standard";
	updateUiBtn(activeUi);
	root.setAttribute("data-ui", activeUi);
	if (shell) shell.setAttribute("data-ui", activeUi);

	if (typeof window !== "undefined") {
		window.bkBroadcastTheme = bkBroadcastTheme;
	}

	if (typeof BroadcastChannel !== "undefined") {
		const studioChannel = new BroadcastChannel("mrmd-studio-sync");
		studioChannel.onmessage = (event) => {
			const data = event.data;
			if (data?.type !== "appearance-update") return;

			const curShell = document.querySelector(".bk-shell");

			if (data.theme) {
				let resolvedTheme = data.theme;
				if (resolvedTheme === "auto") {
					resolvedTheme = window.matchMedia?.("(prefers-color-scheme: dark)")
						?.matches
						? "dark"
						: "light";
				}
				root.setAttribute("data-theme", resolvedTheme);
				if (curShell) curShell.setAttribute("data-theme", resolvedTheme);
				localStorage.setItem("bk-theme", data.theme);
				updateThemeBtn(data.theme);
			}

			if (data.palette) {
				const p = data.palette === "green" ? "field" : data.palette;
				root.setAttribute("data-palette", p);
				if (curShell) curShell.setAttribute("data-palette", p);
				localStorage.setItem("bk-palette", p);
				updatePaletteBtn(p);
			}

			if (data.ui) {
				root.setAttribute("data-ui", data.ui);
				if (curShell) curShell.setAttribute("data-ui", data.ui);
				localStorage.setItem("bk-ui", data.ui);
				updateUiBtn(data.ui);
			}

			if (data.customPalettes && Object.keys(data.customPalettes).length > 0) {
				let customStyleEl = document.getElementById(
					"mrmd-custom-palettes-live",
				);
				if (!customStyleEl) {
					customStyleEl = document.createElement("style");
					customStyleEl.id = "mrmd-custom-palettes-live";
					document.head.appendChild(customStyleEl);
				}
				let css = "";
				for (const [key, palette] of Object.entries(data.customPalettes)) {
					const light = palette.light ?? {};
					const dark = palette.dark ?? {};
					const accentSoft = palette.accentSoft ?? `${palette.accent}1a`;
					css += `html[data-palette="${key}"], .bk-shell[data-palette="${key}"] { --accent: ${light.accent ?? palette.accent}; --accent-soft: ${light.accentSoft ?? accentSoft}; ${light.bg ? `--bg: ${light.bg};` : ""} ${light.paper ? `--paper: ${light.paper};` : ""} }\n`;
					css += `html[data-palette="${key}"][data-theme="dark"], .bk-shell[data-palette="${key}"][data-theme="dark"] { --accent: ${dark.accent ?? palette.accent}; --accent-soft: ${dark.accentSoft ?? accentSoft}; ${dark.bg ? `--bg: ${dark.bg};` : ""} ${dark.paper ? `--paper: ${dark.paper};` : ""} }\n`;
				}
				customStyleEl.textContent = css;
			} else if (data.customPalettes) {
				const customStyleEl = document.getElementById(
					"mrmd-custom-palettes-live",
				);
				if (customStyleEl) customStyleEl.remove();
			}

			bkBroadcastTheme();
		};
	}

	button &&
		panel &&
		button.addEventListener("click", (event) => {
			event.stopPropagation();
			const open = panel.hasAttribute("hidden");
			panel.hidden = !open;
			button.setAttribute("aria-expanded", String(open));
		});

	panel?.addEventListener("click", (event) => event.stopPropagation());
	document.addEventListener("click", () => {
		if (!button || !panel || panel.hidden) return;
		panel.hidden = true;
		button.setAttribute("aria-expanded", "false");
	});
	document.addEventListener("keydown", (event) => {
		if (event.key !== "Escape" || !button || !panel || panel.hidden) return;
		panel.hidden = true;
		button.setAttribute("aria-expanded", "false");
		button.focus();
	});

	themeBtns.forEach((btn) => {
		btn.addEventListener("click", () => {
			const val = btn.dataset.theme;
			localStorage.setItem("bk-theme", val);
			updateThemeBtn(val);
			applyThemeSetting(val);
			bkBroadcastTheme();
		});
	});

	paletteBtns.forEach((btn) => {
		btn.addEventListener("click", (e) => {
			const baseVal = btn.dataset.palette;
			const currentVal = root.getAttribute("data-palette") || "ink";
			let newVal = baseVal;

			if (e.detail === 2) {
				if (currentVal === proPalettes[baseVal]) {
					newVal = baseVal;
				} else {
					newVal = proPalettes[baseVal];
				}
			} else {
				if (currentVal === proPalettes[baseVal]) {
					newVal = proPalettes[baseVal];
				}
			}

			localStorage.setItem("bk-palette", newVal);
			updatePaletteBtn(newVal);
			root.setAttribute("data-palette", newVal);
			const shell = document.querySelector(".bk-shell");
			if (shell) shell.setAttribute("data-palette", newVal);
			bkBroadcastTheme();
		});
	});

	uiBtns.forEach((btn) => {
		btn.addEventListener("click", () => {
			const val = btn.dataset.ui;
			localStorage.setItem("bk-ui", val);
			updateUiBtn(val);
			root.setAttribute("data-ui", val);
			const shell = document.querySelector(".bk-shell");
			if (shell) shell.setAttribute("data-ui", val);
			bkBroadcastTheme();
		});
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
