// @ts-nocheck

function parseTypedVal(rawAttr, fallback) {
	if (rawAttr !== undefined && rawAttr !== null) {
		try {
			return JSON.parse(rawAttr);
		} catch {
			return fallback;
		}
	}
	return fallback;
}

export function bkReadSimProps(figure) {
	const props = {};
	figure.querySelectorAll("[data-bk-prop]").forEach((el) => {
		const propKey = el.dataset.bkProp;
		if (el.tagName === "SELECT") {
			const select = el;
			const opt =
				select.selectedOptions?.[0] || select.options[select.selectedIndex];
			if (opt) {
				props[propKey] = parseTypedVal(opt.dataset.bkVal, opt.value);
			}
		} else if (el.type === "radio") {
			if (el.checked) {
				props[propKey] = parseTypedVal(el.dataset.bkVal, el.value);
			}
		} else if (el.type === "checkbox") {
			props[propKey] = el.checked;
		} else if (el.type === "range" || el.type === "number") {
			const num = Number(el.value);
			props[propKey] = Number.isNaN(num) ? el.value : num;
		} else {
			props[propKey] = el.value;
		}
	});
	return props;
}

export function updateSliderTrack(input) {
	if (input.type !== "range") return;
	const min = parseFloat(input.min) || 0;
	const max = parseFloat(input.max) || 100;
	const val = parseFloat(input.value) || 0;
	const percent = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
	input.style.setProperty("--bk-track-fill", `${percent}%`);
}

export function bkApplyPropsToControls(figure, props) {
	if (!props || typeof props !== "object") return;
	for (const [key, val] of Object.entries(props)) {
		figure.querySelectorAll("[data-bk-prop]").forEach((el) => {
			if (el.dataset.bkProp !== key) return;
			if (el.tagName === "SELECT") {
				const select = el;
				for (let i = 0; i < select.options.length; i++) {
					const opt = select.options[i];
					const optVal = parseTypedVal(opt.dataset.bkVal, opt.value);
					if (optVal === val) {
						select.selectedIndex = i;
						break;
					}
				}
			} else if (el.type === "radio") {
				const radioVal = parseTypedVal(el.dataset.bkVal, el.value);
				el.checked = radioVal === val;
			} else if (el.type === "checkbox") {
				el.checked = Boolean(val);
			} else if (el.type === "range" || el.type === "number") {
				el.value = String(val);
				if (el.type === "range") {
					updateSliderTrack(el);
				}
				const sync = el.parentElement?.querySelector("[data-bk-sync]");
				if (sync) {
					sync.value = String(val);
				}
			} else {
				el.value = String(val ?? "");
			}
		});
	}
}

export function bkGetCurrentProps(figure) {
	if (!figure.__bkCurrentProps) {
		const controlsEl = figure.querySelector(".bk-sim-controls");
		let defaults = {};
		if (controlsEl && controlsEl.dataset.bkDefaultProps) {
			try {
				defaults = JSON.parse(controlsEl.dataset.bkDefaultProps);
			} catch {}
		}
		const visible = bkReadSimProps(figure);
		figure.__bkCurrentProps = { ...defaults, ...visible };
	}
	return figure.__bkCurrentProps;
}

export function bkInitSimControls() {
	// Initialize all slider tracks
	document
		.querySelectorAll('input[type="range"][data-bk-prop]')
		.forEach(updateSliderTrack);
}

export function bkWireSimControls() {
	const handler = (e) => {
		const target = e.target;
		const presetSelect = target.closest?.("select[data-bk-preset-select]");
		if (presetSelect && e.type === "change") {
			const figure = presetSelect.closest(".bk-object");
			if (!figure) return;
			const opt =
				presetSelect.selectedOptions?.[0] ||
				presetSelect.options[presetSelect.selectedIndex];
			const presetKey = opt?.value;
			if (!presetKey) return;

			let presetProps = {};
			if (opt?.dataset.bkPresetProps) {
				try {
					presetProps = JSON.parse(opt.dataset.bkPresetProps);
				} catch {}
			}
			const current = bkGetCurrentProps(figure);
			const merged = { ...current, ...presetProps };
			figure.__bkCurrentProps = merged;

			bkApplyPropsToControls(figure, merged);

			presetSelect.value = presetKey;

			figure.querySelectorAll("[data-bk-preset]").forEach((btn) => {
				if (btn.dataset.bkPreset === presetKey) {
					btn.classList.add("is-active");
				} else {
					btn.classList.remove("is-active");
				}
			});

			const iframe = figure.querySelector("iframe");
			iframe?.contentWindow?.postMessage(
				{ type: "bk:set-props", props: merged },
				"*",
			);
			return;
		}

		let propInput = target.closest?.("[data-bk-prop]");
		let syncInput = target.closest?.("[data-bk-sync]");

		if (syncInput && !propInput) {
			const propName = syncInput.dataset.bkSync;
			propInput = syncInput.parentElement?.querySelector(
				`[data-bk-prop="${propName}"]`,
			);
			if (propInput) {
				let val = parseFloat(syncInput.value);
				if (!Number.isNaN(val) && e.type === "change") {
					const min = parseFloat(syncInput.min);
					const max = parseFloat(syncInput.max);
					if (!Number.isNaN(min) && val < min) val = min;
					if (!Number.isNaN(max) && val > max) val = max;
					syncInput.value = val;
				}
				propInput.value = syncInput.value;
				updateSliderTrack(propInput);
			}
		} else if (propInput) {
			const propName = propInput.dataset.bkProp;
			syncInput = propInput.parentElement?.querySelector(
				`[data-bk-sync="${propName}"]`,
			);
			if (syncInput && e.target !== syncInput) {
				syncInput.value = propInput.value;
			}
			updateSliderTrack(propInput);
		}

		if (!propInput) return;
		const figure = propInput.closest(".bk-object");
		if (!figure) return;
		const iframe = figure.querySelector("iframe");
		if (!iframe) return;

		const current = bkGetCurrentProps(figure);
		const visible = bkReadSimProps(figure);
		const merged = { ...current, ...visible };
		figure.__bkCurrentProps = merged;

		figure.querySelectorAll("[data-bk-preset].is-active").forEach((btn) => {
			btn.classList.remove("is-active");
		});
		figure.querySelectorAll("select[data-bk-preset-select]").forEach((sel) => {
			sel.value = "";
		});

		iframe.contentWindow?.postMessage(
			{ type: "bk:set-props", props: merged },
			"*",
		);
	};

	const clickHandler = (e) => {
		const target = e.target;
		const actionBtn = target.closest?.("[data-bk-action]");
		if (actionBtn) {
			const figure = actionBtn.closest(".bk-object");
			if (!figure) return;
			const actionKey = actionBtn.dataset.bkAction;
			const iframe = figure.querySelector("iframe");
			iframe?.contentWindow?.postMessage(
				{ type: "bk:action", action: actionKey },
				"*",
			);
			return;
		}

		const presetBtn = target.closest?.("[data-bk-preset]");
		if (presetBtn) {
			const figure = presetBtn.closest(".bk-object");
			if (!figure) return;
			let presetProps = {};
			if (presetBtn.dataset.bkPresetProps) {
				try {
					presetProps = JSON.parse(presetBtn.dataset.bkPresetProps);
				} catch {}
			}
			const current = bkGetCurrentProps(figure);
			const merged = { ...current, ...presetProps };
			figure.__bkCurrentProps = merged;

			bkApplyPropsToControls(figure, merged);

			figure.querySelectorAll("[data-bk-preset]").forEach((btn) => {
				if (btn === presetBtn) {
					btn.classList.add("is-active");
				} else {
					btn.classList.remove("is-active");
				}
			});

			const presetKey = presetBtn.dataset.bkPreset;
			if (presetKey) {
				figure
					.querySelectorAll("select[data-bk-preset-select]")
					.forEach((sel) => {
						sel.value = presetKey;
					});
			}

			const iframe = figure.querySelector("iframe");
			iframe?.contentWindow?.postMessage(
				{ type: "bk:set-props", props: merged },
				"*",
			);
			return;
		}
	};

	document.addEventListener("input", handler, { passive: true });
	document.addEventListener("change", handler, { passive: true });
	document.addEventListener("click", clickHandler);
}
