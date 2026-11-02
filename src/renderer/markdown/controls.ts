import type { Block } from "../../types.js";
import { escAttr, escHtml } from "../blocks.js";

export function renderSimulationControls(
	block: Extract<Block, { type: "simulation" }>,
): string {
	const props = block.props ?? {};
	const keys = Object.keys(block.tunables ?? props).filter((key) => {
		const value = props[key];
		return (
			typeof value === "number" ||
			typeof value === "boolean" ||
			typeof value === "string"
		);
	});

	if (!keys.length || block.controls === "observe") return "";

	const controls = keys.map((key) => {
		const value = props[key];
		const control = block.tunables?.[key] ?? {};
		let type = control.type;
		if (!type) {
			if (typeof value === "boolean") type = "boolean";
			else if (typeof value === "string") type = "text";
			else type = "range";
		}
		const label = escHtml(control.label ?? key.replace(/([A-Z])/g, " $1"));
		return { key, value, control, type, label };
	});

	const ranges = controls.filter((c) => c.type === "range");
	const booleans = controls.filter((c) => c.type === "boolean");
	const others = controls.filter(
		(c) => c.type === "text" || c.type === "number",
	);

	const sortedControls = [...ranges, ...others, ...booleans];

	let firstBooleanRendered = false;

	return `<div class="bk-sim-controls" aria-label="Simulation controls">
    ${sortedControls
			.map(({ key, value, control, type, label }) => {
				if (type === "boolean") {
					const isFirst = !firstBooleanRendered;
					firstBooleanRendered = true;
					const extraClass = isFirst ? " bk-sim-toggle--first" : "";
					return `<label class="bk-sim-toggle${extraClass}">
            <input type="checkbox" data-bk-prop="${escAttr(key)}" ${value ? "checked" : ""}>
            <span>${label}</span>
          </label>`;
				}

				if (type === "text") {
					return `<label class="bk-sim-text">
            <span>${label}</span>
            <input type="text" data-bk-prop="${escAttr(key)}" value="${escAttr(String(value))}">
          </label>`;
				}

				if (type === "number") {
					const min = control.min ?? "";
					const max = control.max ?? "";
					const step = control.step ?? "any";
					return `<label class="bk-sim-number">
            <span>${label}</span>
            <input type="number" data-bk-prop="${escAttr(key)}" min="${min}" max="${max}" step="${step}" value="${value}">
          </label>`;
				}

				// type === "range"
				const min = control.min ?? Math.min(0, Number(value));
				const max = control.max ?? Math.max(10, Number(value) * 2);
				const step = control.step ?? 1;
				return `<label class="bk-sim-range">
          <span>${label}</span>
          <span class="bk-sim-range-bound">${min}</span>
          <input type="range" data-bk-prop="${escAttr(key)}" min="${min}" max="${max}" step="${step}" value="${value}">
          <span class="bk-sim-range-bound">${max}</span>
          <input type="number" class="bk-sim-range-input" data-bk-sync="${escAttr(key)}" min="${min}" max="${max}" step="${step}" value="${value}">
        </label>`;
			})
			.join("")}
  </div>`;
}
