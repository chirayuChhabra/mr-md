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
});
