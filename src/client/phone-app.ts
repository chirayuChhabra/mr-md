import {
	type PhoneAppData,
	type PhoneRouteData,
	readPhoneAppData,
} from "../phone-app-data.js";
import { bkIsPhone } from "./device.js";

interface SearchPassage {
	key: string;
	id: string;
	title: string;
	section: string;
	text: string;
}

type NavigationMode = "push" | "replace" | "pop";

interface Screen {
	element: HTMLElement;
	scroll: number;
}

function requiredElement<T extends Element = HTMLElement>(
	root: ParentNode,
	selector: string,
): T {
	const element = root.querySelector<T>(selector);
	if (!element) throw new Error(`Missing phone UI element: ${selector}`);
	return element;
}

export function bkInitPhoneApp(): boolean {
	const source = document.querySelector<HTMLMetaElement>(
		'meta[name="bk-phone-app"]',
	);
	if (!source || !bkIsPhone()) return false;
	const main = requiredElement<HTMLElement>(document, ".bk-main");
	const shell = requiredElement<HTMLElement>(document, ".bk-shell");
	const sourceUrl = new URL(source.content, location.href);
	const base = new URL("../", sourceUrl);
	const screens = new Map<string, Screen>();
	let data: PhoneAppData | undefined;
	let current =
		decodeURIComponent(location.pathname.slice(base.pathname.length)) ||
		"index.html";
	let historyIndex = 0;
	let requestId = 0;
	let pendingNavigation: { url: URL; mode: NavigationMode } | undefined;
	let transition: Animation | undefined;
	const reducedMotion = () =>
		matchMedia("(prefers-reduced-motion: reduce)").matches;
	const appbar = requiredElement<HTMLElement>(document, ".bk-phone-appbar");
	const contents = requiredElement(document, "#bk-phone-contents");
	document.querySelector(".bk-phone-nav")?.prepend(contents);
	let scrollAnchor = main.scrollTop;
	function revealToolbar() {
		shell.removeAttribute("data-toolbar-hidden");
		scrollAnchor = main.scrollTop;
	}
	main.addEventListener(
		"scroll",
		() => {
			const top = main.scrollTop;
			if (
				top < 80 ||
				shell.hasAttribute("data-mobile-open") ||
				document.activeElement?.closest(".cm-editor, textarea, input") ||
				(document.activeElement?.matches(":focus-visible") &&
					document.activeElement.closest(".bk-phone-appbar")) ||
				document.querySelector(".bk-phone-search-dialog[open]")
			) {
				revealToolbar();
				return;
			}
			if (Math.abs(top - scrollAnchor) < 16) return;
			shell.toggleAttribute("data-toolbar-hidden", top > scrollAnchor);
			scrollAnchor = top;
		},
		{ passive: true },
	);
	appbar.addEventListener("focusin", revealToolbar);
	main.addEventListener("focusin", (event) => {
		if (
			(event.target as Element).closest(".cm-editor, input, textarea, select")
		)
			revealToolbar();
	});
	const passages = (root: ParentNode) =>
		Array.from(
			root.querySelectorAll<HTMLElement>(
				".bk-content h1, .bk-content h2, .bk-content h3, .bk-content h4, .bk-content p, .bk-content pre, .bk-content li, .bk-content .bk-code-runner",
			),
		).filter(
			(el) =>
				!el.closest(".bk-end-nav, .bk-quiz, .bk-object") &&
				(!el.closest(".bk-code-runner") || el.matches(".bk-code-runner")),
		);
	function preparePassages(root: ParentNode) {
		return passages(root).map((el, index) => {
			if (!el.id) el.id = `bk-phone-match-${index}`;
			return el;
		});
	}
	function jumpToHash(hash: string, smooth = false) {
		let id: string;
		try {
			id = decodeURIComponent(hash.slice(1));
		} catch {
			return;
		}
		const target = document.getElementById(id);
		if (!target) return;
		target.scrollIntoView({
			behavior: smooth && !reducedMotion() ? "smooth" : "instant",
			block: "start",
		});
		target.setAttribute("tabindex", "-1");
		target.focus({ preventScroll: true });
		revealToolbar();
	}
	preparePassages(main);
	function updateContents() {
		const nav = requiredElement<HTMLElement>(document, ".bk-nav");
		const headings = Array.from(
			main.querySelectorAll<HTMLElement>(
				".bk-content h2, .bk-content h3, .bk-content h4",
			),
		).filter(
			(heading) => heading.id && !heading.closest(".bk-quiz, .bk-object"),
		);
		nav.replaceChildren();
		for (const heading of headings) {
			const link = document.createElement("a");
			link.href = `#${encodeURIComponent(heading.id)}`;
			link.className = `bk-nav-item ${heading.tagName === "H2" ? "bk-nav-heading" : "bk-nav-sub"}`;
			link.dataset.id = heading.id;
			link.textContent = heading.textContent;
			nav.append(link);
		}
		if (!headings.length) {
			const empty = document.createElement("p");
			empty.className = "bk-phone-contents-empty";
			empty.textContent = "No sections in this lesson.";
			nav.append(empty);
		}
	}
	updateContents();
	document.documentElement.dataset.phoneApp = "true";
	history.replaceState({ ...history.state, bkPhoneIndex: 0 }, "");
	history.scrollRestoration = "manual";

	const initial = document.createElement("section");
	initial.className = "bk-phone-screen";
	initial.append(...Array.from(main.childNodes));
	main.append(initial);
	screens.set(current, { element: initial, scroll: main.scrollTop });

	function updateChrome(route: PhoneRouteData) {
		const back = requiredElement(document, "#bk-phone-back");
		back.hidden = route.isChapter;
		contents.hidden = route.isChapter;
		document
			.getElementById("bk-phone-search")
			?.setAttribute(
				"aria-label",
				route.isChapter ? "Search course" : "Search this lesson",
			);
		revealToolbar();
		back.setAttribute(
			"aria-label",
			route.isChapter ? "Back to top" : "Back to course",
		);
		back
			.querySelector("path")
			?.setAttribute(
				"d",
				route.isChapter
					? "m3 10 9-7 9 7v11h-7v-7h-4v7H3Z"
					: "M19 12H5m6-6-6 6 6 6",
			);
		shell.toggleAttribute("data-is-chapter", route.isChapter);
		const home = requiredElement<HTMLAnchorElement>(document, ".bk-phone-home");
		home.href = new URL(data?.home ?? "index.html", base).href;
		if (route.isChapter) home.setAttribute("aria-current", "page");
		else home.removeAttribute("aria-current");
		document.title = route.title;
	}
	function setBusy(busy: boolean) {
		shell.toggleAttribute("data-phone-loading", busy);
		if (busy) main.setAttribute("aria-busy", "true");
		else main.removeAttribute("aria-busy");
	}
	function showError() {
		let notice = document.querySelector<HTMLElement>(".bk-phone-route-error");
		if (!notice) {
			notice = document.createElement("div");
			notice.className = "bk-phone-route-error";
			notice.setAttribute("role", "alert");
			notice.textContent =
				"Could not load the course. Tap a lesson to try again.";
			shell.append(notice);
		}
	}
	let loading: Promise<PhoneAppData> | undefined;
	function load(): Promise<PhoneAppData> {
		if (loading) return loading;
		loading = fetch(sourceUrl, {
			cache: "no-cache",
		})
			.then((response) => {
				if (!response.ok)
					throw new Error(`Course load failed: ${response.status}`);
				return response.json();
			})
			.then(readPhoneAppData)
			.then((bundle) => {
				data = bundle;
				document.documentElement.dataset.phoneAppReady = "true";
				const route = bundle.routes[current];
				if (route?.isChapter && current !== bundle.home) {
					const screen = screens.get(current);
					if (!screen) throw new Error("Missing current phone screen");
					screens.delete(current);
					current = bundle.home;
					screens.set(current, screen);
				}
				if (route) updateChrome(route);
				return bundle;
			})
			.catch((error) => {
				loading = undefined;
				throw error;
			});
		return loading;
	}
	function show(url: URL, mode: NavigationMode) {
		let key =
			decodeURIComponent(url.pathname.slice(base.pathname.length)) ||
			"index.html";
		if (!data || !Object.hasOwn(data.routes, key)) return;
		const route = data.routes[key];
		if (!route) return;
		if (route.isChapter) key = data.home;
		const old = screens.get(current);
		if (!old) return;
		old.scroll = main.scrollTop;
		let screen = screens.get(key);
		if (!screen) {
			const element = document.createElement("section");
			element.className = "bk-phone-screen";
			element.innerHTML = route.main;
			preparePassages(element);
			screen = { element, scroll: 0 };
			screens.set(key, screen);
		}
		transition?.cancel();
		current = key;
		main.replaceChildren(screen.element);
		updateContents();
		shell.removeAttribute("data-mobile-open");
		if (mode !== "pop") {
			const overlay =
				history.state?.bkPhoneSheet || history.state?.bkPhoneSearch;
			if (mode === "push" && !overlay) historyIndex++;
			const state = { bkPhoneIndex: historyIndex };
			if (mode === "replace" || overlay) history.replaceState(state, "", url);
			else history.pushState(state, "", url);
		}
		updateChrome(route);
		window.dispatchEvent(new Event("bk-page-loaded"));
		main.scrollTop = screen.scroll;
		if (url.hash && url.hash !== "#top") {
			jumpToHash(url.hash);
		}
		if (
			!matchMedia("(prefers-reduced-motion: reduce)").matches &&
			screen.element !== old.element
		) {
			const back = mode === "pop" || route.isChapter;
			transition = screen.element.animate(
				[
					{ transform: `translateX(${back ? -24 : 32}px)`, opacity: 0.4 },
					{ transform: "translateX(0)", opacity: 1 },
				],
				{ duration: 180, easing: "cubic-bezier(.2,0,0,1)" },
			);
		}
		const heading = screen.element.querySelector<HTMLElement>("h1");
		if (!url.hash && heading) {
			heading.tabIndex = -1;
			heading.focus({ preventScroll: true });
		}
		revealToolbar();
		setBusy(false);
		document.querySelector(".bk-phone-route-error")?.remove();
	}
	function navigate(url: URL, mode: NavigationMode) {
		// Dismiss the search history entry before changing the underlying route.
		if (mode !== "pop" && history.state?.bkPhoneSearch) {
			pendingNavigation = { url, mode };
			history.back();
			return;
		}
		const id = ++requestId;
		if (data) {
			show(url, mode);
			return;
		}
		setBusy(true);
		void load()
			.then(() => {
				if (id === requestId) show(url, mode);
			})
			.catch(() => {
				if (id === requestId) {
					setBusy(false);
					showError();
				}
			});
	}
	document.addEventListener("click", (event) => {
		if (
			event.defaultPrevented ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.altKey ||
			event.shiftKey
		)
			return;
		const link = (event.target as Element).closest<HTMLAnchorElement>(
			"a[href]",
		);
		if (!link || link.hasAttribute("download") || link.target === "_blank")
			return;
		const rawHref = link.getAttribute("href") || "";
		const url = rawHref.startsWith("#")
			? new URL(rawHref, location.href)
			: new URL(link.href);
		if (
			url.origin !== location.origin ||
			!url.pathname.startsWith(base.pathname)
		)
			return;
		const key =
			decodeURIComponent(url.pathname.slice(base.pathname.length)) ||
			"index.html";
		if (data && !Object.hasOwn(data.routes, key)) return;
		if (!data && !url.pathname.endsWith(".html")) return;
		event.preventDefault();
		if (history.state?.bkPhoneSearch) {
			navigate(url, data?.routes[current]?.isChapter ? "push" : "replace");
			return;
		}
		if (key === current) {
			if (url.hash && url.hash !== "#top") {
				// Section jumps replace the URL without adding a lesson-history entry.
				const routeState = { ...history.state };
				delete routeState.bkPhoneSearch;
				history.replaceState(routeState, "", url);
				jumpToHash(url.hash, true);
			} else
				main.scrollTo({
					top: 0,
					behavior: reducedMotion() ? "instant" : "smooth",
				});
			return;
		}
		const fromLesson = data && !data.routes[current]?.isChapter;
		const toLesson = data && !data.routes[key]?.isChapter;
		if (data?.routes[key]?.isChapter && fromLesson) returnToCourse();
		else navigate(url, fromLesson && toLesson ? "replace" : "push");
	});
	const arrow = (left = false) =>
		`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${left ? "M19 12H5m6-6-6 6 6 6" : "M5 12h14m-6-6 6 6-6 6"}"/></svg>`;
	let codeMenuId = 0;
	const simplifyCodeActions = () => {
		for (const actions of main.querySelectorAll<HTMLElement>(
			".bk-runner-header-actions",
		)) {
			if (actions.querySelector(".bk-phone-code-more")) continue;
			const secondary = actions.querySelectorAll<HTMLButtonElement>(
				".bk-hint-btn, .bk-reset-btn, .bk-copy-btn",
			);
			if (!secondary.length) continue;
			const trigger = document.createElement("button");
			trigger.type = "button";
			trigger.className = "bk-phone-code-more";
			trigger.setAttribute("aria-label", "More code actions");
			trigger.innerHTML =
				'<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>';
			const menu = document.createElement("div");
			menu.id = `bk-phone-code-menu-${++codeMenuId}`;
			menu.className = "bk-phone-code-menu";
			menu.setAttribute("popover", "auto");
			trigger.setAttribute("popovertarget", menu.id);
			for (const button of secondary) {
				if (!button.matches(".bk-hint-btn")) {
					const label = document.createElement("span");
					label.textContent = button.matches(".bk-reset-btn")
						? "Reset code"
						: "Copy code";
					button.append(label);
				}
				menu.append(button);
			}
			menu.addEventListener("beforetoggle", (event) => {
				if ((event as ToggleEvent).newState !== "open") return;
				const rect = trigger.getBoundingClientRect();
				const viewport = window.visualViewport;
				const bottom =
					(viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight);
				menu.style.top = `${Math.max(12, Math.min(rect.bottom + 4, bottom - (secondary.length * 44 + 16)))}px`;
				menu.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - 188))}px`;
			});
			menu.addEventListener("click", (event) => {
				if ((event.target as Element).closest("button")) menu.hidePopover();
			});
			actions.append(trigger, menu);
		}
	};
	const labelLessonActions = () => {
		simplifyCodeActions();
		for (const badge of main.querySelectorAll<HTMLElement>(".bk-runner-badge"))
			badge.textContent = badge.textContent?.replace(/\s+Challenge$/, "");
		for (const direction of ["prev", "next"]) {
			const link = main.querySelector<HTMLAnchorElement>(
				`.bk-end-link--${direction}[href]`,
			);
			if (!link) continue;
			const title = link.querySelector("strong")?.textContent || "Lesson";
			link.setAttribute(
				"aria-label",
				`${direction === "prev" ? "Previous" : "Next"} lesson: ${title}`,
			);
			if (!link.querySelector(".bk-phone-action-icon")) {
				const icon = document.createElement("span");
				icon.className = "bk-phone-action-icon";
				icon.innerHTML = arrow(direction === "prev");
				link.append(icon);
			}
		}
		for (const icon of main.querySelectorAll<HTMLElement>(
			".bk-phone-start > span:last-child, [data-phone-lesson] > span:last-child",
		))
			icon.innerHTML = arrow();
	};
	labelLessonActions();
	window.addEventListener("bk-page-loaded", labelLessonActions);

	const sheet = requiredElement<HTMLElement>(document, ".bk-sidebar");
	let sheetStart: { x: number; y: number } | null = null;
	let sheetX = 0;
	let sheetY = 0;
	const resetSheet = () => {
		sheet.style.removeProperty("transform");
		sheet.style.removeProperty("transition");
		sheetStart = null;
		sheetX = sheetY = 0;
	};
	sheet.addEventListener(
		"touchstart",
		(event) => {
			if (
				shell.getAttribute("data-mobile-open") !== "true" ||
				event.touches.length !== 1 ||
				(event.target as Element).closest("input,select,textarea")
			)
				return;
			sheetStart = {
				x: event.touches[0]?.clientX,
				y: event.touches[0]?.clientY,
			};
		},
		{ passive: true },
	);
	sheet.addEventListener(
		"touchmove",
		(event) => {
			if (!sheetStart || event.touches.length !== 1) return;
			const dx = event.touches[0]?.clientX - sheetStart.x;
			const dy = event.touches[0]?.clientY - sheetStart.y;
			sheetX = dx > Math.abs(dy) * 1.2 ? Math.max(0, dx) : 0;
			let scrolledContent = false;
			for (
				let node = event.target as HTMLElement | null;
				node;
				node = node.parentElement
			) {
				if (node.scrollTop > 1 && node.scrollHeight > node.clientHeight)
					scrolledContent = true;
				if (node === sheet) break;
			}
			if (scrolledContent && dy > 0 && !sheetX) {
				sheetStart.y = event.touches[0]?.clientY;
				return;
			}
			sheetY = dy > Math.abs(dx) * 1.2 && dy > 6 ? Math.max(0, dy) : 0;
			if (!sheetX && !sheetY) return;
			if (event.cancelable) event.preventDefault();
			sheet.style.transition = "none";
			sheet.style.transform = `translate(${sheetX}px,${sheetY}px)`;
		},
		{ passive: false },
	);
	sheet.addEventListener(
		"touchend",
		() => {
			const dismiss = sheetX >= 72 || sheetY >= 72;
			resetSheet();
			if (dismiss) document.getElementById("bk-drawer-close")?.click();
		},
		{ passive: true },
	);
	sheet.addEventListener("touchcancel", resetSheet, { passive: true });
	new MutationObserver(() => {
		const open = shell.getAttribute("data-mobile-open") === "true";
		if (open && !history.state?.bkPhoneSheet) {
			history.pushState(
				{
					...history.state,
					bkPhoneSheet: shell.dataset.phonePanel || "contents",
				},
				"",
			);
		} else if (!open && history.state?.bkPhoneSheet) history.back();
	}).observe(shell, {
		attributes: true,
		attributeFilter: ["data-mobile-open"],
	});
	window.addEventListener("popstate", (event) => {
		historyIndex = event.state?.bkPhoneIndex ?? 0;
		if (pendingNavigation) {
			const pending = pendingNavigation;
			pendingNavigation = undefined;
			navigate(pending.url, pending.mode);
			return;
		}
		if (searchDialog.open && !event.state?.bkPhoneSearch) searchDialog.close();
		if (event.state?.bkPhoneSearch) {
			if (!searchDialog.open) openSearch(false);
			return;
		}
		if (event.state?.bkPhoneSheet) {
			if (shell.getAttribute("data-mobile-open") !== "true")
				document
					.getElementById(
						event.state.bkPhoneSheet === "appearance"
							? "bk-phone-appearance"
							: "bk-phone-contents",
					)
					?.click();
			return;
		}
		if (shell.getAttribute("data-mobile-open") === "true")
			document.getElementById("bk-drawer-close")?.click();
		const key =
			decodeURIComponent(location.pathname.slice(base.pathname.length)) ||
			"index.html";
		if (key !== current) navigate(new URL(location.href), "pop");
	});
	function returnToCourse() {
		if (!data) return;
		if (historyIndex > 0) history.go(-historyIndex);
		else navigate(new URL(data.home, base), "replace");
	}
	document
		.getElementById("bk-phone-back")
		?.addEventListener("click", returnToCourse);

	const searchDialog = document.createElement("dialog");
	searchDialog.className = "bk-phone-search-dialog";
	searchDialog.setAttribute("aria-labelledby", "bk-phone-search-title");
	searchDialog.innerHTML = `<header><div class="bk-phone-search-heading"><h2 id="bk-phone-search-title">Search this lesson</h2><p class="bk-phone-search-context"></p></div><button type="button" class="bk-phone-search-close" aria-label="Close search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></header><div class="bk-phone-search-field"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input id="bk-phone-search-input" aria-label="Search this lesson" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Search words or phrases"><button type="button" class="bk-phone-search-clear" aria-label="Clear search" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></div><p role="status" aria-live="polite"></p><ul aria-label="Search results"></ul>`;
	shell.append(searchDialog);
	const searchInput = requiredElement<HTMLInputElement>(searchDialog, "input");
	const searchResults = requiredElement(searchDialog, "ul");
	const searchStatus = requiredElement(searchDialog, "[role=status]");
	let searchIndex: SearchPassage[] = [];
	let searchRequest = 0;
	const clearSearch = requiredElement<HTMLButtonElement>(
		searchDialog,
		".bk-phone-search-clear",
	);
	function appendExcerpt(target: HTMLElement, value: string, words: string[]) {
		const lower = value.toLocaleLowerCase();
		const positions = words
			.map((word) => lower.indexOf(word))
			.filter((at) => at >= 0);
		const from = positions.length
			? Math.max(0, Math.min(...positions) - 36)
			: 0;
		const text = value.slice(from, from + 150);
		if (from) target.append("…");
		let cursor = 0;
		while (cursor < text.length) {
			const hits = words
				.map((word) => ({
					at: text.toLocaleLowerCase().indexOf(word, cursor),
					length: word.length,
				}))
				.filter((hit) => hit.at >= cursor)
				.sort((a, b) => a.at - b.at || b.length - a.length);
			const hit = hits[0];
			if (!hit) {
				target.append(text.slice(cursor));
				break;
			}
			target.append(text.slice(cursor, hit.at));
			const mark = document.createElement("mark");
			mark.textContent = text.slice(hit.at, hit.at + hit.length);
			target.append(mark);
			cursor = hit.at + hit.length;
		}
		if (value.length > from + 150) target.append("…");
	}
	function filterLessons() {
		const query = searchInput.value.trim().toLocaleLowerCase();
		const words = [...new Set(query.split(/\s+/).filter(Boolean))];
		clearSearch.hidden = !searchInput.value;
		searchResults.replaceChildren();
		searchResults.hidden = !query;
		if (!query) {
			searchStatus.textContent =
				"Find a heading, explanation, or code example.";
			return;
		}
		const matches = searchIndex
			.map((item) => {
				const text = `${item.section} ${item.text}`.toLocaleLowerCase();
				if (!words.every((word) => text.includes(word)))
					return { item, score: -1 };
				const section = item.section.toLocaleLowerCase();
				return {
					item,
					score:
						Number(text.includes(query)) * 4 +
						Number(section.includes(query)) * 8 +
						Number(item.text.toLocaleLowerCase().startsWith(query)) * 2,
				};
			})
			.filter((match) => match.score >= 0)
			.sort((a, b) => b.score - a.score);
		const groups = new Map<string, SearchPassage[]>();
		for (const { item } of matches.slice(0, 30)) {
			const group = groups.get(item.key) ?? [];
			group.push(item);
			groups.set(item.key, group);
		}
		for (const items of groups.values()) {
			if (shell.hasAttribute("data-is-chapter")) {
				const group = document.createElement("li");
				group.className = "bk-phone-search-group";
				group.textContent = items[0]?.title;
				searchResults.append(group);
			}
			for (const item of items) {
				const row = document.createElement("li");
				const link = document.createElement("a");
				const url = new URL(item.key, base);
				url.hash = item.id;
				link.href = url.href;
				const copy = document.createElement("span");
				copy.className = "bk-phone-search-result-copy";
				const title = document.createElement("strong");
				title.textContent = item.section || item.title;
				const excerpt = document.createElement("span");
				appendExcerpt(excerpt, item.text, words);
				copy.append(title, excerpt);
				const icon = document.createElement("span");
				icon.className = "bk-phone-search-result-arrow";
				icon.setAttribute("aria-hidden", "true");
				icon.innerHTML = arrow();
				link.append(copy, icon);
				link.addEventListener("click", () => searchDialog.close());
				row.append(link);
				searchResults.append(row);
			}
		}
		searchStatus.textContent = matches.length
			? `${matches.length} ${matches.length === 1 ? "result" : "results"}${matches.length > 30 ? " · First 30 shown" : ""}`
			: `No results for “${searchInput.value.trim()}”. Try a different word.`;
	}
	clearSearch.addEventListener("click", () => {
		searchInput.value = "";
		filterLessons();
		searchInput.focus();
	});
	searchInput.addEventListener("keydown", (event) => {
		const first = searchResults.querySelector<HTMLAnchorElement>("a");
		if (event.key === "ArrowDown" && first) {
			event.preventDefault();
			first.focus();
		}
		if (event.key === "Enter" && first && !event.isComposing) {
			event.preventDefault();
			first.click();
		}
	});
	searchResults.addEventListener("keydown", (event) => {
		if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
		const links = Array.from(
			searchResults.querySelectorAll<HTMLAnchorElement>("a"),
		);
		const at = links.indexOf(document.activeElement as HTMLAnchorElement);
		if (at < 0) return;
		event.preventDefault();
		if (event.key === "ArrowUp" && !at) searchInput.focus();
		else
			links[
				Math.min(
					links.length - 1,
					Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1)),
				)
			]?.focus();
	});
	searchInput.addEventListener("input", filterLessons);
	searchDialog
		.querySelector(".bk-phone-search-close")
		?.addEventListener("click", () => searchDialog.close());
	searchDialog.addEventListener("click", (event) => {
		const bounds = searchDialog.getBoundingClientRect();
		if (
			event.target === searchDialog &&
			(event.clientX < bounds.left ||
				event.clientX > bounds.right ||
				event.clientY < bounds.top ||
				event.clientY > bounds.bottom)
		)
			searchDialog.close();
	});
	searchDialog.addEventListener("close", () => {
		searchRequest++;
		if (history.state?.bkPhoneSearch && !pendingNavigation) history.back();
		revealToolbar();
		if (!main.contains(document.activeElement))
			document
				.getElementById("bk-phone-search")
				?.focus({ preventScroll: true });
	});
	let searchTop = 80;
	const fitSearch = () => {
		const viewport = window.visualViewport;
		if (!viewport) return;
		searchDialog.style.setProperty(
			"--search-top",
			`${viewport.offsetTop + searchTop}px`,
		);
		searchDialog.style.setProperty(
			"--search-available",
			`${Math.max(120, viewport.height - searchTop - 16)}px`,
		);
		shell.toggleAttribute(
			"data-phone-keyboard",
			viewport.height < window.innerHeight * 0.75,
		);
	};
	window.visualViewport?.addEventListener("resize", fitSearch);
	window.visualViewport?.addEventListener("scroll", fitSearch);
	function openSearch(pushHistory = true) {
		if (searchDialog.open) return;
		if (pushHistory)
			history.pushState({ ...history.state, bkPhoneSearch: true }, "");
		revealToolbar();
		const inCourse = shell.hasAttribute("data-is-chapter");
		const label = inCourse ? "Search course" : "Search this lesson";
		searchInput.placeholder = inCourse
			? "Search all lessons…"
			: "Search this lesson…";
		requiredElement(searchDialog, ".bk-phone-search-context").textContent =
			inCourse
				? "All lessons in this course"
				: (data?.routes[current]?.title ?? document.title);
		searchInput.setAttribute("aria-label", label);
		requiredElement(searchDialog, "h2").textContent = label;
		searchIndex = [];
		searchResults.replaceChildren();
		searchInput.value = "";
		clearSearch.hidden = true;
		searchResults.hidden = true;
		const viewport = window.visualViewport;
		searchTop = Math.min(80, (viewport?.height ?? window.innerHeight) * 0.1);
		searchDialog.style.setProperty(
			"--search-top",
			`${(viewport?.offsetTop ?? 0) + searchTop}px`,
		);
		searchDialog.showModal();
		fitSearch();
		searchInput.focus();
		searchStatus.textContent = "Loading search…";
		const request = ++searchRequest;
		void load()
			.then((bundle) => {
				if (request !== searchRequest || !searchDialog.open) return;
				const activeRoute = bundle.routes[current];
				if (!activeRoute) throw new Error("Missing lesson for search");
				const routes = inCourse
					? Object.entries(bundle.routes).filter(
							([, route]) => !route.isChapter,
						)
					: [[current, activeRoute] as const];
				searchIndex = routes.flatMap(([key, route]) => {
					const root =
						screens.get(key)?.element ??
						new DOMParser().parseFromString(route.main, "text/html");
					let section = route.title;
					return preparePassages(root)
						.map((el) => {
							if (/^H[1-4]$/.test(el.tagName))
								section = el.textContent?.trim() || section;
							return {
								key,
								id: el.id,
								title: route.title,
								section,
								text: (
									el.querySelector<HTMLTextAreaElement>(".bk-runner-editor")
										?.value ??
									el.textContent ??
									""
								)
									.replace(/\s+/g, " ")
									.trim(),
							};
						})
						.filter((item) => item.text);
				});
				filterLessons();
			})
			.catch(() => {
				searchStatus.textContent =
					"Could not load search. Close and try again.";
			});
	}
	document
		.getElementById("bk-phone-search")
		?.addEventListener("click", () => openSearch());
	void load()
		.then(() => {
			if (location.hash && location.hash !== "#top") jumpToHash(location.hash);
		})
		.catch(showError);
	return true;
}
