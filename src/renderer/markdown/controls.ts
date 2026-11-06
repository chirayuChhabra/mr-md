import type {
	Block,
	SimulationAction,
	SimulationControl,
	SimulationPreset,
} from "../../types.js";
import { escAttr, escHtml } from "../blocks.js";

let simControlScopeCounter = 0;

export function renderSimulationControls(
	block: {
		type?: string;
		src?: string;
		props?: Record<string, unknown>;
		tunables?: Record<string, SimulationControl>;
		actions?: Record<string, SimulationAction>;
		presets?: Record<string, SimulationPreset>;
		advancedControls?: string[];
		controls?: "interactive" | "observe";
		id?: string;
	},
	idPrefix?: string,
): string {
	const props = block.props ?? {};
	const tunables = block.tunables ?? {};
	const actions = block.actions ?? {};
	const presets = block.presets ?? {};

	const actionKeys = Object.keys(actions);
	const presetKeys = Object.keys(presets);
	const hasActions = actionKeys.length > 0;
	const hasPresets = presetKeys.length > 0;

	const allTunableKeys = Object.keys(block.tunables ?? props);

	const keys = allTunableKeys.filter((key) => {
		const control = tunables[key];
		const value = props[key];
		if (control?.type === "select" || control?.type === "segmented") {
			return Array.isArray(control.options) && control.options.length > 0;
		}
		return (
			typeof value === "number" ||
			typeof value === "boolean" ||
			typeof value === "string"
		);
	});

	if (
		(!keys.length && !hasActions && !hasPresets) ||
		(block.type === "simulation" && block.controls === "observe")
	) {
		return "";
	}

	const scopeId =
		idPrefix || block.id || `sim-ctrl-${++simControlScopeCounter}`;

	const controls = keys.map((key) => {
		const control = tunables[key] ?? {};
		let value = props[key];
		let type = control.type;
		if (!type) {
			if (typeof value === "boolean") type = "boolean";
			else if (typeof value === "string") type = "text";
			else type = "range";
		}
		if (
			value === undefined &&
			(type === "select" || type === "segmented") &&
			control.options?.length
		) {
			value = control.options[0].value;
		}
		const label = escHtml(control.label ?? key.replace(/([A-Z])/g, " $1"));
		return { key, value, control, type, label };
	});

	const renderControlItem = ({
		key,
		value,
		control,
		type,
		label,
	}: {
		key: string;
		value: unknown;
		control: SimulationControl;
		type: string;
		label: string;
	}) => {
		if (type === "boolean") {
			return `<label class="bk-sim-toggle">
        <input type="checkbox" data-bk-prop="${escAttr(key)}" ${value ? "checked" : ""}>
        <span>${label}</span>
      </label>`;
		}

		if (type === "text") {
			return `<label class="bk-sim-text">
        <span>${label}</span>
        <input type="text" data-bk-prop="${escAttr(key)}" value="${escAttr(String(value ?? ""))}">
      </label>`;
		}

		if (type === "number") {
			const min = control.min ?? "";
			const max = control.max ?? "";
			const step = control.step ?? "any";
			const unitHtml = control.unit
				? `<span class="bk-sim-unit">${escHtml(control.unit)}</span>`
				: "";
			return `<label class="bk-sim-number">
        <span>${label}</span>
        <div class="bk-sim-input-with-unit">
          <input type="number" data-bk-prop="${escAttr(key)}" min="${escAttr(String(min))}" max="${escAttr(String(max))}" step="${escAttr(String(step))}" value="${escAttr(String(value ?? ""))}">
          ${unitHtml}
        </div>
      </label>`;
		}

		if (type === "select") {
			const options = control.options ?? [];
			const optionsHtml = options
				.map((opt) => {
					const isSelected = opt.value === value;
					return `<option value="${escAttr(String(opt.value))}" data-bk-val="${escAttr(JSON.stringify(opt.value))}" ${isSelected ? "selected" : ""}>${escHtml(opt.label)}</option>`;
				})
				.join("");
			return `<label class="bk-sim-select">
        <span>${label}</span>
        <select data-bk-prop="${escAttr(key)}" aria-label="${label}">
          ${optionsHtml}
        </select>
      </label>`;
		}

		if (type === "segmented") {
			const options = control.options ?? [];
			const radioName = escAttr(`bk-seg-${scopeId}-${key}`);
			const optionsHtml = options
				.map((opt, i) => {
					const isChecked = opt.value === value;
					const optId = `${radioName}-${i}`;
					return `<label class="bk-sim-segmented-item" for="${optId}">
          <input type="radio" id="${optId}" name="${radioName}" data-bk-prop="${escAttr(key)}" value="${escAttr(String(opt.value))}" data-bk-val="${escAttr(JSON.stringify(opt.value))}" ${isChecked ? "checked" : ""}>
          <span>${escHtml(opt.label)}</span>
        </label>`;
				})
				.join("");
			return `<div class="bk-sim-segmented" role="radiogroup" aria-label="${label}">
        <span class="bk-sim-label">${label}</span>
        <div class="bk-sim-segmented-group">
          ${optionsHtml}
        </div>
      </div>`;
		}

		// type === "range"
		const min = control.min ?? Math.min(0, Number(value));
		const max = control.max ?? Math.max(10, Number(value) * 2);
		const step = control.step ?? 1;
		const unitHtml = control.unit
			? `<span class="bk-sim-unit">${escHtml(control.unit)}</span>`
			: "";
		return `<label class="bk-sim-range">
      <span>${label}</span>
      <span class="bk-sim-range-bound">${escAttr(String(min))}</span>
      <input type="range" data-bk-prop="${escAttr(key)}" min="${escAttr(String(min))}" max="${escAttr(String(max))}" step="${escAttr(String(step))}" value="${escAttr(String(value))}">
      <span class="bk-sim-range-bound">${escAttr(String(max))}</span>
      <input type="number" class="bk-sim-range-input" data-bk-sync="${escAttr(key)}" min="${escAttr(String(min))}" max="${escAttr(String(max))}" step="${escAttr(String(step))}" value="${escAttr(String(value))}">
      ${unitHtml}
    </label>`;
	};

	const advList = Array.isArray(block.advancedControls)
		? block.advancedControls
		: [];
	const isAdvanced = (c: { key: string; control: SimulationControl }) => {
		if (typeof c.control.advanced === "boolean") {
			return c.control.advanced;
		}
		return advList.includes(c.key);
	};

	const primaryControls = controls.filter((c) => !isAdvanced(c));
	const advancedControls = controls.filter((c) => isAdvanced(c));

	const sortGroup = (list: typeof controls) => {
		const ranges = list.filter((c) => c.type === "range");
		const booleans = list.filter((c) => c.type === "boolean");
		const others = list.filter(
			(c) =>
				c.type === "text" ||
				c.type === "number" ||
				c.type === "select" ||
				c.type === "segmented",
		);
		return [...ranges, ...others, ...booleans];
	};

	const sortedPrimary = sortGroup(primaryControls);
	const sortedAdvanced = sortGroup(advancedControls);

	const primaryHtml = sortedPrimary.map(renderControlItem).join("\n    ");

	const presetsHtml = hasPresets
		? `<div class="bk-sim-presets">
      <label class="bk-sim-select bk-sim-preset-control">
        <span class="bk-sim-presets-label">Presets</span>
        <select class="bk-sim-preset-select" data-bk-preset-select aria-label="Presets">
          <option value="">Choose preset</option>
          ${presetKeys
						.map((pkey) => {
							const p = presets[pkey];
							const plabel = escHtml(p.label ?? pkey);
							const pprops = escAttr(JSON.stringify(p.props ?? {}));
							return `<option value="${escAttr(pkey)}" data-bk-preset-props="${pprops}">${plabel}</option>`;
						})
						.join("\n          ")}
        </select>
      </label>
    </div>`
		: "";

	const actionsHtml = hasActions
		? `<div class="bk-sim-actions" role="group" aria-label="Actions">
      ${actionKeys
				.map((akey) => {
					const a = actions[akey];
					const alabel = escHtml(a.label ?? akey);
					const color = ["accent", "neutral", "red", "green", "amber"].includes(
						a.color ?? "",
					)
						? a.color
						: "accent";
					return `<button type="button" class="bk-sim-action-btn" data-bk-color="${color}" data-bk-action="${escAttr(akey)}">${alabel}</button>`;
				})
				.join("\n      ")}
    </div>`
		: "";

	const advancedHtml =
		sortedAdvanced.length > 0
			? `<details class="bk-sim-advanced">
      <summary class="bk-sim-advanced-summary">More controls</summary>
      <div class="bk-sim-advanced-body">
        ${sortedAdvanced.map(renderControlItem).join("\n        ")}
      </div>
    </details>`
			: "";

	const defaultPropsAttr = escAttr(JSON.stringify(props));
	const parts = [presetsHtml, primaryHtml, actionsHtml, advancedHtml].filter(
		Boolean,
	);

	return `<div class="bk-sim-controls" aria-label="Simulation controls" data-bk-default-props="${defaultPropsAttr}">
    ${parts.join("\n    ")}
  </div>`;
}
