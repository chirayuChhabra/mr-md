import { afterAll, beforeAll, expect, test } from "bun:test";
import { resolve } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer";

let browser: Browser;
let server: ReturnType<typeof Bun.serve>;
const route = (name: string) => new URL(`${name}.html`, server.url).href;

beforeAll(async () => {
	const root = resolve("mr-markdown-documentation/out");
	server = Bun.serve({
		port: 0,
		async fetch(request) {
			const filePath = resolve(root, `.${decodeURIComponent(new URL(request.url).pathname)}`);
			if (!filePath.startsWith(`${root}/`)) return new Response(null, { status: 404 });
			const file = Bun.file(filePath);
			return (await file.exists()) ? new Response(file) : new Response(null, { status: 404 });
		},
	});
	browser = await puppeteer.launch({
		headless: true,
		args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
	});
});

afterAll(async () => {
	await browser?.close();
	server?.stop(true);
});

async function phone(width = 390): Promise<Page> {
	const page = await browser.newPage();
	page.setDefaultTimeout(5000);
	await page.setViewport({ width, height: 844, isMobile: true, hasTouch: true });
	return page;
}

async function open(page: Page, name: string) {
	await page.goto(route(name), { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() => document.documentElement.dataset.phoneAppReady === "true");
}

async function enterLesson(page: Page, name: string) {
	await page.locator(`[data-phone-lesson="${name}"]`).click();
	await page.waitForFunction(name => location.pathname.endsWith(`/${name}.html`), {}, name);
}

async function search(page: Page, query: string) {
	await page.locator('#bk-phone-search').click();
	await page.locator('input[type="search"]').fill(query);
	await page.waitForFunction(() => !document.querySelector('.bk-phone-search-dialog [role="status"]')?.textContent?.includes("Loading"));
}

test("phone Next replaces the lesson entry so system Back returns to the course", async () => {
	const page = await phone();
	try {
		await open(page, "index");
		await enterLesson(page, "quickstart");
		await page.locator('.bk-end-link--next').click();
		await page.waitForFunction(() => location.pathname.endsWith('/modules.html'));
		await page.goBack();
		await page.waitForFunction(() => location.pathname.endsWith('/index.html'));
		expect(await page.$('.bk-phone-catalogue')).not.toBeNull();
	} finally { await page.close(); }
});

test("same-lesson search selection does not trap course Back in a duplicate lesson entry", async () => {
	const page = await phone();
	try {
		await open(page, "index");
		await enterLesson(page, "coding");
		await search(page, "lightest option");
		await page.waitForSelector('.bk-phone-search-dialog a');
		await page.locator('.bk-phone-search-dialog a').click();
		await page.waitForFunction(() => !!location.hash && !document.querySelector<HTMLDialogElement>('.bk-phone-search-dialog')?.open);
		await page.locator('button[aria-label="Back to course"]').click();
		await page.waitForFunction(() => location.pathname.endsWith('/index.html'));
		expect(await page.$('.bk-phone-catalogue')).not.toBeNull();
	} finally { await page.close(); }
});

test("course search opens the matching passage while lesson search stays scoped", async () => {
	const page = await phone();
	try {
		await open(page, "index");
		await search(page, "MR_MD_SKILL_REF");
		await page.waitForSelector('.bk-phone-search-dialog a');
		const destinations = await page.$$eval('.bk-phone-search-dialog a', links => links.map(link => (link as HTMLAnchorElement).href));
		expect(destinations.every(href => href.includes('/agent-skills.html#'))).toBe(true);
		await page.locator('.bk-phone-search-dialog a').click();
		await page.waitForFunction(() => location.pathname.endsWith('/agent-skills.html') && !!location.hash);
		expect(await page.evaluate(() => document.activeElement?.id === decodeURIComponent(location.hash.slice(1)))).toBe(true);
		await page.locator('button[aria-label="Back to course"]').click();
		await page.waitForFunction(() => location.pathname.endsWith('/index.html'));
		await enterLesson(page, "coding");
		await search(page, "MR_MD_SKILL_REF");
		await page.waitForFunction(() => document.querySelector('.bk-phone-search-dialog [role="status"]')?.textContent?.includes('No results'));
		expect(await page.$$('.bk-phone-search-dialog a')).toHaveLength(0);
		expect(await page.$eval('.bk-phone-search-dialog h2', el => el.textContent)).toBe("Search this lesson");
	} finally { await page.close(); }
});

for (const width of [320, 390]) {
	test(`phone ${width} keeps code headers compact and secondary actions in the menu`, async () => {
		const page = await phone(width);
		try {
			await open(page, "coding");
			await page.waitForSelector('.cm-content[contenteditable="true"]');
			expect(await page.$$eval('.bk-runner-header', headers => headers.every(header => {
				const title = header.querySelector('.bk-runner-header-left')!.getBoundingClientRect();
				const actions = header.querySelector('.bk-runner-header-actions')!.getBoundingClientRect();
				const run = header.querySelector('.bk-run-btn')!.getBoundingClientRect();
				const more = header.querySelector('.bk-phone-code-more')!.getBoundingClientRect();
				const rect = header.getBoundingClientRect();
				return rect.height <= 80 && actions.left >= title.right && run.right <= rect.right && more.right <= run.left && run.height >= 44;
			}))).toBe(true);
			await page.locator('.bk-code-runner[data-lang="python"][data-challenge="true"] .bk-phone-code-more').click();
			await page.waitForSelector('.bk-phone-code-menu:popover-open');
			expect(await page.$$eval('.bk-phone-code-menu:popover-open button', buttons => buttons.map(button => button.textContent?.trim()))).toEqual(['Hint', 'Reset code', 'Copy code']);
			await page.locator('.bk-phone-code-menu:popover-open .bk-hint-btn').click();
			expect(await page.$eval('.bk-code-runner[data-lang="python"][data-challenge="true"] .bk-runner-hint', el => el.getBoundingClientRect().height > 0)).toBe(true);
			expect(await page.$('.bk-phone-code-menu:popover-open')).toBeNull();
		} finally { await page.close(); }
	});
}

test("phone editor drafts survive course return and the code menu resets the live editor", async () => {
	const page = await phone();
	try {
		await open(page, "index");
		await enterLesson(page, "coding");
		await page.waitForSelector('.cm-content[contenteditable="true"]');
		await page.locator('.bk-code-runner[data-lang="javascript"] .cm-content').fill('console.log("saved mobile draft");');
		await page.locator('button[aria-label="Back to course"]').click();
		await page.waitForFunction(() => location.pathname.endsWith('/index.html'));
		await enterLesson(page, "coding");
		expect(await page.$eval('.bk-code-runner[data-lang="javascript"] .cm-content', el => el.textContent)).toContain("saved mobile draft");
		await page.locator('.bk-code-runner[data-lang="javascript"] .bk-phone-code-more').click();
		await page.locator('.bk-phone-code-menu:popover-open .bk-reset-btn').click();
		expect(await page.$eval('.bk-code-runner[data-lang="javascript"] .cm-content', el => el.textContent)).toContain("const distance = 100;");
	} finally { await page.close(); }
});

test("phone Search and Appearance retain their slots and lesson Back remains far left", async () => {
	const page = await phone();
	try {
		await open(page, "index");
		const positions = () => page.evaluate(() => Object.fromEntries(['bk-phone-appearance', 'bk-phone-search'].map(id => [id, document.getElementById(id)!.getBoundingClientRect().x])));
		const home = await positions();
		await enterLesson(page, "coding");
		expect(await positions()).toEqual(home);
		expect(await page.$eval('#bk-phone-back', el => el.getBoundingClientRect().left)).toBeLessThanOrEqual(8);
		expect(await page.$eval('.bk-phone-appbar', el => getComputedStyle(el).backgroundColor)).toBe(await page.$eval('.bk-main', el => getComputedStyle(el).backgroundColor));
	} finally { await page.close(); }
});

test("search keeps its screen anchor when the keyboard reduces the visual viewport", async () => {
	const page = await phone();
	try {
		await page.evaluateOnNewDocument(() => {
			const viewport = Object.assign(new EventTarget(), { height: 844, width: 390, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1 });
			Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
		});
		await open(page, "coding");
		await search(page, "browser worker");
		const top = await page.$eval('.bk-phone-search-dialog', el => el.getBoundingClientRect().top);
		await page.evaluate(() => {
			Object.assign(window.visualViewport!, { height: 440 });
			window.visualViewport!.dispatchEvent(new Event('resize'));
		});
		expect(await page.$eval('.bk-phone-search-dialog', el => el.getBoundingClientRect().top)).toBe(top);
		expect(await page.$eval('.bk-phone-search-dialog', el => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(440);
	} finally { await page.close(); }
});
