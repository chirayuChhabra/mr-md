// @ts-expect-error: Provided by reader worker in src/client/device.ts (shared policy)
import { bkIsPhone } from "./device.js";

/**
 * Shared helper to determine if current device context is a phone.
 * Uses shared policy: phone if matchMedia("(max-width: 767px), (max-height: 500px) and (pointer: coarse)").
 */
export function isPhoneDevice(): boolean {
	if (typeof bkIsPhone === "function") {
		try {
			return bkIsPhone();
		} catch {
			// fallback on runtime error
		}
	}
	if (typeof window === "undefined" || !window.matchMedia) return false;
	return window.matchMedia(
		"(max-width: 767px), (max-height: 500px) and (pointer: coarse)",
	).matches;
}

/**
 * Wire media elements for mobile and touch experiences:
 * - Keeps images and videos strictly inline on phones.
 * - Suppresses maximize/expand handlers on phones in capture phase.
 * - Enforces playsinline to prevent automatic fullscreen video takeovers.
 */
export function bkWireMedia(): void {
	if (typeof document === "undefined") return;

	// Intercept clicks on phone to prevent images or media from opening expanded views
	document.addEventListener(
		"click",
		(e: MouseEvent) => {
			if (!isPhoneDevice()) return;

			const target = e.target as HTMLElement | null;
			if (!target) return;

			// On phone, prevent clicking maximize buttons
			const maximizeBtn = target.closest(".bk-object-maximize");
			if (maximizeBtn) {
				e.preventDefault();
				e.stopImmediatePropagation();
				return;
			}

			// On phone, keep images and videos inline
			const mediaEl = target.closest(".bk-media, img, video");
			if (mediaEl) {
				const figure = mediaEl.closest(".bk-object");
				if (figure?.classList.contains("bk-object--maximized")) {
					figure.classList.remove("bk-object--maximized");
					figure.classList.remove("bk-object--expanded");
				}
			}
		},
		true, // Capture phase to preempt bubbling workspace expand listeners
	);

	// Prevent iOS video elements from invoking native fullscreen player
	document.addEventListener(
		"webkitbeginfullscreen",
		(e: Event) => {
			if (isPhoneDevice()) {
				e.preventDefault();
			}
		},
		true,
	);
}

/**
 * Initialize media elements on page load / navigation:
 * Sets playsinline and webkit-playsinline attributes on all video elements.
 */
export function bkInitMedia(): void {
	if (typeof document === "undefined") return;
	document.querySelectorAll<HTMLVideoElement>("video").forEach((video) => {
		video.setAttribute("playsinline", "");
		video.setAttribute("webkit-playsinline", "");
	});
}
