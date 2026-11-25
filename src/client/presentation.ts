import type { BlogKitSettings } from "../config.js";

export interface PageSettings {
	settings: BlogKitSettings;
	theme: string;
	palette: string;
	ui: string;
	density: string;
	tone: string;
}

/** Used after navigation as well as initial load, including phone routes. */
export function bkApplyPageSettings(): void {
	const element = document.querySelector<HTMLScriptElement>(
		".bk-main .bk-page-settings",
	);
	if (!element?.textContent) return;
	const page: PageSettings = JSON.parse(element.textContent);
	const root = document.documentElement;
	const shell = document.querySelector<HTMLElement>(".bk-shell");
	const mode = localStorage.getItem("bk-theme") || page.theme;
	const theme =
		mode === "auto"
			? matchMedia("(prefers-color-scheme: dark)").matches
				? "dark"
				: "light"
			: mode;
	root.dataset.bkThemeDefault = page.theme;
	root.dataset.bkPaletteDefault = page.palette;
	root.dataset.bkUiDefault = page.ui;
	root.dataset.bkWidth = page.settings.layout ?? "";
	for (const node of [root, shell]) {
		if (!node) continue;
		node.dataset.theme = theme;
		node.dataset.palette = localStorage.getItem("bk-palette") || page.palette;
		node.dataset.ui = localStorage.getItem("bk-ui") || page.ui;
		const variables = {
			"--accent": page.settings.theme?.accent,
			"--font-sans": page.settings.theme?.font,
			"--font-display": page.settings.theme?.headingFont,
			"--font-mono": page.settings.theme?.monoFont,
		};
		for (const [key, value] of Object.entries(variables)) {
			if (value) node.style.setProperty(key, value);
			else node.style.removeProperty(key);
		}
	}
	for (const [prefix, value] of [
		["bk-density-", page.density ?? "comfortable"],
		["bk-tone-", page.tone ?? "scholarly"],
	] as const) {
		for (const name of [...document.body.classList])
			if (name.startsWith(prefix)) document.body.classList.remove(name);
		document.body.classList.add(`${prefix}${value}`);
	}
}
