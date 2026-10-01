// @ts-nocheck
export function bkWireMaximizeControls() {
	function unmaximizeAll() {
		document.querySelectorAll(".bk-object--maximized").forEach((obj) => {
			obj.classList.remove("bk-object--maximized");
			const btn = obj.querySelector(".bk-object-maximize");
			if (btn) {
				btn.innerHTML =
					'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
			}
		});
		document.body.style.overflow = "";
	}

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

	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			unmaximizeAll();
		}
	});

	window.addEventListener("bk-page-loaded", () => {
		unmaximizeAll();
	});
}

export function bkWireSidebarToggle() {
	const shell = document.querySelector(".bk-shell");
	const saved = localStorage.getItem("bk-sidebar-collapsed");
	if (saved === "true" && shell) {
		shell.setAttribute("data-collapsed", "true");
	}

	document.addEventListener("click", (e) => {
		const target = e.target as HTMLElement;
		const currentShell = document.querySelector(".bk-shell");
		if (target.closest("#bk-sidebar-collapse")) {
			currentShell?.setAttribute("data-collapsed", "true");
			localStorage.setItem("bk-sidebar-collapsed", "true");
		} else if (target.closest("#bk-sidebar-expand")) {
			currentShell?.removeAttribute("data-collapsed");
			localStorage.setItem("bk-sidebar-collapsed", "false");
		}
	});

	window.addEventListener("bk-page-loaded", () => {
		const currentShell = document.querySelector(".bk-shell");
		if (localStorage.getItem("bk-sidebar-collapsed") === "true") {
			currentShell?.setAttribute("data-collapsed", "true");
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
		const text = code.textContent || "";
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(text);
			} else {
				const ta = document.createElement("textarea");
				ta.value = text;
				ta.style.position = "fixed";
				ta.style.opacity = "0";
				document.body.appendChild(ta);
				ta.select();
				document.execCommand("copy");
				document.body.removeChild(ta);
			}
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

let activeScrollSpyCleanup: (() => void) | null = null;

export function bkWireScrollSpy() {
	if (activeScrollSpyCleanup) {
		activeScrollSpyCleanup();
		activeScrollSpyCleanup = null;
	}

	const navLinks = document.querySelectorAll<HTMLElement>(".bk-nav-item");
	if (!navLinks.length) return;

	const nav = document.querySelector<HTMLElement>(".bk-nav");
	let pill = document.querySelector<HTMLElement>(".bk-nav-active-pill");
	if (nav && !pill) {
		pill = document.createElement("div");
		pill.className = "bk-nav-active-pill";
		nav.prepend(pill);
	}

	const sections: {
		id: string;
		el: HTMLElement;
		link: HTMLElement;
	}[] = [];
	navLinks.forEach((l) => {
		const id = l.dataset.id;
		if (id) {
			const el = document.getElementById(id);
			if (el) sections.push({ id, el, link: l });
		}
	});

	if (!sections.length) return;

	let currentActiveIdx = -1;
	let isClickScrolling = false;
	let scrollLockTimer: ReturnType<typeof setTimeout> | null = null;

	function setActive(idx: number, smoothSidebar = true) {
		if (idx < 0 || idx >= sections.length) return;
		if (idx === currentActiveIdx) return;
		currentActiveIdx = idx;

		const target = sections[idx];
		sections.forEach((s, i) => {
			if (i === idx) {
				s.link.classList.add("active");
			} else {
				s.link.classList.remove("active");
			}
		});

		if (pill && target) {
			pill.style.top = `${target.link.offsetTop}px`;
			pill.style.height = `${target.link.offsetHeight}px`;
			pill.style.opacity = "1";

			// Auto-scroll sidebar if active item is out of view
			const sidebar = document.querySelector<HTMLElement>(".bk-sidebar");
			if (sidebar) {
				const linkRect = target.link.getBoundingClientRect();
				const sidebarRect = sidebar.getBoundingClientRect();
				const buffer = 32;

				if (linkRect.bottom > sidebarRect.bottom) {
					sidebar.scrollTo({
						top:
							sidebar.scrollTop +
							(linkRect.bottom - sidebarRect.bottom + buffer),
						behavior: smoothSidebar ? "smooth" : "auto",
					});
				} else if (linkRect.top < sidebarRect.top) {
					sidebar.scrollTo({
						top: sidebar.scrollTop - (sidebarRect.top - linkRect.top + buffer),
						behavior: smoothSidebar ? "smooth" : "auto",
					});
				}
			}
		}
	}

	const mainScrollContainer = document.querySelector<HTMLElement>(".bk-main");
	const scrollTarget: EventTarget = mainScrollContainer || window;

	function getScrollActiveIndex(): number {
		if (!sections.length) return 0;

		const container = mainScrollContainer || document.documentElement;
		const scrollTop = mainScrollContainer
			? mainScrollContainer.scrollTop
			: window.scrollY;
		const scrollHeight = container.scrollHeight;
		const clientHeight = mainScrollContainer
			? mainScrollContainer.clientHeight
			: window.innerHeight;

		// 1. If at bottom of page (within 40px buffer to account for subpixel / mobile rubber-band)
		if (scrollHeight - scrollTop <= clientHeight + 40) {
			return sections.length - 1;
		}

		// 2. If at top of page (before any heading)
		if (scrollTop < 40) {
			return 0;
		}

		// 3. Find the heading currently in reading position
		const containerTop = mainScrollContainer
			? mainScrollContainer.getBoundingClientRect().top
			: 0;
		const threshold = 140;

		let bestIdx = 0;
		for (let i = 0; i < sections.length; i++) {
			const rect = sections[i].el.getBoundingClientRect();
			const relativeTop = rect.top - containerTop;
			if (relativeTop <= threshold) {
				bestIdx = i;
			} else {
				break;
			}
		}

		return bestIdx;
	}

	let ticking = false;
	const onScroll = () => {
		if (isClickScrolling) return;
		if (!ticking) {
			requestAnimationFrame(() => {
				if (!isClickScrolling) {
					const idx = getScrollActiveIndex();
					setActive(idx);
				}
				ticking = false;
			});
			ticking = true;
		}
	};

	const cancelClickLock = () => {
		if (isClickScrolling) {
			isClickScrolling = false;
			if (scrollLockTimer) clearTimeout(scrollLockTimer);
		}
	};

	const onNavClick = (e: MouseEvent) => {
		const target = (e.target as HTMLElement).closest(
			".bk-nav-item",
		) as HTMLElement | null;
		if (!target) return;
		const idx = sections.findIndex((s) => s.link === target);
		if (idx !== -1) {
			setActive(idx);
			isClickScrolling = true;
			if (scrollLockTimer) clearTimeout(scrollLockTimer);
			scrollLockTimer = setTimeout(() => {
				isClickScrolling = false;
			}, 800);
		}
	};

	const onHashNav = (e: Event) => {
		const id = (e as CustomEvent<string>).detail;
		if (!id) return;
		const idx = sections.findIndex((s) => s.id === id);
		if (idx !== -1) {
			setActive(idx);
			isClickScrolling = true;
			if (scrollLockTimer) clearTimeout(scrollLockTimer);
			scrollLockTimer = setTimeout(() => {
				isClickScrolling = false;
			}, 800);
		}
	};

	scrollTarget.addEventListener("scroll", onScroll, { passive: true });
	scrollTarget.addEventListener("wheel", cancelClickLock, { passive: true });
	scrollTarget.addEventListener("touchstart", cancelClickLock, {
		passive: true,
	});
	if (nav) nav.addEventListener("click", onNavClick as EventListener);
	window.addEventListener("bk-hash-nav", onHashNav);

	activeScrollSpyCleanup = () => {
		scrollTarget.removeEventListener("scroll", onScroll);
		scrollTarget.removeEventListener("wheel", cancelClickLock);
		scrollTarget.removeEventListener("touchstart", cancelClickLock);
		if (nav) nav.removeEventListener("click", onNavClick as EventListener);
		window.removeEventListener("bk-hash-nav", onHashNav);
		if (scrollLockTimer) clearTimeout(scrollLockTimer);
	};

	// Initialize active state (hash or initial scroll position)
	const initialHash = window.location.hash.slice(1);
	const initialIdx = initialHash
		? sections.findIndex((s) => s.id === initialHash)
		: -1;
	if (initialIdx !== -1) {
		setActive(initialIdx, false);
	} else {
		setActive(getScrollActiveIndex(), false);
	}
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
