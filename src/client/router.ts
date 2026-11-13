// @ts-nocheck

import { bkIsPhone } from "./device.js";
import { bkInitPhoneApp } from "./phone-app.js";
import { bkCollapseLab } from "./workspace.js";
import { bkExitWorld } from "./world.js";
export function bkInitRouter() {
	if (window.__bk_router_initialized) return;
	window.__bk_router_initialized = true;
	if (bkInitPhoneApp()) return;

	let currentPathname = window.location.pathname;
	let navigationId = 0;
	const pages = new Map<string, Promise<Document>>();
	const scrollPositions = new Map<string, number>();
	const initialUrl = new URL(location.href);
	initialUrl.hash = "";
	pages.set(
		initialUrl.href,
		Promise.resolve(document.cloneNode(true) as Document),
	);
	let pressed: HTMLElement | null = null;
	function clearPress() {
		pressed?.classList.remove("bk-touch-pressed");
		pressed = null;
	}
	document.addEventListener(
		"pointerdown",
		(event) => {
			if (!bkIsPhone() || event.button !== 0) return;
			clearPress();
			pressed = (event.target as Element).closest<HTMLElement>(
				"a, button, summary",
			);
			pressed?.classList.add("bk-touch-pressed");
		},
		{ passive: true },
	);
	for (const event of ["pointerup", "pointercancel", "scroll"]) {
		document.addEventListener(event, clearPress, {
			passive: true,
			capture: true,
		});
	}
	function loadPage(href: string): Promise<Document> {
		const url = new URL(href);
		url.hash = "";
		const key = url.href;
		const cached = pages.get(key);
		if (cached) return cached;
		const request = fetch(key)
			.then((res) => {
				if (!res.ok) throw new Error(`Navigation failed: ${res.status}`);
				return res.text();
			})
			.then((html) => {
				return new DOMParser().parseFromString(html, "text/html");
			})
			.catch((error) => {
				pages.delete(key);
				throw error;
			});
		pages.set(key, request);
		if (pages.size > 8) pages.delete(pages.keys().next().value);
		return request;
	}

	function handleNavigation(url, addToHistory = true) {
		const targetUrl = new URL(url, window.location.origin);
		if (targetUrl.origin !== window.location.origin) return false;

		const pendingWorldHistory = window.__bk_pending_world_popstate;
		if (pendingWorldHistory) {
			const waitingId = ++navigationId;
			pendingWorldHistory.then(() => {
				if (waitingId === navigationId)
					handleNavigation(targetUrl.href, addToHistory);
			});
			return true;
		}

		scrollPositions.set(
			currentPathname,
			document.querySelector(".bk-main")?.scrollTop || 0,
		);
		document.body.classList.add("bk-is-navigating");
		document.querySelector(".bk-main")?.setAttribute("aria-busy", "true");

		const requestId = ++navigationId;
		loadPage(targetUrl.href)
			.then((html) => {
				if (requestId !== navigationId) return;
				const doc = html;

				const newMain = doc.querySelector(".bk-main");
				const newNav = doc.querySelector(".bk-nav");
				const newHeader = doc.querySelector(".bk-sidebar-header");
				const newTopBar = doc.querySelector(".bk-topbar");
				const newTitle = doc.title;

				if (newMain && newNav && newHeader) {
					const updateDOM = () => {
						if (requestId !== navigationId) return;
						bkCollapseLab(true);
						bkExitWorld(undefined, { fromPopstate: true, immediate: true });
						const mainEl = document.querySelector(".bk-main");
						const navEl = document.querySelector(".bk-nav");
						const headerEl = document.querySelector(".bk-sidebar-header");
						const topbarEl = document.querySelector(".bk-topbar");

						if (mainEl) mainEl.innerHTML = newMain.innerHTML;
						if (navEl) navEl.innerHTML = newNav.innerHTML;
						if (headerEl) headerEl.innerHTML = newHeader.innerHTML;
						if (topbarEl && newTopBar) topbarEl.innerHTML = newTopBar.innerHTML;

						const shell = document.querySelector(".bk-shell");
						if (shell) {
							shell.removeAttribute("data-mobile-open");
							const newShell = doc.querySelector(".bk-shell");
							if (newShell?.hasAttribute("data-is-chapter")) {
								shell.setAttribute("data-is-chapter", "true");
							} else {
								shell.removeAttribute("data-is-chapter");
							}
						}

						document.title = newTitle;
						currentPathname = targetUrl.pathname;

						if (addToHistory) {
							window.history.pushState({}, "", targetUrl.href);
						}

						// Reset scroll to top or scroll to hash
						const hash = targetUrl.hash;
						if (hash) {
							// Small delay to ensure DOM is fully updated and rendered
							setTimeout(() => {
								const targetEl = document.getElementById(hash.slice(1));
								if (targetEl) {
									targetEl.scrollIntoView();
									window.dispatchEvent(
										new CustomEvent("bk-hash-nav", { detail: hash.slice(1) }),
									);
								} else {
									window.scrollTo(0, 0);
									if (mainEl) mainEl.scrollTop = 0;
									const sidebarEl = document.querySelector(".bk-sidebar");
									if (sidebarEl) sidebarEl.scrollTop = 0;
								}
							}, 0);
						} else {
							window.scrollTo(0, 0);
							if (mainEl) mainEl.scrollTop = 0;
							const sidebarEl = document.querySelector(".bk-sidebar");
							if (sidebarEl) sidebarEl.scrollTop = 0;
						}

						window.dispatchEvent(new Event("bk-page-loaded"));
						if (bkIsPhone()) {
							if (
								!targetUrl.hash &&
								(!addToHistory ||
									doc.querySelector(".bk-shell[data-is-chapter]"))
							) {
								if (mainEl)
									mainEl.scrollTop =
										scrollPositions.get(targetUrl.pathname) || 0;
							}
							if (
								!window.matchMedia("(prefers-reduced-motion: reduce)").matches
							) {
								const content = mainEl?.querySelector(
									".bk-phone-catalogue, .bk-content",
								);
								content?.animate(
									[
										{
											opacity: 0.65,
											transform: `translateX(${addToHistory && !doc.querySelector(".bk-shell[data-is-chapter]") ? 12 : -12}px)`,
										},
										{ opacity: 1, transform: "translateX(0)" },
									],
									{ duration: 140, easing: "ease-out" },
								);
							}
						}
					};

					if (
						document.startViewTransition &&
						!bkIsPhone() &&
						!window.matchMedia(
							"(pointer: coarse), (prefers-reduced-motion: reduce)",
						).matches
					) {
						document.startViewTransition(() => updateDOM());
					} else {
						updateDOM();
					}
				} else {
					window.location.href = targetUrl.href;
				}
			})
			.catch((err) => {
				if (requestId !== navigationId) return;
				console.warn(
					"PJAX navigation failed, falling back to full reload:",
					err,
				);
				window.location.href = targetUrl.href;
			})
			.finally(() => {
				if (requestId === navigationId) {
					clearPress();
					for (const link of document.querySelectorAll("[data-bk-pending]")) {
						link.removeAttribute("data-bk-pending");
						link.removeAttribute("aria-busy");
					}
					document.body.classList.remove("bk-is-navigating");
					document.querySelector(".bk-main")?.removeAttribute("aria-busy");
				}
			});

		return true;
	}

	const prefetchLink = (e) => {
		const a = e.target.closest("a");
		if (!a?.href || a.hasAttribute("download") || a.target === "_blank") return;
		const rawHref = a.getAttribute("href") || "";
		const url = rawHref.startsWith("#")
			? new URL(rawHref, location.href)
			: new URL(a.href);
		const html =
			url.pathname.endsWith(".html") ||
			!url.pathname.split("/").pop()?.includes(".");
		if (
			url.origin !== location.origin ||
			!html ||
			(url.pathname === location.pathname && url.search === location.search)
		)
			return;
		// The page cache deduplicates in-flight requests and permits retry after eviction.
		loadPage(url.href).catch(() => {});
	};
	let nearbyLinks: IntersectionObserver | undefined;
	let prefetchGeneration = 0;
	function prepareNearbyPages() {
		nearbyLinks?.disconnect();
		const generation = ++prefetchGeneration;
		if (
			!bkIsPhone() ||
			navigator.connection?.saveData ||
			/(^|-)2g$/.test(navigator.connection?.effectiveType || "")
		)
			return;
		const schedule =
			window.requestIdleCallback || ((task) => setTimeout(task, 200));
		schedule(() => {
			if (generation !== prefetchGeneration) return;
			const queue: string[] = [];
			let running = false;
			async function drain() {
				if (running) return;
				running = true;
				while (queue.length && generation === prefetchGeneration) {
					if (document.body.classList.contains("bk-is-navigating")) break;
					await loadPage(queue.shift()!).catch(() => {});
				}
				running = false;
			}
			nearbyLinks = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (!entry.isIntersecting) continue;
						nearbyLinks?.unobserve(entry.target);
						const url = new URL((entry.target as HTMLAnchorElement).href);
						if (url.origin === location.origin) queue.push(url.href);
					}
					void drain();
				},
				{ root: document.querySelector(".bk-main") },
			);
			for (const link of document.querySelectorAll(
				".bk-phone-catalogue li a, .bk-end-link[href]",
			))
				nearbyLinks.observe(link);
		});
	}
	prepareNearbyPages();
	window.addEventListener("bk-page-loaded", prepareNearbyPages);
	document.addEventListener("mouseover", prefetchLink, { passive: true });
	document.addEventListener("touchstart", prefetchLink, { passive: true });

	document.addEventListener("click", (e) => {
		const a = e.target.closest("a");
		if (
			!a?.href ||
			a.hasAttribute("download") ||
			a.href.startsWith("blob:") ||
			a.href.startsWith("data:")
		)
			return;
		if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
		if (a.target === "_blank") return;

		const rawHref = a.getAttribute("href") || "";
		const targetUrl = rawHref.startsWith("#")
			? new URL(rawHref, location.href)
			: new URL(a.href);
		const pathname = targetUrl.pathname;
		const isHtmlOrNoExt =
			pathname.endsWith(".html") || !pathname.split("/").pop()?.includes(".");

		if (targetUrl.origin === window.location.origin && isHtmlOrNoExt) {
			if (
				targetUrl.pathname === window.location.pathname &&
				targetUrl.search === window.location.search
			) {
				const hash = targetUrl.hash;
				if (hash && hash !== "#" && hash !== "#top") {
					e.preventDefault();
					const targetEl = document.getElementById(hash.slice(1));
					if (targetEl) {
						targetEl.scrollIntoView({ behavior: "smooth" });
						if (window.history.pushState) {
							window.history.pushState({}, "", targetUrl.href);
						}
						window.dispatchEvent(
							new CustomEvent("bk-hash-nav", { detail: hash.slice(1) }),
						);
					}
				} else {
					e.preventDefault();
					const mainEl = document.querySelector(".bk-main");
					if (mainEl) mainEl.scrollTo({ top: 0, behavior: "smooth" });
					else window.scrollTo({ top: 0, behavior: "smooth" });
				}
				return;
			}
			e.preventDefault();
			if (bkIsPhone()) {
				for (const pending of document.querySelectorAll("[data-bk-pending]")) {
					pending.removeAttribute("data-bk-pending");
					pending.removeAttribute("aria-busy");
				}
				a.setAttribute("data-bk-pending", "true");
				a.setAttribute("aria-busy", "true");
			}
			handleNavigation(targetUrl.href);
		}
	});

	window.addEventListener("popstate", () => {
		if (typeof window !== "undefined" && window.__bk_suppress_router_popstate) {
			window.__bk_suppress_router_popstate = false;
			return;
		}
		if (
			document.querySelector(".bk-object--maximized") &&
			new URL(window.location.href).pathname === currentPathname
		) {
			bkCollapseLab(true);
			return;
		}
		if (
			document.body.classList.contains("bk-world-immersive") ||
			document.querySelector(
				".bk-world-fullscreen.bk-world--active, .bk-world-fullscreen.bk-world--flying, .bk-world-fullscreen.bk-world--exiting",
			)
		) {
			return;
		}
		bkCollapseLab(true);
		const targetUrl = new URL(window.location.href);
		if (targetUrl.pathname === currentPathname) {
			const hash = targetUrl.hash;
			if (hash) {
				const targetEl = document.getElementById(hash.slice(1));
				if (targetEl) {
					targetEl.scrollIntoView({ behavior: "smooth" });
					window.dispatchEvent(
						new CustomEvent("bk-hash-nav", { detail: hash.slice(1) }),
					);
					return;
				}
			} else {
				const mainEl = document.querySelector(".bk-main");
				if (mainEl) mainEl.scrollTo({ top: 0, behavior: "smooth" });
				window.dispatchEvent(new CustomEvent("bk-hash-nav", { detail: "" }));
				return;
			}
		}
		handleNavigation(window.location.href, false);
	});

	// Handle initial URL hash on first page load
	if (window.location.hash) {
		setTimeout(() => {
			const initialEl = document.getElementById(window.location.hash.slice(1));
			if (initialEl) {
				initialEl.scrollIntoView();
			}
		}, 60);
	}
}
