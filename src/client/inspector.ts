interface InspectorBinding {
	dispose: () => void;
}

const bindings = new Map<HTMLElement, InspectorBinding>();

/** Rebind after lesson navigation; observers must not retain detached lesson DOM. */
export function bkInitInspectors(): void {
	for (const [tabs, binding] of bindings) {
		if (tabs.isConnected) continue;
		binding.dispose();
		bindings.delete(tabs);
	}
	for (const tabs of document.querySelectorAll<HTMLElement>(".bk-sim-tabs")) {
		if (bindings.has(tabs)) continue;
		const cue = tabs.querySelector<HTMLButtonElement>("[data-bk-scroll-more]");
		if (!cue) continue;
		let scheduled: number | null = null;
		const activePanel = () =>
			tabs.querySelector<HTMLElement>(".bk-sim-tabpanel:not([hidden])");
		const update = () => {
			scheduled = null;
			const panel = activePanel();
			if (!panel || !tabs.closest(".bk-object--maximized")) {
				if (!cue.hidden) cue.hidden = true;
				return;
			}
			// Excluding the cue's own height prevents a short panel keeping it visible.
			const available =
				panel.clientHeight + (cue.hidden ? 0 : cue.offsetHeight);
			const overflowing = panel.scrollHeight > available + 2;
			if (cue.hidden === overflowing) cue.hidden = !overflowing;
			if (!overflowing) return;
			const atEnd =
				panel.scrollHeight - panel.clientHeight - panel.scrollTop <= 2;
			cue.dataset.scrollEnd = String(atEnd);
			const label = cue.querySelector("[data-bk-scroll-label]");
			const name = panel.classList.contains("bk-sim-tabpanel--controls")
				? "settings"
				: panel.classList.contains("bk-sim-tabpanel--timeline")
					? "timeline"
					: panel.classList.contains("bk-sim-tabpanel--graphs") ? "graphs" : "measurements";
			if (label)
				label.textContent = atEnd ? "Back to top" : `More ${name} below`;
			cue.setAttribute("aria-controls", panel.id);
		};
		const schedule = () => {
			if (scheduled === null) scheduled = requestAnimationFrame(update);
		};
		const onClick = () => {
			const panel = activePanel();
			if (!panel) return;
			const behavior = window.matchMedia("(prefers-reduced-motion: reduce)")
				.matches
				? "instant"
				: "smooth";
			if (cue.dataset.scrollEnd === "true")
				panel.scrollTo({ top: 0, behavior });
			else
				panel.scrollBy({
					top: Math.max(120, panel.clientHeight * 0.65),
					behavior,
				});
		};
		const resize = new ResizeObserver(schedule);
		for (const panel of tabs.querySelectorAll(".bk-sim-tabpanel")) {
			resize.observe(panel);
			for (const content of panel.children) resize.observe(content);
		}
		const mutation = new MutationObserver(schedule);
		mutation.observe(tabs, {
			subtree: true,
			attributes: true,
			attributeFilter: ["hidden", "open"],
		});
		const figure = tabs.closest(".bk-object");
		if (figure)
			mutation.observe(figure, {
				attributes: true,
				attributeFilter: ["class"],
			});
		tabs.addEventListener("scroll", schedule, true);
		tabs.addEventListener("toggle", schedule, true);
		cue.addEventListener("click", onClick);
		bindings.set(tabs, {
			dispose: () => {
				resize.disconnect();
				mutation.disconnect();
				if (scheduled !== null) cancelAnimationFrame(scheduled);
				tabs.removeEventListener("scroll", schedule, true);
				tabs.removeEventListener("toggle", schedule, true);
				cue.removeEventListener("click", onClick);
			},
		});
		schedule();
	}
}
