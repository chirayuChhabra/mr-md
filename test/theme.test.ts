import { describe, expect, test } from "bun:test";
import { bkThemeColors } from "../src/client/theme.js";

describe("simulation theme colors", () => {
	test("maps iframe text tokens to the host ink and muted colors", () => {
		const values: Record<string, string> = {
			"--bg": "#07090c",
			"--paper": "#121212",
			"--line": "#182028",
			"--line-strong": "#24303c",
			"--ink": "#f0f0f0",
			"--muted": "#a1a1aa",
			"--accent": "#60a5fa",
			"--accent-soft": "rgba(96, 165, 250, 0.1)",
		};
		const styles = {
			getPropertyValue(name: string) {
				return values[name] ?? "";
			},
		};

		expect(bkThemeColors(styles)).toEqual({
			bg: "#07090c",
			paper: "#121212",
			line: "#182028",
			"line-strong": "#24303c",
			text: "#f0f0f0",
			"text-light": "#a1a1aa",
			accent: "#60a5fa",
			"accent-soft": "rgba(96, 165, 250, 0.1)",
		});
	});

	test("theme.css includes Neo pseudo-element reset and timeline fixes", async () => {
		const fs = await import("fs");
		const path = await import("path");
		const css = fs.readFileSync(path.join(__dirname, "../src/styles/theme.css"), "utf-8");

		// Universal pseudo-element reset for Neo mode
		expect(css).toContain('html[data-ui="neo"] *::before');
		expect(css).toContain('html[data-ui="neo"] *::after');

		// Neo timeline card fixes (sharp corners, no inner curve pseudo element)
		expect(css).toContain('html[data-ui="neo"] .bk-timeline-content');
		expect(css).toContain('html[data-ui="neo"] .bk-timeline-content::before');
		expect(css).toContain('display: none !important');

		// Neo tag styling and tag overflow
		expect(css).toContain('html[data-ui="neo"] .bk-tag');
		expect(css).toContain('.bk-tag-overflow');

		// Neo settings panel & segmented control polish
		expect(css).toContain('html[data-ui="neo"] .bk-segmented-control');
		expect(css).toContain('html[data-ui="neo"] .bk-theme-panel');

		// Top bar and toggle consistency
		expect(css).toContain('.bk-sidebar-top-bar');
		expect(css).toContain('.bk-sidebar-collapse');
		expect(css).toContain('top: 50%');

		// Back link has transparent border to prevent hover reflow
		expect(css).toContain('.bk-back-link');
		expect(css).toContain('border-bottom: 1px solid transparent !important');

		// Hero eyebrow row and byline
		expect(css).toContain('.bk-hero-eyebrow-row');
		expect(css).toContain('.bk-hero-byline');
	});
});
