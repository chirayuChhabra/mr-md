import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createMeasurementGraphWorkspace, measurementGraphSpecs } from "../src/client/measurement-graphs.js";
import { renderMeasurementGraph } from "../src/client/measurement-graph-plot.js";

test("graph windows retain independent geometry, data and controls with a live multi-graph tab", () => {
	const dom = new JSDOM('<figure class="bk-object--maximized"></figure>', { pretendToBeVisual: true });
	const child = new JSDOM('', { pretendToBeVisual: true });
	const figure = dom.window.document.querySelector('figure')!;
	const specs = measurementGraphSpecs({
		a: { label: 'Displacement', unit: 'm', precision: 2, graph: true },
		b: { label: 'Velocity', unit: 'm/s', graph: { x: { key: 'a', label: 'Displacement', unit: 'm' } } },
	});
	expect(specs[0].xAxis).toEqual({ key: 'time', label: 'Time', unit: 's' });
	expect(specs[1].xAxis.key).toBe('a');
	(dom.window as any).open = () => child.window;
	(child.window as any).focus = () => {};
	const workspace = createMeasurementGraphWorkspace({
		figure,
		simId: 'test',
		specs,
		initialWindows: [{ key: 'a', x: 800, y: 600 }, { key: 'b', minimized: true }],
		onWindowsChange: () => {},
	});
	const click = (selector: string) => (figure.querySelector(selector) as HTMLElement).click();
	try {
		const header = figure.querySelector('.bk-graph-window-header');
		workspace.update({
			a: [{ x: 0, y: 1.234, time: 0 }, { x: 1, y: 2.345, time: 1 }],
			b: [{ x: 1, y: 3, time: 1 }],
		});
		expect(figure.querySelector('.bk-graph-value')?.textContent).toBe('2.35 m');
		expect(figure.querySelector('.bk-graph-window-header')).toBe(header);
		expect(workspace.getWindows()[0].x).toBeLessThanOrEqual(dom.window.innerWidth - 420);
		click('[data-measurement-key="a"] [aria-label="Maximize graph"]');
		expect(child.window.document.title).toBe('Measurement graphs');
		expect(child.window.document.querySelectorAll('#charts section')).toHaveLength(2);
		expect(child.window.document.querySelector('[data-measurement-key="b"] svg')?.getAttribute('aria-label')).toContain('Displacement (m)');
		const choice = child.window.document.querySelector('input')!;
		choice.checked = false;
		choice.dispatchEvent(new child.window.Event('change'));
		expect(child.window.document.querySelectorAll('#charts section')).toHaveLength(1);
		expect(child.window.document.querySelector('#charts')?.getAttribute('data-count')).toBe('1');
		const before = workspace.getWindows();
		workspace.reset();
		expect(workspace.getWindows()).toEqual(before);
		expect(figure.querySelector('polyline')).toBeNull();
		expect(child.window.document.querySelector('polyline')).toBeNull();
		click('[data-measurement-key="b"] [aria-label="Restore graph"]');
		expect(workspace.getWindows()[1].minimized).toBe(false);
		workspace.close('a');
		expect(workspace.getWindows().map((s) => s.key)).toEqual(['b']);
		workspace.dispose();
		expect(child.window.document.body.textContent).toContain('Source disconnected');
		expect(figure.querySelector('.bk-graph-layer')).toBeNull();
	} finally {
		workspace.dispose();
		dom.window.close();
		child.window.close();
	}
});

test("hiding graphs updates grid count to let remaining graphs fill space and displays empty state when none selected", () => {
	const dom = new JSDOM('<figure class="bk-object--maximized"></figure>', { pretendToBeVisual: true });
	const child = new JSDOM('', { pretendToBeVisual: true });
	const figure = dom.window.document.querySelector('figure')!;
	const specs = measurementGraphSpecs({
		g1: { label: 'Graph 1', unit: 'm', graph: true },
		g2: { label: 'Graph 2', unit: 'm/s', graph: true },
	});
	(dom.window as any).open = () => child.window;
	(child.window as any).focus = () => {};
	const workspace = createMeasurementGraphWorkspace({
		figure,
		simId: 'test-fill',
		specs,
		initialWindows: [{ key: 'g1' }, { key: 'g2' }],
		onWindowsChange: () => {},
	});
	try {
		workspace.update({
			g1: [{ x: 0, y: 1, time: 0 }, { x: 1, y: 2, time: 1 }],
			g2: [{ x: 0, y: 5, time: 0 }, { x: 1, y: 6, time: 1 }],
		});
		(figure.querySelector('[data-measurement-key="g1"] [aria-label="Maximize graph"]') as HTMLElement).click();

		const grid = child.window.document.querySelector('#charts')!;
		expect(grid.getAttribute('data-count')).toBe('2');
		expect(grid.querySelectorAll('section')).toHaveLength(2);

		const inputs = child.window.document.querySelectorAll<HTMLInputElement>('.bk-graph-choices input');
		expect(inputs).toHaveLength(2);

		// Hide g1 -> exactly 1 graph remains, grid count is "1" so single column fills space
		inputs[0].checked = false;
		inputs[0].dispatchEvent(new child.window.Event('change'));
		expect(grid.querySelectorAll('section')).toHaveLength(1);
		expect(grid.getAttribute('data-count')).toBe('1');
		expect(grid.querySelector('[data-measurement-key="g2"]')).not.toBeNull();

		// Hide g2 as well -> 0 graphs remain, grid count is "0" and empty placeholder is shown
		inputs[1].checked = false;
		inputs[1].dispatchEvent(new child.window.Event('change'));
		expect(grid.querySelectorAll('section')).toHaveLength(0);
		expect(grid.getAttribute('data-count')).toBe('0');
		expect(grid.querySelector('.bk-graph-workspace-empty')?.textContent).toContain('No graphs selected');

		// Re-check g1 -> restores single card filling space and removes empty placeholder
		inputs[0].checked = true;
		inputs[0].dispatchEvent(new child.window.Event('change'));
		expect(grid.querySelectorAll('section')).toHaveLength(1);
		expect(grid.getAttribute('data-count')).toBe('1');
		expect(grid.querySelector('.bk-graph-workspace-empty')).toBeNull();
	} finally {
		workspace.dispose();
		dom.window.close();
		child.window.close();
	}
});

test("renderMeasurementGraph reuses SVG DOM tree in-place avoiding tearing down DOM and choppiness", () => {
	const dom = new JSDOM('<div id="container"></div>', { pretendToBeVisual: true });
	const container = dom.window.document.getElementById('container')!;
	const spec = {
		key: 'disp',
		label: 'Displacement',
		precision: 2,
		xAxis: { key: 'time', label: 'Time', unit: 's' },
		yAxis: { label: 'Displacement', unit: 'm' },
	};

	// 1. Initial render with points
	renderMeasurementGraph(container, spec, [
		{ x: 0, y: 0, time: 0 },
		{ x: 1, y: 5, time: 1 },
	]);
	const svg = container.querySelector('svg');
	const polyline = container.querySelector('polyline');
	const dot = container.querySelector('circle');
	const lines = Array.from(container.querySelectorAll('line'));
	expect(svg).not.toBeNull();
	expect(polyline).not.toBeNull();
	expect(dot).not.toBeNull();
	expect(lines).toHaveLength(3);
	expect(polyline?.getAttribute('points')).toBeDefined();
	const initialPoints = polyline?.getAttribute('points');

	// 2. Subsequent update with new points: must reuse the exact same SVG/polyline/dot instances in-place
	renderMeasurementGraph(container, spec, [
		{ x: 0, y: 0, time: 0 },
		{ x: 1, y: 5, time: 1 },
		{ x: 2, y: 8, time: 2 },
	]);
	expect(container.querySelector('svg')).toBe(svg);
	expect(container.querySelector('polyline')).toBe(polyline);
	expect(container.querySelector('circle')).toBe(dot);
	expect(Array.from(container.querySelectorAll('line'))).toEqual(lines);
	expect(polyline?.getAttribute('points')).not.toBe(initialPoints);
	expect(polyline?.getAttribute('points')).toContain('2');

	// 3. Reset to empty points: replaces with empty notice
	renderMeasurementGraph(container, spec, []);
	expect(container.querySelector('svg')).toBeNull();
	expect(container.querySelector('.bk-graph-empty')?.textContent).toBe('Waiting for measurements');

	// 4. New data reappearing: recreates SVG cleanly
	renderMeasurementGraph(container, spec, [{ x: 0, y: 2, time: 0 }]);
	expect(container.querySelector('svg')).not.toBeNull();
	expect(container.querySelector('.bk-graph-empty')).toBeNull();
});

test("ResizeObserver lifecycle: observes created windows, handles window resizes, unobserves on close, and disconnects on dispose", () => {
	const dom = new JSDOM('<figure class="bk-object--maximized"></figure>', { pretendToBeVisual: true });
	const figure = dom.window.document.querySelector('figure')!;
	const specs = measurementGraphSpecs({
		v: { label: 'Voltage', unit: 'V', graph: true },
	});

	const observedElements = new Set<Element>();
	const unobservedElements = new Set<Element>();
	let disconnected = false;
	const callbacks: Array<(entries: any[]) => void> = [];

	class MockResizeObserver {
		constructor(callback: (entries: any[]) => void) {
			callbacks.push(callback);
		}
		observe(target: Element) {
			observedElements.add(target);
		}
		unobserve(target: Element) {
			unobservedElements.add(target);
			observedElements.delete(target);
		}
		disconnect() {
			disconnected = true;
			observedElements.clear();
		}
	}
	(dom.window as any).ResizeObserver = MockResizeObserver;

	let lastSavedStates: any[] = [];
	const workspace = createMeasurementGraphWorkspace({
		figure,
		simId: 'test-ro',
		specs,
		initialWindows: [{ key: 'v', width: 300, height: 250 }],
		onWindowsChange: (states) => {
			lastSavedStates = states;
		},
	});

	try {
		const windowEl = figure.querySelector('.bk-graph-window[data-measurement-key="v"]')!;
		expect(observedElements.has(windowEl)).toBe(true);

		// Simulate resize event via ResizeObserver
		for (const cb of callbacks) {
			cb([
				{
					target: windowEl,
					contentRect: { width: 500, height: 380 },
				},
			]);
		}
		expect(workspace.getWindows()[0].width).toBe(500);
		expect(workspace.getWindows()[0].height).toBe(380);
		expect(lastSavedStates[0]?.width).toBe(500);

		// Closing window unobserves it
		workspace.close('v');
		expect(unobservedElements.has(windowEl)).toBe(true);

		// Disposing workspace disconnects observer
		workspace.dispose();
		expect(disconnected).toBe(true);
	} finally {
		workspace.dispose();
		dom.window.close();
	}
});

test("multi-graph tab displays Live status during active playback regardless of main figure maximization", () => {
	const dom = new JSDOM('<figure class="bk-object"></figure>', { pretendToBeVisual: true });
	const child = new JSDOM('', { pretendToBeVisual: true });
	const figure = dom.window.document.querySelector('figure')!;
	const specs = measurementGraphSpecs({
		s: { label: 'Speed', unit: 'm/s', graph: true },
	});
	(dom.window as any).open = () => child.window;
	(child.window as any).focus = () => {};

	figure.setAttribute('data-bk-playback-state', 'playing');
	const workspace = createMeasurementGraphWorkspace({
		figure,
		simId: 'test-status',
		specs,
		initialWindows: [{ key: 's' }],
		onWindowsChange: () => {},
	});

	try {
		workspace.update({ s: [{ x: 0, y: 10, time: 2.4 }] });
		(figure.querySelector('[data-measurement-key="s"] [aria-label="Maximize graph"]') as HTMLElement).click();

		const status = child.window.document.querySelector('.bk-graph-workspace-status');
		expect(status?.textContent).toContain('Live');
		expect(status?.textContent).toContain('2.4 s');

		// When paused, status updates accurately to Paused
		figure.setAttribute('data-bk-playback-state', 'paused');
		workspace.update({ s: [{ x: 0, y: 10, time: 2.4 }] });
		expect(status?.textContent).toContain('Paused');
		expect(status?.textContent).toContain('2.4 s');
	} finally {
		workspace.dispose();
		dom.window.close();
		child.window.close();
	}
});

test("minimized graph geometry collapses to header-only height and eliminates verbose header tooltip", () => {
	const dom = new JSDOM('<figure class="bk-object--maximized"></figure>', { pretendToBeVisual: true });
	const figure = dom.window.document.querySelector('figure')!;
	const specs = measurementGraphSpecs({
		energy: { label: 'Mechanical Energy', unit: 'J', precision: 1, graph: true },
	});
	const workspace = createMeasurementGraphWorkspace({
		figure,
		simId: 'test-collapse',
		specs,
		initialWindows: [{ key: 'energy', width: 320, height: 260 }],
		onWindowsChange: () => {},
	});

	try {
		const windowEl = figure.querySelector<HTMLElement>('.bk-graph-window[data-measurement-key="energy"]')!;
		const header = windowEl.querySelector<HTMLElement>('.bk-graph-window-header')!;
		const minimizeBtn = windowEl.querySelector<HTMLButtonElement>('[aria-label="Minimize graph"]')!;

		// Header tooltip regression test: no giant native tooltip on header hover; accessible guidance via aria-description
		expect(header.getAttribute('title')).toBeNull();
		expect(header.getAttribute('aria-description')).toContain('Drag to move');

		// Initial un-minimized geometry
		expect(windowEl.dataset.minimized).toBe('false');
		expect(windowEl.style.position).toBe('');
		expect(minimizeBtn.textContent).toBe('−');

		// Minimize window: collapses to 44px header-only height, overrides min-height
		minimizeBtn.click();
		expect(windowEl.dataset.minimized).toBe('true');
		expect(windowEl.dataset.minimized).toBe('true');
		const restoreBtn = windowEl.querySelector<HTMLButtonElement>('[aria-label="Restore graph"]')!;
		expect(restoreBtn.textContent).toBe('+');
		expect(restoreBtn.title).toBe('Restore graph');

		// Verify CSS rules in layer stylesheet enforce min-height: 0 and height: 44px when minimized
		const styleEl = figure.querySelector('.bk-graph-layer style')!;
		expect(styleEl.textContent).toContain('.bk-graph-window[data-minimized=true]{height:44px}');

		// Restore window: restores previous user height and controls
		restoreBtn.click();
		expect(windowEl.dataset.minimized).toBe('false');
		expect(windowEl.style.position).toBe('');
		expect(windowEl.querySelector('[aria-label="Minimize graph"]')?.textContent).toBe('−');
	} finally {
		workspace.dispose();
		dom.window.close();
	}
});

test("frame coalescing: multiple synchronous updates within one frame coalesce into a single render pass without browser", () => {
	const dom = new JSDOM('<figure class="bk-object--maximized"></figure>', { pretendToBeVisual: true });
	const figure = dom.window.document.querySelector('figure')!;
	const specs = measurementGraphSpecs({
		flow: { label: 'Current Flow', unit: 'A', precision: 2, graph: true },
	});

	let rafCallbacks: Array<() => void> = [];
	let rafCallCount = 0;
	let cancelCount = 0;
	let nextId = 1;
	const activeIds = new Set<number>();

	(dom.window as any).requestAnimationFrame = (cb: () => void) => {
		rafCallCount++;
		const id = nextId++;
		activeIds.add(id);
		rafCallbacks.push(() => {
			if (activeIds.has(id)) {
				activeIds.delete(id);
				cb();
			}
		});
		return id;
	};
	(dom.window as any).cancelAnimationFrame = (id: number) => {
		cancelCount++;
		activeIds.delete(id);
	};

	const workspace = createMeasurementGraphWorkspace({
		figure,
		simId: 'test-coalesce',
		specs,
		initialWindows: [{ key: 'flow' }],
		onWindowsChange: () => {},
	});

	try {
		// Reset raf callback tracker after initial setup
		rafCallbacks = [];
		rafCallCount = 0;

		// 1. Fire 3 rapid synchronous updates before a frame ticks
		workspace.update({ flow: [{ x: 0, y: 1.0, time: 0 }] });
		workspace.update({ flow: [{ x: 0, y: 1.0, time: 0 }, { x: 1, y: 2.0, time: 1 }] });
		workspace.update({ flow: [{ x: 0, y: 1.0, time: 0 }, { x: 1, y: 2.0, time: 1 }, { x: 2, y: 3.5, time: 2 }] });

		// Fast path: Header value shows latest reading immediately
		const valueEl = figure.querySelector('.bk-graph-value')!;
		expect(valueEl.textContent).toBe('3.50 A');

		// Coalescing: exactly 1 requestAnimationFrame was scheduled for all 3 updates
		expect(rafCallCount).toBe(1);
		expect(activeIds.size).toBe(1);

		// Execute the single animation frame callback
		const pendingCbs = [...rafCallbacks];
		rafCallbacks = [];
		pendingCbs.forEach((cb) => cb());

		// Verify plot rendered with points from update 3 (x=2, y=3.5)
		const polyline = figure.querySelector('polyline')!;
		expect(polyline).not.toBeNull();
		const pointsAttr = polyline.getAttribute('points');
		expect(pointsAttr).toBeDefined();

		// 2. Test reset cancels pending RAF
		rafCallCount = 0;
		cancelCount = 0;
		workspace.update({ flow: [{ x: 3, y: 4.0, time: 3 }] });
		expect(rafCallCount).toBe(1);
		expect(activeIds.size).toBe(1);

		workspace.reset();
		expect(cancelCount).toBe(1);
		expect(activeIds.size).toBe(0);
		expect(figure.querySelector('polyline')).toBeNull();

		// 3. Test explicit flush immediately renders without waiting for RAF
		rafCallCount = 0;
		workspace.update({ flow: [{ x: 0, y: 5.0, time: 0 }, { x: 1, y: 6.0, time: 1 }] });
		expect(rafCallCount).toBe(1);
		workspace.flush();
		expect(figure.querySelector('polyline')).not.toBeNull();
	} finally {
		workspace.dispose();
		dom.window.close();
	}
});

test("scale stabilization: nice bounds and scale caching prevent bouncing grid lines and scale jumps", () => {
	const dom = new JSDOM('<div id="chart-test"></div>', { pretendToBeVisual: true });
	const container = dom.window.document.getElementById('chart-test')!;
	const spec = {
		key: 'osc',
		label: 'Oscillation',
		precision: 2,
		xAxis: { key: 'time', label: 'Time', unit: 's' },
		yAxis: { label: 'Amplitude', unit: 'm' },
	};

	// 1. Initial render with range y in [0, 1.2], x in [0, 1]
	renderMeasurementGraph(container, spec, [
		{ x: 0, y: 0, time: 0 },
		{ x: 1, y: 1.2, time: 1 },
	]);

	const polyline1 = container.querySelector('polyline')!.getAttribute('points')!;
	const texts1 = Array.from(container.querySelectorAll<SVGTextElement>('text')).slice(0, 3);
	const tickLabels1 = texts1.map((t) => t.textContent);
	expect(tickLabels1).toEqual(['0', '1', '2']);

	// 2. Incremental update: y increases slightly to 1.5, which is still within nice bounds (0 to 2)
	renderMeasurementGraph(container, spec, [
		{ x: 0, y: 0, time: 0 },
		{ x: 1, y: 1.2, time: 1 },
		{ x: 2, y: 1.5, time: 2 },
	]);

	const polyline2 = container.querySelector('polyline')!.getAttribute('points')!;
	const texts2 = Array.from(container.querySelectorAll<SVGTextElement>('text')).slice(0, 3);
	const tickLabels2 = texts2.map((t) => t.textContent);

	// Grid tick labels must remain completely stable without jumping
	expect(tickLabels2).toEqual(['0', '1', '2']);
	// The coordinate for x=1, y=1.2 must remain identical to step 1
	const pt1 = polyline1.split(' ')[1];
	const pt2 = polyline2.split(' ')[1];
	expect(pt2).toBe(pt1);

	// 3. Scale only expands when data genuinely exceeds bounds
	renderMeasurementGraph(container, spec, [
		{ x: 0, y: 0, time: 0 },
		{ x: 1, y: 1.2, time: 1 },
		{ x: 2, y: 1.5, time: 2 },
		{ x: 3, y: 8.0, time: 3 },
	]);

	// Range now cleanly expanded to 10
	const texts3 = Array.from(container.querySelectorAll<SVGTextElement>('text')).slice(0, 3);
	expect(texts3.map((t) => t.textContent)).toEqual(['0', '5', '10']);
});


test("docked plots share inspection cursor and split branch traces", () => {
 const dom = new JSDOM('<figure></figure>', { pretendToBeVisual: true });
 const figure = dom.window.document.querySelector('figure')!;
 const specs = measurementGraphSpecs({ a: {graph: true, unit: 'm'}, b: {graph: true, unit: 's'} });
 const workspace = createMeasurementGraphWorkspace({figure, simId: 'dock', specs, initialWindows: [], onWindowsChange: () => {}});
 try {
  workspace.open('a'); workspace.open('b');
  expect(figure.querySelector<HTMLElement>('.bk-graph-layer')!.hidden).toBe(false);
  workspace.update({a: [{time: 0, x: 0, y: 1, branchId: 'a'}, {time: 1, x: 1, y: 2, branchId: 'b'}], b: [{time: 0, x: 0, y: 3}, {time: 1, x: 1, y: 4}]});
  workspace.flush();
  expect(figure.querySelectorAll('[data-measurement-key="a"] polyline')).toHaveLength(2);
  const seen: (number | null)[] = [];
  const unsubscribe = workspace.onCursorChange(time => seen.push(time));
  const plot = figure.querySelector<HTMLElement>('[data-measurement-key="a"] .bk-graph-plot')!;
  const svg = plot.querySelector('svg')!;
  svg.getBoundingClientRect = () => ({left: 0, width: 520} as DOMRect);
  plot.dispatchEvent(new dom.window.MouseEvent('pointermove', {clientX: 280}));
  expect(seen.length).toBe(1);
  expect(figure.querySelectorAll('.bk-chart-readout')).toHaveLength(2);
  workspace.setCursor(null);
  expect(figure.querySelectorAll('.bk-chart-readout')).toHaveLength(0);
  unsubscribe();
  workspace.close('a'); workspace.close('b');
  expect(figure.querySelector<HTMLElement>('.bk-graph-layer')!.hidden).toBe(true);
 } finally { workspace.dispose(); dom.window.close(); }
});

test("comparison traces can be removed and Fit recalculates expanded bounds", () => {
 const dom = new JSDOM('<figure class="bk-object--maximized"></figure>', {pretendToBeVisual:true});
 const figure = dom.window.document.querySelector('figure')!;
 const workspace = createMeasurementGraphWorkspace({figure,simId:'compare',specs:measurementGraphSpecs({x:{label:'Position',graph:true}}),initialWindows:[{key:'x'}],onWindowsChange:()=>{}});
 try {
  workspace.update({x:[{time:0,x:0,y:0},{time:1,x:1,y:1}]}); workspace.flush();
  workspace.setComparison({label:'Original',data:{x:[{time:0,x:0,y:0},{time:1,x:1,y:100}]}});
  expect(figure.querySelector('.bk-chart-comparison')).not.toBeNull();
  const plot = figure.querySelector('.bk-graph-plot') as any;
  expect(plot.__chartScale.ymax).toBeGreaterThanOrEqual(100);
  (figure.querySelector('[aria-label="Remove path comparison"]') as HTMLElement).click();
  expect(figure.querySelector('.bk-chart-comparison')).toBeNull();
  expect(plot.__chartScale.ymax).toBeLessThan(100);
  workspace.setCursor(0);
  expect(figure.querySelector('.bk-chart-readout')?.textContent).toContain('0');
  workspace.update({x:[{time:0,x:0,y:0},{time:1,x:1,y:50}]}); workspace.flush();
  workspace.update({x:[{time:0,x:0,y:0},{time:1,x:1,y:1}]}); workspace.flush();
  (figure.querySelector('[aria-label="Fit graph"]') as HTMLElement).click();
  expect(plot.__chartScale.ymax).toBeLessThan(50);
 } finally {workspace.dispose();dom.window.close();}
});

test("user interactions distinguish incoming segments and shade paused edits without changing automatic continuation", () => {
 const dom=new JSDOM('<div id="plot"></div>');
 const plot=dom.window.document.getElementById('plot')!;
 const spec=measurementGraphSpecs({x:{label:'Position',graph:true}})[0];
 const interaction={id:'drag-1',label:'Cart dragged <img src=x onerror=alert(1)>'};
 const points=[{time:0,x:0,y:0,branchId:'main'},{time:1,x:1,y:1,branchId:'main'},
  {time:1,x:1,y:3,branchId:'main',interaction},{time:1,x:1,y:4,branchId:'main',interaction},
  {time:2,x:2,y:2,branchId:'main'}];
 renderMeasurementGraph(plot,spec,points,{cursor:1});
 const changed=plot.querySelector('.bk-chart-user-trace')!;
 expect(changed).not.toBeNull();
 expect(changed.getAttribute('points')!.split(' ')).toHaveLength(3);
 expect(Number(plot.querySelector('.bk-chart-user-band')!.getAttribute('width'))).toBeGreaterThanOrEqual(4);
 expect(plot.querySelector('.bk-chart-user-band title')?.textContent).toContain(interaction.label);
 expect(plot.querySelector('.bk-chart-interaction-legend')?.textContent).toContain('User changes');
 expect(plot.querySelectorAll('img')).toHaveLength(0);
 const traces=plot.querySelectorAll('.bk-chart-trace');
 expect(traces[traces.length-1].classList.contains('bk-chart-user-trace')).toBe(false);
 expect(traces[traces.length-1].getAttribute('points')!.split(' ')).toHaveLength(2);
 renderMeasurementGraph(plot,spec,points.slice(0,2));
 expect(plot.querySelector('.bk-chart-user-trace')).toBeNull();
 expect(plot.querySelector('.bk-chart-user-band')).toBeNull();
 expect(plot.querySelector('.bk-chart-interaction-legend')).toBeNull();
 dom.window.close();
});

test("interaction coloring works on custom axes without treating measurement ranges as time", () => {
 const dom=new JSDOM('<div></div>');const plot=dom.window.document.querySelector('div')!;
 const spec=measurementGraphSpecs({v:{label:'Velocity',graph:{x:{key:'position'}}}})[0];
 const interaction={id:'drag',label:'Dragged'};
 renderMeasurementGraph(plot,spec,[{time:0,x:2,y:0},{time:1,x:1,y:1,interaction},{time:2,x:0,y:3}],{cursor:1});
 expect(plot.querySelector('.bk-chart-user-trace')).not.toBeNull();
 expect(plot.querySelector('.bk-chart-user-band')).toBeNull();
 expect(plot.querySelector('.bk-chart-readout')?.textContent).toContain('Dragged');
 dom.window.close();
});

test("interaction traces never bridge experimental branches and remain visible in the graph tab", () => {
 const dom=new JSDOM('<figure class="bk-object--maximized"></figure>',{pretendToBeVisual:true});
 const popup=new JSDOM('',{pretendToBeVisual:true});
 const figure=dom.window.document.querySelector('figure')!;
 (dom.window as any).open=()=>popup.window;(popup.window as any).focus=()=>{};
 const workspace=createMeasurementGraphWorkspace({figure,simId:'interaction-tab',specs:measurementGraphSpecs({x:{graph:true}}),initialWindows:[{key:'x'}],onWindowsChange:()=>{}});
 try {
  workspace.update({x:[{time:0,x:0,y:0,branchId:'before'}, {time:1,x:1,y:2,branchId:'after',interaction:{id:'drag',label:'Cart dragged'}}]});
  workspace.flush();
  const changed=figure.querySelector('.bk-chart-user-trace')!;
  expect(changed.getAttribute('points')!.split(' ')).toHaveLength(1);
  (figure.querySelector('[aria-label="Maximize graph"]') as HTMLElement).click();
  expect(popup.window.document.querySelector('.bk-chart-user-trace')).not.toBeNull();
  expect(popup.window.document.querySelector('.bk-chart-user-band')).not.toBeNull();
  expect(popup.window.document.querySelector('.bk-chart-interaction-legend')?.textContent).toContain('User changes');
  expect(popup.window.document.head.textContent).toContain('stroke-dasharray:6 4');
 } finally { workspace.dispose();dom.window.close();popup.window.close(); }
});
