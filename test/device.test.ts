import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	BK_PHONE_MEDIA_QUERY,
	BK_TOUCH_MEDIA_QUERY,
	bkIsPhone,
	bkIsTouch,
	bkSyncDeviceAttributes,
	bkWatchDevice,
} from "../src/client/device.js";

describe("Device Policy & Detection", () => {
	const originalWindow = globalThis.window;
	const originalDocument = globalThis.document;
	const originalNavigator = globalThis.navigator;

	afterEach(() => {
		(globalThis as any).window = originalWindow;
		(globalThis as any).document = originalDocument;
		(globalThis as any).navigator = originalNavigator;
	});

	test("returns false in SSR environment when window is undefined", () => {
		(globalThis as any).window = undefined;
		expect(bkIsPhone()).toBe(false);
		expect(bkIsTouch()).toBe(false);
	});

	test("matches phone query for mobile portrait (width <= 767px)", () => {
		const mockMatches = new Map<string, boolean>([
			[BK_PHONE_MEDIA_QUERY, true],
			[BK_TOUCH_MEDIA_QUERY, true],
		]);

		(globalThis as any).window = {
			matchMedia: (q: string) => ({
				matches: mockMatches.get(q) ?? false,
				media: q,
				addEventListener: () => {},
				removeEventListener: () => {},
			}),
		};

		expect(bkIsPhone()).toBe(true);
		expect(bkIsTouch()).toBe(true);
	});

	test("matches phone query for mobile landscape (height <= 500px, coarse pointer)", () => {
		(globalThis as any).window = {
			matchMedia: (q: string) => {
				if (q === BK_PHONE_MEDIA_QUERY) {
					return {
						matches: true,
						media: q,
						addEventListener: () => {},
						removeEventListener: () => {},
					};
				}
				return {
					matches: false,
					media: q,
					addEventListener: () => {},
					removeEventListener: () => {},
				};
			},
		};

		expect(bkIsPhone()).toBe(true);
	});

	test("does NOT match phone query for tablet portrait (768px - 1024px)", () => {
		(globalThis as any).window = {
			matchMedia: (q: string) => {
				if (q === BK_PHONE_MEDIA_QUERY) {
					return {
						matches: false,
						media: q,
						addEventListener: () => {},
						removeEventListener: () => {},
					};
				}
				if (q === BK_TOUCH_MEDIA_QUERY) {
					return {
						matches: true,
						media: q,
						addEventListener: () => {},
						removeEventListener: () => {},
					};
				}
				return {
					matches: false,
					media: q,
					addEventListener: () => {},
					removeEventListener: () => {},
				};
			},
		};

		expect(bkIsPhone()).toBe(false);
		expect(bkIsTouch()).toBe(true);
	});

	test("does NOT match phone query for desktop (1440px x 900px, fine pointer)", () => {
		(globalThis as any).window = {
			matchMedia: () => ({
				matches: false,
				media: "",
				addEventListener: () => {},
				removeEventListener: () => {},
			}),
		};

		expect(bkIsPhone()).toBe(false);
		expect(bkIsTouch()).toBe(false);
	});

	test("bkSyncDeviceAttributes applies data-device and data-is-phone attributes", () => {
		const attributes = new Map<string, string>();
		const mockDoc = {
			documentElement: {
				setAttribute: (k: string, v: string) => attributes.set(k, v),
				removeAttribute: (k: string) => attributes.delete(k),
				getAttribute: (k: string) => attributes.get(k),
			},
		};

		(globalThis as any).document = mockDoc;
		(globalThis as any).window = {
			matchMedia: (q: string) => ({
				matches: q === BK_PHONE_MEDIA_QUERY || q === BK_TOUCH_MEDIA_QUERY,
				media: q,
				addEventListener: () => {},
				removeEventListener: () => {},
			}),
		};

		bkSyncDeviceAttributes();
		expect(attributes.get("data-device")).toBe("phone");
		expect(attributes.get("data-is-phone")).toBe("true");
		expect(attributes.get("data-touch")).toBe("true");

		// Now simulate tablet
		(globalThis as any).window = {
			matchMedia: (q: string) => ({
				matches: q === BK_TOUCH_MEDIA_QUERY,
				media: q,
				addEventListener: () => {},
				removeEventListener: () => {},
			}),
		};

		bkSyncDeviceAttributes();
		expect(attributes.get("data-device")).toBe("tablet");
		expect(attributes.has("data-is-phone")).toBe(false);
		expect(attributes.get("data-touch")).toBe("true");

		// Now simulate desktop
		(globalThis as any).window = {
			matchMedia: () => ({
				matches: false,
				media: "",
				addEventListener: () => {},
				removeEventListener: () => {},
			}),
		};

		bkSyncDeviceAttributes();
		expect(attributes.get("data-device")).toBe("desktop");
		expect(attributes.has("data-is-phone")).toBe(false);
		expect(attributes.has("data-touch")).toBe(false);
	});

	test("bkWatchDevice registers listener and updates device attributes on change", () => {
		let registeredHandler: ((e: any) => void) | null = null;
		let removed = false;

		const attributes = new Map<string, string>();
		(globalThis as any).document = {
			documentElement: {
				setAttribute: (k: string, v: string) => attributes.set(k, v),
				removeAttribute: (k: string) => attributes.delete(k),
				getAttribute: (k: string) => attributes.get(k),
			},
		};

		(globalThis as any).window = {
			matchMedia: (q: string) => ({
				matches: false,
				media: q,
				addEventListener: (_event: string, handler: any) => {
					registeredHandler = handler;
				},
				removeEventListener: () => {
					removed = true;
				},
			}),
		};

		let changeNotified: boolean | null = null;
		const unwatch = bkWatchDevice((isPhone) => {
			changeNotified = isPhone;
		});

		expect(registeredHandler).not.toBeNull();
		// Trigger change event to phone
		(globalThis as any).window.matchMedia = (q: string) => ({
			matches: q === BK_PHONE_MEDIA_QUERY,
			media: q,
			addEventListener: () => {},
			removeEventListener: () => {},
		});

		registeredHandler!({ matches: true });
		expect(changeNotified).toBe(true);
		expect(attributes.get("data-device")).toBe("phone");

		unwatch();
		expect(removed).toBe(true);
	});
});
