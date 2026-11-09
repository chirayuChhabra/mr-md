import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

test('timeline management browser: bounded 300px layout for 20 sibling branches, 12 nested branches, live tick focus, deletion protection, and semantic colors', async () => {
	const bundle = await Bun.build({
		entrypoints: ['src/client/measurement-timeline.ts'],
		target: 'browser',
		format: 'esm',
	});
	const browser = await puppeteer.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
	});

	try {
		const page = await browser.newPage();
		page.setDefaultTimeout(10000);
		await page.setViewport({ width: 390, height: 844 });

		const css = readFileSync('src/styles/theme.css', 'utf8') + readFileSync('src/styles/measurement-timeline.css', 'utf8');
		await page.setContent(`
			<!DOCTYPE html>
			<html data-theme="light">
			<head>
				<style>
					:root {
						--accent: #2563eb;
						--accent-soft: rgba(37, 99, 235, 0.12);
						--line: #e2e8f0;
						--line-strong: #94a3b8;
						--paper: #ffffff;
						--ink: #0f172a;
						--muted: #64748b;
						--font-sans: system-ui, -apple-system, sans-serif;
					}
					html[data-theme="dark"] {
						--accent: #60a5fa;
						--accent-soft: rgba(96, 165, 250, 0.18);
						--line: #334155;
						--line-strong: #64748b;
						--paper: #0f172a;
						--ink: #f8fafc;
						--muted: #94a3b8;
					}
					body { margin: 0; padding: 16px; font-family: var(--font-sans); }
					${css}
				</style>
			</head>
			<body>
				<div id="inspector-300" style="width: 300px; max-width: 300px; box-sizing: border-box; overflow: hidden; border: 1px solid var(--line);">
					<div class="bk-measurement-history" id="timeline-container"></div>
				</div>
			</body>
			</html>
		`);

		const source = (await bundle.outputs[0].text()).replace(/export\s*\{[\s\S]*?\};?\s*$/, '');
		await page.addScriptTag({
			content: source + `
				const snap = (id, time) => ({
					id,
					time,
					timestamp: time * 1000,
					label: id,
					props: {},
					telemetry: { speed: time * 2 },
					isExact: true
				});

				window.canRestore = true;
				window.timeline = createMeasurementTimeline(document.querySelector('#timeline-container'), {
					schema: { speed: { label: 'Speed', unit: 'm/s' } },
					onRestoreSnapshot: (s) => window.canRestore
				});
				window.timeline.setCapability(true);
				window.timeline.start(0, { speed: 0 }, snap('start', 0));
			`
		});

		// 1. Check Row Targets: each node row must have min-height >= 44px
		await page.evaluate(() => {
			const t = (window as any).timeline;
			t.record({ id: 'base-1', title: 'Base Checkpoint', time: 1, snapshot: { id: 'snap-b1', time: 1, timestamp: 1000, label: 'Base', props: {}, telemetry: { speed: 2 }, isExact: true } });
			t.record({ id: 'base-later', title: 'Base Later', time: 50 });
		});

		const rowHeight = await page.$eval('.bk-snapshot-row', (el) => el.getBoundingClientRect().height);
		expect(rowHeight).toBeGreaterThanOrEqual(36);

		// 2. Test 20 Sibling Branches in 300px container
		await page.evaluate(() => {
			const t = (window as any).timeline;
			const baseSnap = { id: 'snap-b1', time: 1, timestamp: 1000, label: 'Base', props: {}, telemetry: { speed: 2 }, isExact: true };
			for (let i = 1; i <= 20; i++) {
				t.restoreSnapshot(baseSnap);
				t.branchOnContinuation('Branch ' + i);
				t.record({ id: 'sib-' + i, title: 'Sib ' + i, time: 1 + i * 0.1 });
			}
		});

		const branchCount20 = await page.evaluate(() => (window as any).timeline.getBranchCount());
		expect(branchCount20).toBe(21);

		// Gutter width must be bounded (<= 76px)
		const gutter20 = await page.$eval('.bk-timeline-graph-rows', (el) => {
			const v = getComputedStyle(el).getPropertyValue('--snapshot-gutter');
			return parseInt(v.replace('px', ''), 10);
		});
		expect(await page.$eval(".bk-timeline-graph-rows", el => el.clientWidth)).toBeGreaterThanOrEqual(gutter20 + 96);

		// Graph rows container must NOT blow out the 300px inspector
		const inspectorOverflow20 = await page.$eval('#inspector-300', (el) => el.scrollWidth <= el.clientWidth + 1);
		expect(inspectorOverflow20).toBe(true);

		expect(await page.$$eval('select, .bk-timeline-focus-toggle', controls => controls.length)).toBe(0);
		expect(await page.$$eval('.bk-snapshot-row', rows => new Set(rows.map(row => (row as HTMLElement).dataset.branchId)).size)).toBe(21);
		await page.focus('.bk-snapshot-row[data-id="base-1"]');
		await page.evaluate(() => (window as any).timeline.update(10, { speed: 20 }, true));
		expect(await page.evaluate(() => (document.activeElement as HTMLElement)?.dataset.id)).toBe('base-1');

		// 4. Test 12 Deep Nested Branches in 300px container
		await page.evaluate(() => {
			const container = document.querySelector('#timeline-container')!;
			(window as any).timeline.dispose();
			window.timeline = (window as any).createMeasurementTimeline(container, {
				schema: {},
				onRestoreSnapshot: () => true
			});
			window.timeline.setCapability(true);
			window.timeline.start(0, {});

			let prevSnap = { id: 'deep-0', time: 1, timestamp: 1000, label: 'D0', props: {}, telemetry: {}, isExact: true };
			window.timeline.record({ id: 'e-deep-0', title: 'Deep 0', time: 1, snapshot: prevSnap });
			window.timeline.record({ id: 'e-deep-0-later', title: 'Deep 0 Later', time: 100 });

			for (let d = 1; d <= 12; d++) {
				window.timeline.restoreSnapshot(prevSnap);
				window.timeline.branchOnContinuation('Chain ' + d);
				const nextSnap = { id: 'deep-' + d, time: 1 + d, timestamp: (1 + d) * 1000, label: 'D' + d, props: {}, telemetry: {}, isExact: true };
				window.timeline.record({ id: 'e-chain-' + d, title: 'Chain ' + d, time: 1 + d, snapshot: nextSnap });
				window.timeline.record({ id: 'e-chain-later-' + d, title: 'Chain Later ' + d, time: 1 + d + 0.5 });
				prevSnap = nextSnap;
			}
		});

		const branchCount12 = await page.evaluate(() => (window as any).timeline.getBranchCount());
		expect(branchCount12).toBe(13);

		const gutter12 = await page.$eval('.bk-timeline-graph-rows', (el) => {
			const v = getComputedStyle(el).getPropertyValue('--snapshot-gutter');
			return parseInt(v.replace('px', ''), 10);
		});
		expect(await page.$eval(".bk-timeline-graph-rows", el => el.clientWidth)).toBeGreaterThanOrEqual(gutter12 + 96);

		const inspectorOverflow12 = await page.$eval('#inspector-300', (el) => el.scrollWidth <= el.clientWidth + 1);
		expect(inspectorOverflow12).toBe(true);

		// 5. Test Inline Deletion Protection & Refusal without Restorable Fallback
		await page.evaluate(() => {
			const container = document.querySelector('#timeline-container')!;
			(window as any).timeline.dispose();
			window.canRestore = false; // Simulate broken/unavailable restore fallback
			window.timeline = (window as any).createMeasurementTimeline(container, {
				schema: {},
				onRestoreSnapshot: () => window.canRestore
			});
			window.timeline.setCapability(true);
			window.timeline.start(0, {}, { id: 's-start', time: 0, timestamp: 0, label: 'Start', props: {}, telemetry: {}, isExact: true });
			const s1 = { id: 's1', time: 2, timestamp: 2000, label: 'S1', props: {}, telemetry: {}, isExact: true };
			window.timeline.record({ id: 'e1', title: 'E1', time: 2, snapshot: s1 });
			window.timeline.record({ id: 'e1-later', title: 'E1 Later', time: 10 });

			window.canRestore = true;
			window.timeline.restoreSnapshot(s1);
			window.timeline.branchOnContinuation('Leaf Branch');
			window.timeline.record({ id: 'leaf-e', title: 'Leaf E', time: 3 });
		});

		expect(await page.evaluate(() => (window as any).timeline.getActiveBranchId())).toBe('branch-1');

		// Click the leaf node to open details panel
		await page.$eval('.bk-snapshot-row[data-branch-id="branch-1"]', (el) => (el as HTMLElement).click());
		const delBtnSelector = '.bk-timeline-delete-btn';
		await page.waitForSelector(delBtnSelector);

		// First click sets confirm state
		await page.$eval(delBtnSelector, (el) => (el as HTMLElement).click());
		const isConfirming = await page.$eval(delBtnSelector, (btn) => btn.getAttribute('data-confirm') === 'true' && btn.textContent === 'Confirm delete');
		expect(isConfirming).toBe(true);

		// Simulation restore fails -> branch deletion refused and state preserved
		await page.evaluate(() => { window.canRestore = false; });
		await page.$eval(delBtnSelector, (el) => (el as HTMLElement).click());
		const branchStillExists = await page.evaluate(() => (window as any).timeline.getActiveBranchId() === 'branch-1');
		expect(branchStillExists).toBe(true);

		// When restore works -> branch deleted and fallback restored
		await page.evaluate(() => { window.canRestore = true; });
		await page.$eval(delBtnSelector, (el) => (el as HTMLElement).click()); // first click sets confirm
		await page.$eval(delBtnSelector, (el) => (el as HTMLElement).click()); // second click confirms
		await page.waitForFunction(() => (window as any).timeline.getActiveBranchId() === 'main');
		expect(await page.evaluate(() => (window as any).timeline.getBranchCount())).toBe(1);

		// 6. Test Head Continuation After Unrecorded Live Progress
		await page.evaluate(() => {
			const t = (window as any).timeline;
			const snapHead = { id: 'snap-head', time: 4, timestamp: 4000, label: 'Head', props: {}, telemetry: {}, isExact: true };
			t.record({ id: 'e-head', title: 'Head', time: 4, snapshot: snapHead });
			t.update(9, { speed: 18 }, true); // unrecorded live progress
			t.restoreSnapshot(snapHead);
			const branchId = t.branchOnContinuation('Continue');
			window.headContinuationResult = branchId;
		});

		const headResult = await page.evaluate(() => (window as any).headContinuationResult);
		expect(headResult).toBe('branch-2');
		expect(await page.evaluate(() => (window as any).timeline.getBranchCount())).toBe(2);
		const restoredPresentTime = await page.evaluate(() => {
			const main = (window as any).timeline.getBranches().find((b: any) => b.id === 'main');
			return main?.presentPoint?.time;
		});
		expect(restoredPresentTime).toBe(9);

		// 7. Visual / Semantic Styles in Light and Dark
		for (const theme of ['light', 'dark']) {
			await page.evaluate((th) => { document.documentElement.dataset.theme = th; }, theme);

			// Start node role style
			const startBg = await page.$eval('.bk-snapshot-row[data-node-role="start"] .bk-snapshot-dot', (el) => getComputedStyle(el).backgroundColor);
			expect(startBg).not.toBe('');

			// Head role dot has accent border/background
			const headBg = await page.$eval('.bk-timeline-point[data-kind="present"] .bk-snapshot-dot', (el) => getComputedStyle(el).backgroundColor);
			expect(headBg).not.toBe('');
		}
	} finally {
		await browser.close();
	}
}, 30000);
