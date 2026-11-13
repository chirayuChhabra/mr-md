/**
 * Device policy and media query helpers for Mr. Md.
 *
 * Shared policy:
 * - Phone: matchMedia("(max-width: 767px), (max-height: 500px) and (pointer: coarse)")
 *   Matches small screen phones in portrait and landscape orientation with coarse touch.
 * - Touch: matchMedia("(pointer: coarse), (hover: none)") or touch capability check.
 * - Tablet: screens <= 1024px that do not match the phone query.
 * - Desktop: screens > 1024px with fine pointer.
 */

export const BK_PHONE_MEDIA_QUERY =
	"(max-width: 767px), (max-height: 500px) and (pointer: coarse)";

export const BK_TOUCH_MEDIA_QUERY = "(pointer: coarse), (hover: none)";

/**
 * Returns true if current viewport / environment matches the Mr. Md phone policy:
 * matchMedia("(max-width: 767px), (max-height: 500px) and (pointer: coarse)")
 */
export function bkIsPhone(): boolean {
	if (
		typeof window === "undefined" ||
		typeof window.matchMedia !== "function"
	) {
		return false;
	}
	try {
		return window.matchMedia(BK_PHONE_MEDIA_QUERY).matches;
	} catch {
		return false;
	}
}

/**
 * Returns true if current device uses touch as primary input mechanism.
 */
export function bkIsTouch(): boolean {
	if (typeof window === "undefined") {
		return false;
	}
	if (typeof window.matchMedia === "function") {
		try {
			if (window.matchMedia(BK_TOUCH_MEDIA_QUERY).matches) {
				return true;
			}
		} catch {
			// ignore query parse failure
		}
	}
	return (
		"ontouchstart" in window ||
		(typeof navigator !== "undefined" && (navigator.maxTouchPoints || 0) > 0)
	);
}

/**
 * Sync device state attributes to <html> root element so both runtime logic
 * and CSS defense layers can adapt synchronously.
 */
export function bkSyncDeviceAttributes(): void {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
	if (!root) return;

	const isPhone = bkIsPhone();
	const isTouch = bkIsTouch();

	if (isPhone) {
		root.setAttribute("data-device", "phone");
		root.setAttribute("data-is-phone", "true");
	} else {
		root.setAttribute("data-device", isTouch ? "tablet" : "desktop");
		root.removeAttribute("data-is-phone");
	}

	if (isTouch) {
		root.setAttribute("data-touch", "true");
	} else {
		root.removeAttribute("data-touch");
	}
}

/**
 * Listen for viewport / media query updates to keep device state updated.
 */
export function bkWatchDevice(
	onChange?: (isPhone: boolean) => void,
): () => void {
	if (
		typeof window === "undefined" ||
		typeof window.matchMedia !== "function"
	) {
		return () => {};
	}

	try {
		const mq = window.matchMedia(BK_PHONE_MEDIA_QUERY);
		const handler = (e: MediaQueryListEvent | MediaQueryList) => {
			bkSyncDeviceAttributes();
			onChange?.(e.matches);
		};

		if (typeof mq.addEventListener === "function") {
			mq.addEventListener("change", handler);
		} else if (
			"addListener" in mq &&
			typeof (mq as MediaQueryList).addListener === "function"
		) {
			(mq as MediaQueryList).addListener(
				handler as (e: MediaQueryListEvent) => void,
			);
		}

		return () => {
			if (typeof mq.removeEventListener === "function") {
				mq.removeEventListener("change", handler);
			} else if (
				"removeListener" in mq &&
				typeof (mq as MediaQueryList).removeListener === "function"
			) {
				(mq as MediaQueryList).removeListener(
					handler as (e: MediaQueryListEvent) => void,
				);
			}
		};
	} catch {
		return () => {};
	}
}
