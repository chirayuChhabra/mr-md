// @ts-nocheck
export function bkWireMaximizeControls() {
	document.addEventListener("click", (e) => {
		const btn = (e.target as HTMLElement).closest?.(
			".bk-object-maximize",
		) as HTMLElement;
		if (!btn) return;
		const obj = btn.closest(".bk-object");
		if (!obj) return;
		const isMax = obj.classList.toggle("bk-object--maximized");
		if (isMax) {
			document.body.style.overflow = "hidden";
			btn.innerHTML =
				'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>';
		} else {
			document.body.style.overflow = "";
			btn.innerHTML =
				'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
		}
	});
}

export function bkWireSidebarToggle() {
	document.addEventListener("click", (e) => {
		const target = e.target as HTMLElement;
		const shell = document.querySelector(".bk-shell");
		if (target.closest("#bk-sidebar-collapse")) {
			shell?.setAttribute("data-collapsed", "true");
		} else if (target.closest("#bk-sidebar-expand")) {
			shell?.removeAttribute("data-collapsed");
		}
	});
}

export function bkInitCodeCopy() {
	document.querySelectorAll("pre > code").forEach((code) => {
		const pre = code.parentElement;
		if (!pre) return;
		let container = pre.closest(".bk-code-block");

		if (!container) {
			container = document.createElement("div");
			container.className = "bk-code-block";
			const scroll = document.createElement("div");
			scroll.className = "bk-code-scroll";

			pre.parentNode?.insertBefore(container, pre);
			scroll.appendChild(pre);
			container.appendChild(scroll);
		}

		if (getComputedStyle(container).position === "static") {
			(container as HTMLElement).style.position = "relative";
		}

		// Prevent adding multiple buttons if initialized multiple times
		if (container.querySelector(".bk-copy-btn")) return;

		const btn = document.createElement("button");
		btn.className = "bk-copy-btn";
		btn.innerHTML =
			'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
		btn.setAttribute("aria-label", "Copy code");
		btn.title = "Copy code";
		container.appendChild(btn);
	});
}

export function bkWireCodeCopy() {
	document.addEventListener("click", async (e) => {
		const btn = (e.target as HTMLElement).closest?.(
			".bk-copy-btn",
		) as HTMLElement;
		if (!btn) return;
		const container = btn.closest(".bk-code-block");
		if (!container) return;
		const code = container.querySelector("code");
		if (!code) return;
		try {
			await navigator.clipboard.writeText(code.textContent || "");
			btn.innerHTML =
				'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
			btn.classList.add("copied");
			setTimeout(() => {
				btn.innerHTML =
					'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
				btn.classList.remove("copied");
			}, 2000);
		} catch (err) {
			console.error("Failed to copy", err);
		}
	});
}

let activeScrollSpyObs: IntersectionObserver | null = null;
let activeScrollSpyListener: EventListener | null = null;
let activeScrollSpyTarget: EventTarget | null = null;

export function bkWireScrollSpy() {
	if (activeScrollSpyObs) {
		activeScrollSpyObs.disconnect();
		activeScrollSpyObs = null;
	}
	if (activeScrollSpyListener && activeScrollSpyTarget) {
		activeScrollSpyTarget.removeEventListener(
			"scroll",
			activeScrollSpyListener,
		);
		activeScrollSpyListener = null;
		activeScrollSpyTarget = null;
	}
	const navLinks = document.querySelectorAll(".bk-nav-item");
	if (!navLinks.length) return;

	const nav = document.querySelector(".bk-nav");
	let pill = document.querySelector(".bk-nav-active-pill");
	if (nav && !pill) {
		pill = document.createElement("div");
		pill.className = "bk-nav-active-pill";
		nav.prepend(pill);
	}

	const sections: {
		id: string;
		el: HTMLElement;
		link: HTMLElement;
		isAbove: boolean;
	}[] = [];
	navLinks.forEach((l) => {
		const id = l.dataset.id;
		if (id) {
			const el = document.getElementById(id);
			if (el) sections.push({ id, el, link: l, isAbove: false });
		}
	});

	if (!sections.length) return;

	function setActive(idx: number) {
		let targetTop = 0;
		let targetHeight = 0;
		if (pill && sections[idx]) {
			targetTop = sections[idx].link.offsetTop;
			targetHeight = sections[idx].link.offsetHeight;
		}

		sections.forEach((s, i) => {
			if (i === idx) {
				s.link.classList.add("active");
			} else {
				s.link.classList.remove("active");
			}
		});

		if (pill && sections[idx]) {
			pill.style.top = `${targetTop}px`;
			pill.style.height = `${targetHeight}px`;
			pill.style.opacity = "1";

			// Auto-scroll sidebar if active item is out of view
			const sidebar = document.querySelector(".bk-sidebar");
			if (sidebar) {
				const linkRect = sections[idx].link.getBoundingClientRect();
				const sidebarRect = sidebar.getBoundingClientRect();
				// Use a small buffer to avoid sticking exactly to the edge
				const buffer = 32;

				if (linkRect.bottom > sidebarRect.bottom) {
					sidebar.scrollTop += linkRect.bottom - sidebarRect.bottom + buffer;
				} else if (linkRect.top < sidebarRect.top) {
					sidebar.scrollTop -= sidebarRect.top - linkRect.top + buffer;
				}
			}
		}
	}

	function updateActive() {
		let activeIdx = 0;
		for (let i = 0; i < sections.length; i++) {
			if (sections[i].isAbove) activeIdx = i;
		}

		// If we are at the absolute bottom of the scrolling container, highlight the last element
		const container = mainScrollContainer || document.documentElement;
		const scrollPos = mainScrollContainer
			? mainScrollContainer.scrollTop
			: window.scrollY;
		const scrollHeight = container.scrollHeight;
		const clientHeight = mainScrollContainer
			? mainScrollContainer.clientHeight
			: window.innerHeight;

		if (scrollHeight - scrollPos <= clientHeight + 5) {
			activeIdx = sections.length - 1;
		}

		setActive(activeIdx);
	}

	const mainScrollContainer = document.querySelector(".bk-main");

	// Add a scroll listener to detect when we hit the absolute bottom
	activeScrollSpyListener = () => {
		updateActive();
	};
	activeScrollSpyTarget = mainScrollContainer || window;
	activeScrollSpyTarget.addEventListener("scroll", activeScrollSpyListener, {
		passive: true,
	});

	activeScrollSpyObs = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const section = sections.find((s) => s.el === entry.target);
				if (!section) continue;
				if (entry.isIntersecting) {
					section.isAbove = true;
				} else {
					section.isAbove =
						entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0);
				}
			}
			updateActive();
		},
		{
			root: mainScrollContainer || null,
			rootMargin: "0px 0px -75% 0px",
			threshold: 0,
		},
	);

	sections.forEach((s) => {
		activeScrollSpyObs?.observe(s.el);
	});
	setActive(0);
}

export function bkWireLastLessonTracking() {
	const path = window.location.pathname;
	const isChapterPage = document.querySelector(".bk-chapter-timeline") !== null;

	if (!isChapterPage) {
		const lessonPath = path.replace(/\/$/, "").split("/").pop();
		if (lessonPath) {
			localStorage.setItem(
				"mr-md-last-lesson",
				lessonPath.replace(".html", ""),
			);
		}
	} else {
		const lastLesson = localStorage.getItem("mr-md-last-lesson");
		if (lastLesson) {
			const cards = document.querySelectorAll(".bk-timeline-card");
			for (const card of cards) {
				const href = (card as HTMLAnchorElement).href;
				if (!href) continue;

				const cardUrl = new URL(href, window.location.href);
				const cardPath = cardUrl.pathname
					.replace(/\/$/, "")
					.split("/")
					.pop()
					?.replace(".html", "");

				if (cardPath === lastLesson) {
					card.scrollIntoView({ behavior: "auto", block: "center" });
					card.classList.add("bk-last-opened");
					break;
				}
			}
		}
	}
}
