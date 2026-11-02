import { describe, expect, test, beforeEach, afterAll } from "bun:test";

describe("immersive world navigation and history integration", () => {
	const originalWindow = (globalThis as any).window;
	const originalDocument = (globalThis as any).document;

	afterAll(() => {
		(globalThis as any).window = originalWindow;
		(globalThis as any).document = originalDocument;
	});

	beforeEach(() => {
		// Mock window, document, and history
		const listeners: Record<string, Function[]> = {};
		const historyState = {
			stack: [{ state: {}, url: "http://localhost/chapter-1/lesson-1.html" }],
			currentIndex: 0,
			pushState(state: any, title: string, url: string) {
				this.stack.push({ state, url });
				this.currentIndex = this.stack.length - 1;
			},
			replaceState(state: any, title: string, url: string) {
				this.stack[this.currentIndex] = { state, url };
			},
			back() {
				if (this.currentIndex > 0) {
					this.currentIndex--;
					const item = this.stack[this.currentIndex];
					const event = { state: item.state };
					listeners["popstate"]?.forEach((cb) => cb(event));
				}
			},
			get state() {
				return this.stack[this.currentIndex]?.state;
			},
		};

		const bodyClasses = new Set<string>();
		const mockDocument: any = {
			body: {
				classList: {
					add(cls: string) {
						bodyClasses.add(cls);
					},
					remove(cls: string) {
						bodyClasses.delete(cls);
					},
					contains(cls: string) {
						return bodyClasses.has(cls);
					},
				},
				style: {},
				appendChild() {},
			},
			querySelector(sel: string) {
				return null;
			},
			querySelectorAll(sel: string) {
				return [];
			},
			getElementById(id: string) {
				return null;
			},
			createElement(tag: string) {
				return {
					id: "",
					type: "",
					className: "",
					setAttribute() {},
					removeAttribute() {},
					style: { removeProperty() {} },
					addEventListener() {},
				};
			},
			addEventListener(evt: string, cb: Function) {
				if (!listeners[evt]) listeners[evt] = [];
				listeners[evt].push(cb);
			},
		};

		const mockWindow: any = {
			history: historyState,
			location: {
				href: "http://localhost/chapter-1/lesson-1.html",
				pathname: "/chapter-1/lesson-1.html",
				origin: "http://localhost",
			},
			addEventListener(evt: string, cb: Function) {
				if (!listeners[evt]) listeners[evt] = [];
				listeners[evt].push(cb);
			},
			dispatchEvent(e: any) {},
			__listeners: listeners,
		};

		(globalThis as any).window = mockWindow;
		(globalThis as any).document = mockDocument;
	});

	test("entering world pushes history state and exiting via back pops cleanly", async () => {
		const { bkEnterWorld, bkExitWorld } = await import("../src/client/world.js");

		const mockFigure: any = {
			classList: {
				add() {},
				remove() {},
				contains() {
					return true;
				},
			},
			getAttribute() {
				return "minimal";
			},
			style: {
				removeProperty() {},
			},
			querySelector() {
				return null;
			},
		};

		// 1. Enter world
		bkEnterWorld(mockFigure);
		expect(globalThis.window.history.stack.length).toBe(2);
		expect(globalThis.window.history.state).toEqual({ bkWorld: true });
		expect(globalThis.document.body.classList.contains("bk-world-immersive")).toBe(true);

		// 2. User presses browser back button (simulating popstate)
		bkExitWorld(mockFigure, { fromPopstate: true });
		expect(globalThis.document.body.classList.contains("bk-world-immersive")).toBe(false);
	});

	test("exiting world via cross button calls history.back() and suppresses router popstate", async () => {
		const { bkEnterWorld, bkExitWorld } = await import("../src/client/world.js");

		const mockFigure: any = {
			classList: {
				add() {},
				remove() {},
				contains() {
					return true;
				},
			},
			getAttribute() {
				return "minimal";
			},
			style: {
				removeProperty() {},
			},
			querySelector() {
				return null;
			},
		};

		// Enter world
		bkEnterWorld(mockFigure);
		expect(globalThis.window.history.stack.length).toBe(2);

		// Exit via button (not popstate)
		bkExitWorld(mockFigure);
		expect((globalThis.window as any).__bk_suppress_router_popstate).toBe(true);
		expect(globalThis.window.history.currentIndex).toBe(0);
	});
});
