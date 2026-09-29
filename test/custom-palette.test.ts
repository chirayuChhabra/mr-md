import { describe, expect, test } from "bun:test";
import { render } from "../src/renderer/index.js";
import type { Lesson } from "../src/types.js";

describe("Custom Palette CSS Generation", () => {
	const sampleLesson: Lesson = {
		meta: {
			title: "Custom Theme Lesson",
			slug: "custom-theme-lesson",
		},
		blocks: [
			{
				type: "heading",
				src: "Welcome to Custom Themes",
			},
			{
				type: "markdown",
				src: "This page is styled with a user-defined theme palette.",
			},
		],
	};

	test("renders custom palette CSS in page output", () => {
		const html = render(sampleLesson, {
			palette: "cyberpunk",
			customPalettes: {
				cyberpunk: {
					name: "Cyberpunk",
					accent: "#00ff88",
					accentSoft: "rgba(0, 255, 136, 0.15)",
					light: {
						bg: "#f0fff4",
						paper: "#ffffff",
						line: "#d0f0dc",
					},
					dark: {
						bg: "#0a0f0c",
						paper: "#111814",
						line: "#1a2e20",
						ink: "#e0ffe8",
					},
				},
			},
		});

		// Check root attributes
		expect(html).toContain('data-palette="cyberpunk"');

		// Check custom CSS generation in <style>
		expect(html).toContain('html[data-palette="cyberpunk"]');
		expect(html).toContain("--accent: #00ff88;");
		expect(html).toContain("--accent-soft: rgba(0, 255, 136, 0.15);");
		expect(html).toContain("--bg: #f0fff4;");
		expect(html).toContain("--paper: #ffffff;");

		// Check dark mode override
		expect(html).toContain('html[data-palette="cyberpunk"][data-theme="dark"]');
		expect(html).toContain("--bg: #0a0f0c;");
		expect(html).toContain("--paper: #111814;");
		expect(html).toContain("--ink: #e0ffe8;");

		// Check prefers-color-scheme media query
		expect(html).toContain("@media (prefers-color-scheme: dark)");
	});

	test("handles minimal custom palette with only accent", () => {
		const html = render(sampleLesson, {
			palette: "minimal",
			customPalettes: {
				minimal: {
					accent: "#ff007f",
				},
			},
		});

		expect(html).toContain('data-palette="minimal"');
		expect(html).toContain('html[data-palette="minimal"]');
		expect(html).toContain("--accent: #ff007f;");
		expect(html).toContain("--accent-soft: #ff007f1a;");
	});
});
