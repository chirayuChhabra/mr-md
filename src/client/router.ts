// @ts-nocheck
export function bkInitRouter() {
	if (window.__bk_router_initialized) return;
	window.__bk_router_initialized = true;

	let currentPathname = window.location.pathname;

	function handleNavigation(url, addToHistory = true) {
		const targetUrl = new URL(url, window.location.origin);
		if (targetUrl.origin !== window.location.origin) return false;

		document.body.classList.add("bk-is-navigating");

		fetch(targetUrl.href)
			.then((res) => res.text())
			.then((html) => {
				const parser = new DOMParser();
				const doc = parser.parseFromString(html, "text/html");

				const newMain = doc.querySelector(".bk-main");
				const newNav = doc.querySelector(".bk-nav");
				const newHeader = doc.querySelector(".bk-sidebar-header");
				const newTopBar = doc.querySelector(".bk-topbar");
				const newTitle = doc.title;

				if (newMain && newNav && newHeader) {
					const updateDOM = () => {
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
					};

					if (document.startViewTransition) {
						document.startViewTransition(() => updateDOM());
					} else {
						updateDOM();
					}
				} else {
					window.location.href = targetUrl.href;
				}
			})
			.catch((err) => {
				console.warn(
					"PJAX navigation failed, falling back to full reload:",
					err,
				);
				window.location.href = targetUrl.href;
			})
			.finally(() => {
				document.body.classList.remove("bk-is-navigating");
			});

		return true;
	}

	const prefetched = new Set();
	const prefetchLink = (e) => {
		const a = e.target.closest("a");
		if (!a?.href) return;
		const targetUrl = new URL(a.href);
		const pathname = targetUrl.pathname;
		const isHtmlOrNoExt =
			pathname.endsWith(".html") || !pathname.split("/").pop()?.includes(".");

		if (targetUrl.origin === window.location.origin && isHtmlOrNoExt) {
			const cleanHref =
				targetUrl.origin + targetUrl.pathname + targetUrl.search;
			if (!prefetched.has(cleanHref)) {
				prefetched.add(cleanHref);
				const link = document.createElement("link");
				link.rel = "prefetch";
				link.href = cleanHref;
				document.head.appendChild(link);
			}
		}
	};
	document.addEventListener("mouseover", prefetchLink, { passive: true });
	document.addEventListener("touchstart", prefetchLink, { passive: true });

	document.addEventListener("click", (e) => {
		const a = e.target.closest("a");
		if (!a?.href) return;
		if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
		if (a.target === "_blank") return;

		const targetUrl = new URL(a.href);
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
			handleNavigation(targetUrl.href);
		}
	});

	window.addEventListener("popstate", () => {
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
		currentPathname = targetUrl.pathname;
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
