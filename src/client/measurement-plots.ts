/**
 * Measurement Plots Runtime for mr-md.
 *
 * Implements a lightweight, zero-dependency SVG plotting engine for simulation telemetry.
 * Supports line, scatter, bar, and vector-field plots, multi-series traces,
 * scalar streaming with gap preservation, full dataset replacement,
 * responsive bounds and axes, and an accessible carousel.
 */

import type {
	MeasurementDataPoint,
	MeasurementPlot,
	MeasurementPlotBounds,
	MeasurementPlotRenderContext,
	MeasurementPlotRenderer,
	MeasurementPlotsInstance,
	MeasurementPlotViewBox,
} from "../measurement-types.js";

export type {
	MeasurementBadgeMode,
	MeasurementDataPoint,
	MeasurementPlot,
	MeasurementPlotBounds,
	MeasurementPlotRenderContext,
	MeasurementPlotRenderer,
	MeasurementPlotSeries,
	MeasurementPlotsInstance,
	MeasurementPlotType,
	MeasurementPlotViewBox,
	MeasurementsConfig,
} from "../measurement-types.js";

const DEFAULT_MAX_POINTS = 300;
const MIN_BOUNDED_POINTS = 2;
const HARD_MAX_POINTS = 1000;
const SVG_NS = "http://www.w3.org/2000/svg";
let nextClipId = 0;

const DEFAULT_VIEWBOX: MeasurementPlotViewBox = {
	width: 460,
	height: 260,
	padding: {
		top: 22,
		right: 20,
		bottom: 46,
		left: 56,
	},
};

/**
 * Registry of custom plot renderers.
 * Safe boundary: JSON configurations specify plot types only as string tokens.
 * Custom renderer functions are registered programmatically in client runtime scripts.
 */
const customRenderers = new Map<string, MeasurementPlotRenderer>();

/**
 * Register an extension renderer for custom measurement plot types.
 *
 * @param type The unique plot type identifier
 * @param renderer The renderer callback function
 */
export function registerMeasurementPlotRenderer(
	type: string,
	renderer: MeasurementPlotRenderer,
): void {
	if (!type || typeof renderer !== "function") return;
	customRenderers.set(type, renderer);
}

/**
 * Internal state for a single plot within a measurement session.
 */
interface PlotState {
	plot: MeasurementPlot;
	slideEl: HTMLElement;
	svgEl: SVGSVGElement;
	gridGroup: SVGGElement;
	axesGroup: SVGGElement;
	labelsGroup: SVGGElement;
	contentGroup: SVGGElement;
	emptyEl: HTMLElement;
	points: MeasurementDataPoint[];
	seriesPoints: Map<string, MeasurementDataPoint[]>;
	sampleCounter: number;
	lastSampleTime: number;
	hasReceivedData: boolean;
	effectiveMaxPoints: number;
}

function clampMaxPoints(configured?: number): number {
	if (typeof configured !== "number" || !Number.isFinite(configured)) {
		return DEFAULT_MAX_POINTS;
	}
	const floored = Math.floor(configured);
	return Math.min(Math.max(floored, MIN_BOUNDED_POINTS), HARD_MAX_POINTS);
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(
	tag: K,
	className?: string,
): SVGElementTagNameMap[K] {
	const el = document.createElementNS(SVG_NS, tag);
	if (className) el.setAttribute("class", className);
	return el;
}

function formatTickNumber(val: number): string {
	if (!Number.isFinite(val)) return "—";
	if (Math.abs(val) >= 10000 || (Math.abs(val) < 0.001 && val !== 0)) {
		return val.toExponential(1);
	}
	if (Number.isInteger(val)) {
		return val.toString();
	}
	const formatted = Number.parseFloat(val.toFixed(2));
	return formatted.toString();
}

/**
 * Built-in renderer for line plots.
 * Handles gaps (NaN) cleanly without connecting lines across invalid intervals.
 */
function renderLinePlot(ctx: MeasurementPlotRenderContext): void {
	const { contentGroup, points, seriesData, mapPointToSvg, plot } = ctx;

	const seriesList =
		plot.series && plot.series.length > 0
			? plot.series
			: [{ y: plot.y || "y", label: plot.title }];

	seriesList.forEach((s, seriesIdx) => {
		const dataList = seriesData?.get(s.y) || (seriesIdx === 0 ? points : []);
		if (!dataList || dataList.length === 0) return;

		let d = "";
		let inSegment = false;

		for (let i = 0; i < dataList.length; i++) {
			const pt = dataList[i];
			if (Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
				const { svgX, svgY } = mapPointToSvg(pt.x, pt.y);
				if (!inSegment) {
					d += `M ${svgX.toFixed(1)} ${svgY.toFixed(1)} `;
					inSegment = true;
				} else {
					d += `L ${svgX.toFixed(1)} ${svgY.toFixed(1)} `;
				}
			} else {
				// Invalid point: terminate current line segment so gaps remain broken
				inSegment = false;
			}
		}

		if (d.trim().length > 0) {
			const path = createSvgElement(
				"path",
				`bk-measurement-line bk-measurement-series-${seriesIdx}`,
			);
			path.setAttribute("d", d.trim());
			path.setAttribute("fill", "none");
			path.setAttribute("stroke-linecap", "round");
			path.setAttribute("stroke-linejoin", "round");
			contentGroup.appendChild(path);
		}
	});
}

/**
 * Built-in renderer for scatter plots.
 */
function renderScatterPlot(ctx: MeasurementPlotRenderContext): void {
	const { contentGroup, points, seriesData, mapPointToSvg, plot } = ctx;

	const seriesList =
		plot.series && plot.series.length > 0
			? plot.series
			: [{ y: plot.y || "y", label: plot.title }];

	seriesList.forEach((s, seriesIdx) => {
		const dataList = seriesData?.get(s.y) || (seriesIdx === 0 ? points : []);
		if (!dataList || dataList.length === 0) return;

		const group = createSvgElement(
			"g",
			`bk-measurement-scatter-group bk-measurement-series-${seriesIdx}`,
		);

		for (let i = 0; i < dataList.length; i++) {
			const pt = dataList[i];
			if (Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
				const { svgX, svgY } = mapPointToSvg(pt.x, pt.y);
				const circle = createSvgElement(
					"circle",
					"bk-measurement-scatter-point",
				);
				circle.setAttribute("cx", svgX.toFixed(1));
				circle.setAttribute("cy", svgY.toFixed(1));
				circle.setAttribute("r", "3");
				group.appendChild(circle);
			}
		}

		contentGroup.appendChild(group);
	});
}

/**
 * Built-in renderer for bar charts.
 */
function renderBarPlot(ctx: MeasurementPlotRenderContext): void {
	const { contentGroup, points, mapPointToSvg, bounds, viewBox } = ctx;
	if (!points || points.length === 0) return;

	const group = createSvgElement("g", "bk-measurement-bar-group");
	const plotWidth =
		viewBox.width - viewBox.padding.left - viewBox.padding.right;
	const barWidth = Math.max(
		2,
		Math.min(28, (plotWidth / Math.max(points.length, 1)) * 0.7),
	);

	const baselineYVal = bounds.yMin <= 0 && bounds.yMax >= 0 ? 0 : bounds.yMin;
	const { svgY: baselineSvgY } = mapPointToSvg(0, baselineYVal);

	for (let i = 0; i < points.length; i++) {
		const pt = points[i];
		if (Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
			const { svgX, svgY } = mapPointToSvg(pt.x, pt.y);
			const rect = createSvgElement("rect", "bk-measurement-bar");
			const top = Math.min(svgY, baselineSvgY);
			const height = Math.max(1, Math.abs(svgY - baselineSvgY));
			const left = svgX - barWidth / 2;

			rect.setAttribute("x", left.toFixed(1));
			rect.setAttribute("y", top.toFixed(1));
			rect.setAttribute("width", barWidth.toFixed(1));
			rect.setAttribute("height", height.toFixed(1));
			group.appendChild(rect);
		}
	}

	contentGroup.appendChild(group);
}

/**
 * Built-in renderer for vector fields.
 */
function renderVectorFieldPlot(ctx: MeasurementPlotRenderContext): void {
	const { contentGroup, points, mapPointToSvg } = ctx;
	if (!points || points.length === 0) return;

	const group = createSvgElement("g", "bk-measurement-vector-group");
	const maxVectorPx = 18;

	for (let i = 0; i < points.length; i++) {
		const pt = points[i];
		if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;

		const u = Number.isFinite(pt.u) ? (pt.u as number) : 0;
		const v = Number.isFinite(pt.v) ? (pt.v as number) : 0;
		const mag = Math.hypot(u, v);
		if (mag <= 0) continue;

		const { svgX, svgY } = mapPointToSvg(pt.x, pt.y);
		const scale = Math.min(maxVectorPx / mag, 1);
		const dx = u * scale;
		const dy = -v * scale; // Inverted for SVG y-down coordinate space

		const endX = svgX + dx;
		const endY = svgY + dy;

		// Shaft
		const line = createSvgElement("line", "bk-measurement-vector-shaft");
		line.setAttribute("x1", svgX.toFixed(1));
		line.setAttribute("y1", svgY.toFixed(1));
		line.setAttribute("x2", endX.toFixed(1));
		line.setAttribute("y2", endY.toFixed(1));
		group.appendChild(line);

		// Arrowhead
		const angle = Math.atan2(dy, dx);
		const headLen = 4;
		const p1X = endX - headLen * Math.cos(angle - Math.PI / 6);
		const p1Y = endY - headLen * Math.sin(angle - Math.PI / 6);
		const p2X = endX - headLen * Math.cos(angle + Math.PI / 6);
		const p2Y = endY - headLen * Math.sin(angle + Math.PI / 6);

		const head = createSvgElement("polygon", "bk-measurement-vector-arrow");
		head.setAttribute(
			"points",
			`${endX.toFixed(1)},${endY.toFixed(1)} ${p1X.toFixed(1)},${p1Y.toFixed(1)} ${p2X.toFixed(1)},${p2Y.toFixed(1)}`,
		);
		group.appendChild(head);
	}

	contentGroup.appendChild(group);
}

/**
 * Register standard built-in plot renderers.
 */
registerMeasurementPlotRenderer("line", renderLinePlot);
registerMeasurementPlotRenderer("scatter", renderScatterPlot);
registerMeasurementPlotRenderer("bar", renderBarPlot);
registerMeasurementPlotRenderer("vector-field", renderVectorFieldPlot);

/**
 * Compute nice finite coordinate bounds for a plot.
 */
function computeBounds(
	plot: MeasurementPlot,
	points: MeasurementDataPoint[],
	seriesPoints?: Map<string, MeasurementDataPoint[]>,
): MeasurementPlotBounds {
	let minX = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	function checkPt(pt: MeasurementDataPoint) {
		if (Number.isFinite(pt.x)) {
			if (pt.x < minX) minX = pt.x;
			if (pt.x > maxX) maxX = pt.x;
		}
		if (Number.isFinite(pt.y)) {
			if (pt.y < minY) minY = pt.y;
			if (pt.y > maxY) maxY = pt.y;
		}
	}

	points.forEach(checkPt);
	if (seriesPoints) {
		seriesPoints.forEach((arr) => {
			arr.forEach(checkPt);
		});
	}

	// X Bounds
	let xMin: number;
	let xMax: number;
	if (
		plot.xMin !== undefined &&
		Number.isFinite(plot.xMin) &&
		plot.xMax !== undefined &&
		Number.isFinite(plot.xMax) &&
		plot.xMin < plot.xMax
	) {
		xMin = plot.xMin;
		xMax = plot.xMax;
	} else if (Number.isFinite(minX) && Number.isFinite(maxX)) {
		if (minX === maxX) {
			xMin = minX - 1;
			xMax = maxX + 1;
		} else {
			xMin =
				plot.xMin !== undefined && Number.isFinite(plot.xMin)
					? plot.xMin
					: minX;
			xMax =
				plot.xMax !== undefined && Number.isFinite(plot.xMax)
					? plot.xMax
					: maxX;
		}
	} else {
		xMin =
			plot.xMin !== undefined && Number.isFinite(plot.xMin) ? plot.xMin : 0;
		xMax =
			plot.xMax !== undefined && Number.isFinite(plot.xMax) ? plot.xMax : 10;
	}

	// Y Bounds
	let yMin: number;
	let yMax: number;
	if (
		plot.yMin !== undefined &&
		Number.isFinite(plot.yMin) &&
		plot.yMax !== undefined &&
		Number.isFinite(plot.yMax) &&
		plot.yMin < plot.yMax
	) {
		yMin = plot.yMin;
		yMax = plot.yMax;
	} else if (Number.isFinite(minY) && Number.isFinite(maxY)) {
		if (minY === maxY) {
			yMin = minY - 1;
			yMax = maxY + 1;
		} else {
			const span = maxY - minY;
			const pad = span * 0.05;
			yMin =
				plot.yMin !== undefined && Number.isFinite(plot.yMin)
					? plot.yMin
					: minY - pad;
			yMax =
				plot.yMax !== undefined && Number.isFinite(plot.yMax)
					? plot.yMax
					: maxY + pad;
		}
	} else {
		yMin =
			plot.yMin !== undefined && Number.isFinite(plot.yMin) ? plot.yMin : 0;
		yMax =
			plot.yMax !== undefined && Number.isFinite(plot.yMax) ? plot.yMax : 1;
	}

	if (plot.type === "bar" && plot.yMin === undefined && yMin > 0) {
		yMin = 0;
	}

	return { xMin, xMax, yMin, yMax };
}

/**
 * Creates and mounts interactive measurement plots inside a host container.
 */
export function createMeasurementPlots(
	container: HTMLElement,
	plots: MeasurementPlot[],
): MeasurementPlotsInstance {
	if (!container) {
		throw new Error(
			"createMeasurementPlots requires a valid container HTMLElement",
		);
	}

	// Clean existing content
	container.textContent = "";

	if (!plots || plots.length === 0) {
		const emptyNotice = document.createElement("div");
		emptyNotice.className = "bk-measurement-empty";
		emptyNotice.textContent = "No measurement plots configured.";
		container.appendChild(emptyNotice);

		return {
			update: () => {},
			reset: () => {},
			dispose: () => {
				container.textContent = "";
			},
		};
	}

	let activeIndex = 0;
	let rafId: number | null = null;
	let isDisposed = false;

	// Build DOM wrapper
	const wrapper = document.createElement("div");
	wrapper.className = "bk-measurement-wrapper";

	// Header toolbar
	const header = document.createElement("div");
	header.className = "bk-measurement-header";

	const titleWrap = document.createElement("div");
	titleWrap.className = "bk-measurement-title-wrap";
	const titleEl = document.createElement("span");
	titleEl.className = "bk-measurement-title";
	titleEl.textContent = plots[0].title || plots[0].id;
	titleWrap.appendChild(titleEl);
	header.appendChild(titleWrap);

	// Navigation controls
	let counterEl: HTMLElement | null = null;
	let prevBtn: HTMLButtonElement | null = null;
	let nextBtn: HTMLButtonElement | null = null;

	if (plots.length > 1) {
		const nav = document.createElement("div");
		nav.className = "bk-measurement-nav";

		prevBtn = document.createElement("button");
		prevBtn.type = "button";
		prevBtn.className = "bk-measurement-btn bk-measurement-prev";
		prevBtn.setAttribute("aria-label", "Previous plot");
		prevBtn.title = "Previous plot";
		prevBtn.innerHTML =
			'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>';

		counterEl = document.createElement("span");
		counterEl.className = "bk-measurement-counter";
		counterEl.setAttribute("aria-live", "polite");
		counterEl.textContent = `1 / ${plots.length}`;

		nextBtn = document.createElement("button");
		nextBtn.type = "button";
		nextBtn.className = "bk-measurement-btn bk-measurement-next";
		nextBtn.setAttribute("aria-label", "Next plot");
		nextBtn.title = "Next plot";
		nextBtn.innerHTML =
			'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>';

		nav.appendChild(prevBtn);
		nav.appendChild(counterEl);
		nav.appendChild(nextBtn);
		header.appendChild(nav);
	}

	wrapper.appendChild(header);

	// Carousel container
	const carousel = document.createElement("div");
	carousel.className = "bk-measurement-carousel";
	carousel.setAttribute("role", "region");
	carousel.setAttribute("aria-roledescription", "carousel");
	carousel.setAttribute("aria-label", "Measurement plots");
	carousel.tabIndex = 0;

	const track = document.createElement("div");
	track.className = "bk-measurement-track";

	// Initialize states for each plot
	const plotStates: PlotState[] = plots.map((plot, idx) => {
		const slide = document.createElement("div");
		slide.className = `bk-measurement-plot-item${idx === 0 ? " is-active" : ""}`;
		slide.setAttribute("data-plot-id", plot.id);
		slide.setAttribute("role", "group");
		slide.setAttribute("aria-roledescription", "slide");
		slide.setAttribute("aria-label", plot.title || plot.id);
		slide.setAttribute("aria-hidden", idx === 0 ? "false" : "true");
		slide.tabIndex = idx === 0 ? 0 : -1;

		// Multi-series legend if applicable
		if (plot.series && plot.series.length > 1) {
			const legend = document.createElement("div");
			legend.className = "bk-measurement-legend";
			plot.series.forEach((s, sIdx) => {
				const item = document.createElement("span");
				item.className = `bk-measurement-legend-item bk-measurement-series-${sIdx}`;
				const swatch = document.createElement("span");
				swatch.className = "bk-measurement-legend-swatch";
				const label = document.createElement("span");
				label.className = "bk-measurement-legend-label";
				label.textContent = s.label || s.y;
				item.appendChild(swatch);
				item.appendChild(label);
				legend.appendChild(item);
			});
			slide.appendChild(legend);
		}

		const graphWrap = document.createElement("div");
		graphWrap.className = "bk-measurement-graph";

		const svg = createSvgElement("svg", "bk-measurement-svg");
		svg.setAttribute(
			"viewBox",
			`0 0 ${DEFAULT_VIEWBOX.width} ${DEFAULT_VIEWBOX.height}`,
		);
		svg.setAttribute("width", "100%");
		svg.setAttribute("height", "100%");
		svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
		svg.setAttribute("role", "img");
		svg.setAttribute("aria-label", plot.title || plot.id);

		const gridGroup = createSvgElement("g", "bk-measurement-grid");
		const axesGroup = createSvgElement("g", "bk-measurement-axes");
		const labelsGroup = createSvgElement("g", "bk-measurement-labels");
		const contentGroup = createSvgElement("g", "bk-measurement-plot-content");
		const defs = createSvgElement("defs");
		const clip = createSvgElement("clipPath");
		const clipId = `bk-measurement-clip-${++nextClipId}`;
		clip.setAttribute("id", clipId);
		const clipRect = createSvgElement("rect");
		clipRect.setAttribute("x", String(DEFAULT_VIEWBOX.padding.left));
		clipRect.setAttribute("y", String(DEFAULT_VIEWBOX.padding.top));
		clipRect.setAttribute(
			"width",
			String(
				DEFAULT_VIEWBOX.width -
					DEFAULT_VIEWBOX.padding.left -
					DEFAULT_VIEWBOX.padding.right,
			),
		);
		clipRect.setAttribute(
			"height",
			String(
				DEFAULT_VIEWBOX.height -
					DEFAULT_VIEWBOX.padding.top -
					DEFAULT_VIEWBOX.padding.bottom,
			),
		);
		clip.appendChild(clipRect);
		defs.appendChild(clip);
		svg.appendChild(defs);
		contentGroup.setAttribute("clip-path", `url(#${clipId})`);

		svg.appendChild(gridGroup);
		svg.appendChild(axesGroup);
		svg.appendChild(labelsGroup);
		svg.appendChild(contentGroup);
		graphWrap.appendChild(svg);

		const empty = document.createElement("div");
		empty.className = "bk-measurement-empty";
		empty.textContent = "Waiting for measurement data...";
		graphWrap.appendChild(empty);

		slide.appendChild(graphWrap);
		track.appendChild(slide);

		const seriesPoints = new Map<string, MeasurementDataPoint[]>();
		if (plot.series) {
			plot.series.forEach((s) => {
				seriesPoints.set(s.y, []);
			});
		}

		return {
			plot,
			slideEl: slide,
			svgEl: svg,
			gridGroup,
			axesGroup,
			labelsGroup,
			contentGroup,
			emptyEl: empty,
			points: [],
			seriesPoints,
			sampleCounter: 0,
			lastSampleTime: 0,
			hasReceivedData: false,
			effectiveMaxPoints: clampMaxPoints(plot.maxPoints),
		};
	});

	carousel.appendChild(track);
	wrapper.appendChild(carousel);
	container.appendChild(wrapper);

	function renderPlot(state: PlotState): void {
		const {
			plot,
			gridGroup,
			axesGroup,
			labelsGroup,
			contentGroup,
			emptyEl,
			points,
			seriesPoints,
			hasReceivedData,
		} = state;

		// Count valid data points
		let validCount = points.filter(
			(pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y),
		).length;
		if (plot.series && plot.series.length > 0) {
			let seriesCount = 0;
			seriesPoints.forEach((pts) => {
				seriesCount += pts.filter(
					(pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y),
				).length;
			});
			if (seriesCount > 0) validCount = seriesCount;
		}

		if (!hasReceivedData || validCount === 0) {
			emptyEl.classList.remove("bk-measurement-hidden");
			gridGroup.textContent = "";
			axesGroup.textContent = "";
			labelsGroup.textContent = "";
			contentGroup.textContent = "";
			return;
		}

		emptyEl.classList.add("bk-measurement-hidden");

		const bounds = computeBounds(plot, points, seriesPoints);
		const vb = DEFAULT_VIEWBOX;
		const plotLeft = vb.padding.left;
		const plotRight = vb.width - vb.padding.right;
		const plotTop = vb.padding.top;
		const plotBottom = vb.height - vb.padding.bottom;
		const plotW = plotRight - plotLeft;
		const plotH = plotBottom - plotTop;

		const xRange = Math.max(bounds.xMax - bounds.xMin, 1e-6);
		const yRange = Math.max(bounds.yMax - bounds.yMin, 1e-6);

		function mapPointToSvg(x: number, y: number) {
			// Clip the drawing instead of moving out-of-range data onto the boundary.
			const svgX = plotLeft + ((x - bounds.xMin) / xRange) * plotW;
			const svgY = plotBottom - ((y - bounds.yMin) / yRange) * plotH;
			return { svgX, svgY };
		}

		// Clear previous frame
		gridGroup.textContent = "";
		axesGroup.textContent = "";
		labelsGroup.textContent = "";
		contentGroup.textContent = "";

		// Generate 4-5 ticks for X and Y
		const numTicks = 4;
		const xTicks: number[] = [];
		const yTicks: number[] = [];

		for (let i = 0; i <= numTicks; i++) {
			xTicks.push(bounds.xMin + (i / numTicks) * (bounds.xMax - bounds.xMin));
			yTicks.push(bounds.yMin + (i / numTicks) * (bounds.yMax - bounds.yMin));
		}

		// Grid and tick labels for Y
		yTicks.forEach((val) => {
			const { svgY } = mapPointToSvg(bounds.xMin, val);

			// Horizontal grid line
			const gridLine = createSvgElement(
				"line",
				"bk-measurement-grid-line bk-measurement-grid-y",
			);
			gridLine.setAttribute("x1", plotLeft.toString());
			gridLine.setAttribute("y1", svgY.toFixed(1));
			gridLine.setAttribute("x2", plotRight.toString());
			gridLine.setAttribute("y2", svgY.toFixed(1));
			gridGroup.appendChild(gridLine);

			// Y tick label
			const label = createSvgElement(
				"text",
				"bk-measurement-tick-label bk-measurement-tick-y",
			);
			label.setAttribute("x", (plotLeft - 6).toString());
			label.setAttribute("y", (svgY + 4).toFixed(1));
			label.setAttribute("text-anchor", "end");
			label.textContent = formatTickNumber(val);
			labelsGroup.appendChild(label);
		});

		// Grid and tick labels for X
		xTicks.forEach((val) => {
			const { svgX } = mapPointToSvg(val, bounds.yMin);

			// Vertical grid line
			const gridLine = createSvgElement(
				"line",
				"bk-measurement-grid-line bk-measurement-grid-x",
			);
			gridLine.setAttribute("x1", svgX.toFixed(1));
			gridLine.setAttribute("y1", plotTop.toString());
			gridLine.setAttribute("x2", svgX.toFixed(1));
			gridLine.setAttribute("y2", plotBottom.toString());
			gridGroup.appendChild(gridLine);

			// X tick label
			const label = createSvgElement(
				"text",
				"bk-measurement-tick-label bk-measurement-tick-x",
			);
			label.setAttribute("x", svgX.toFixed(1));
			label.setAttribute("y", (plotBottom + 16).toString());
			label.setAttribute("text-anchor", "middle");
			label.textContent = formatTickNumber(val);
			labelsGroup.appendChild(label);
		});

		// Main axes borders
		const axisX = createSvgElement(
			"line",
			"bk-measurement-axis bk-measurement-axis-x",
		);
		axisX.setAttribute("x1", plotLeft.toString());
		axisX.setAttribute("y1", plotBottom.toString());
		axisX.setAttribute("x2", plotRight.toString());
		axisX.setAttribute("y2", plotBottom.toString());
		axesGroup.appendChild(axisX);

		const axisY = createSvgElement(
			"line",
			"bk-measurement-axis bk-measurement-axis-y",
		);
		axisY.setAttribute("x1", plotLeft.toString());
		axisY.setAttribute("y1", plotTop.toString());
		axisY.setAttribute("x2", plotLeft.toString());
		axisY.setAttribute("y2", plotBottom.toString());
		axesGroup.appendChild(axisY);

		// Zero lines if zero is inside bounds
		if (bounds.yMin < 0 && bounds.yMax > 0) {
			const { svgY } = mapPointToSvg(bounds.xMin, 0);
			const zeroY = createSvgElement(
				"line",
				"bk-measurement-axis bk-measurement-axis-zero-y",
			);
			zeroY.setAttribute("x1", plotLeft.toString());
			zeroY.setAttribute("y1", svgY.toFixed(1));
			zeroY.setAttribute("x2", plotRight.toString());
			zeroY.setAttribute("y2", svgY.toFixed(1));
			axesGroup.appendChild(zeroY);
		}
		if (bounds.xMin < 0 && bounds.xMax > 0) {
			const { svgX } = mapPointToSvg(0, bounds.yMin);
			const zeroX = createSvgElement(
				"line",
				"bk-measurement-axis bk-measurement-axis-zero-x",
			);
			zeroX.setAttribute("x1", svgX.toFixed(1));
			zeroX.setAttribute("y1", plotTop.toString());
			zeroX.setAttribute("x2", svgX.toFixed(1));
			zeroX.setAttribute("y2", plotBottom.toString());
			axesGroup.appendChild(zeroX);
		}

		// Axis titles / labels
		if (plot.xLabel) {
			const xTitle = createSvgElement(
				"text",
				"bk-measurement-axis-label bk-measurement-axis-label-x",
			);
			xTitle.setAttribute("x", (plotLeft + plotW / 2).toFixed(1));
			xTitle.setAttribute("y", (vb.height - 8).toString());
			xTitle.setAttribute("text-anchor", "middle");
			xTitle.textContent = plot.xLabel;
			labelsGroup.appendChild(xTitle);
		}

		if (plot.yLabel) {
			const yTitle = createSvgElement(
				"text",
				"bk-measurement-axis-label bk-measurement-axis-label-y",
			);
			yTitle.setAttribute("transform", `rotate(-90)`);
			yTitle.setAttribute("x", (-plotTop - plotH / 2).toFixed(1));
			yTitle.setAttribute("y", "16");
			yTitle.setAttribute("text-anchor", "middle");
			yTitle.textContent = plot.yLabel;
			labelsGroup.appendChild(yTitle);
		}

		// Render plot content using registered renderer
		const renderCtx: MeasurementPlotRenderContext = {
			svg: state.svgEl,
			contentGroup,
			container,
			plot,
			points,
			seriesData: seriesPoints,
			bounds,
			viewBox: vb,
			mapPointToSvg,
		};

		const renderer = customRenderers.get(plot.type);
		if (renderer) {
			renderer(renderCtx);
		} else {
			const unsupported = createSvgElement("text", "bk-measurement-empty");
			unsupported.setAttribute("x", (plotLeft + plotW / 2).toString());
			unsupported.setAttribute("y", (plotTop + plotH / 2).toString());
			unsupported.setAttribute("text-anchor", "middle");
			unsupported.textContent = `Unsupported plot type: ${plot.type}`;
			contentGroup.appendChild(unsupported);
		}
	}

	function goToSlide(newIndex: number): void {
		if (newIndex < 0) {
			activeIndex = plots.length - 1;
		} else if (newIndex >= plots.length) {
			activeIndex = 0;
		} else {
			activeIndex = newIndex;
		}

		plotStates.forEach((state, idx) => {
			const isActive = idx === activeIndex;
			state.slideEl.classList.toggle("is-active", isActive);
			state.slideEl.setAttribute("aria-hidden", isActive ? "false" : "true");
			state.slideEl.tabIndex = isActive ? 0 : -1;
		});

		titleEl.textContent = plots[activeIndex].title || plots[activeIndex].id;
		if (counterEl) {
			counterEl.textContent = `${activeIndex + 1} / ${plots.length}`;
		}

		// Render active plot immediately
		renderPlot(plotStates[activeIndex]);
	}

	if (prevBtn) {
		prevBtn.addEventListener("click", () => goToSlide(activeIndex - 1));
	}
	if (nextBtn) {
		nextBtn.addEventListener("click", () => goToSlide(activeIndex + 1));
	}

	// Keyboard navigation
	function handleKeyDown(e: KeyboardEvent): void {
		if (e.key === "ArrowLeft") {
			e.preventDefault();
			goToSlide(activeIndex - 1);
		} else if (e.key === "ArrowRight") {
			e.preventDefault();
			goToSlide(activeIndex + 1);
		} else if (e.key === "Home") {
			e.preventDefault();
			goToSlide(0);
		} else if (e.key === "End") {
			e.preventDefault();
			goToSlide(plots.length - 1);
		}
	}
	carousel.addEventListener("keydown", handleKeyDown);

	// Touch swipe navigation preserving vertical page scroll
	let touchStartX = 0;
	let touchStartY = 0;

	function handleTouchStart(e: TouchEvent): void {
		if (e.touches.length !== 1) return;
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
	}

	function handleTouchEnd(e: TouchEvent): void {
		if (e.changedTouches.length !== 1) return;
		const dx = e.changedTouches[0].clientX - touchStartX;
		const dy = e.changedTouches[0].clientY - touchStartY;

		// Horizontal swipe requires horizontal delta to exceed vertical delta
		if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy)) {
			if (dx < 0) {
				goToSlide(activeIndex + 1);
			} else {
				goToSlide(activeIndex - 1);
			}
		}
	}

	carousel.addEventListener("touchstart", handleTouchStart, { passive: true });
	carousel.addEventListener("touchend", handleTouchEnd, { passive: true });

	// Initial render of active plot
	renderPlot(plotStates[0]);

	return {
		update(values: Record<string, unknown>): void {
			if (isDisposed || !values || typeof values !== "object") return;

			const now = Date.now();

			plotStates.forEach((state) => {
				const { plot } = state;

				// Throttle if sampleMs is configured
				if (plot.sampleMs && plot.sampleMs > 0) {
					if (now - state.lastSampleTime < plot.sampleMs) {
						return;
					}
					state.lastSampleTime = now;
				}

				// Full dataset replacement
				if (plot.data) {
					const rawDataset = values[plot.data];
					if (Array.isArray(rawDataset)) {
						const cleaned: MeasurementDataPoint[] = [];
						for (
							let i = 0;
							i < Math.min(rawDataset.length, state.effectiveMaxPoints);
							i++
						) {
							const item = rawDataset[i];
							if (
								item &&
								typeof item === "object" &&
								Number.isFinite(item.x) &&
								Number.isFinite(item.y)
							) {
								cleaned.push({
									x: Number(item.x),
									y: Number(item.y),
									u: Number.isFinite(item.u) ? Number(item.u) : undefined,
									v: Number.isFinite(item.v) ? Number(item.v) : undefined,
								});
							} else if (plot.type === "line") {
								cleaned.push({ x: Number.NaN, y: Number.NaN });
							}
						}
						// Hard bound max points
						if (cleaned.length > state.effectiveMaxPoints) {
							state.points = cleaned.slice(0, state.effectiveMaxPoints);
						} else {
							state.points = cleaned;
						}
						state.hasReceivedData = true;
					}
					return;
				}

				// Multi-series scalar streaming
				if (plot.series && plot.series.length > 0) {
					let xVal: number;
					if (plot.x) {
						const rawX = values[plot.x];
						xVal = Number.isFinite(rawX) ? Number(rawX) : Number.NaN;
					} else {
						xVal = state.sampleCounter;
					}

					let anyValidSeries = false;

					plot.series.forEach((s) => {
						const buf = state.seriesPoints.get(s.y);
						if (!buf) return;

						const rawY = values[s.y];
						const yVal = Number.isFinite(rawY) ? Number(rawY) : Number.NaN;

						if (Number.isFinite(xVal) && Number.isFinite(yVal)) {
							buf.push({ x: xVal, y: yVal });
							anyValidSeries = true;
						} else {
							// Record gap only if preceding point was valid (avoid infinite consecutive NaNs)
							if (buf.length > 0 && !Number.isNaN(buf[buf.length - 1].y)) {
								buf.push({ x: xVal, y: Number.NaN });
							}
						}

						if (buf.length > state.effectiveMaxPoints) {
							buf.splice(0, buf.length - state.effectiveMaxPoints);
						}
					});

					state.sampleCounter++;
					if (anyValidSeries) {
						state.hasReceivedData = true;
					}
					return;
				}

				// Single series scalar streaming
				let xVal: number;
				if (plot.x) {
					const rawX = values[plot.x];
					xVal = Number.isFinite(rawX) ? Number(rawX) : Number.NaN;
				} else {
					xVal = state.sampleCounter;
				}

				let yVal = Number.NaN;
				if (plot.y && values[plot.y] !== undefined) {
					const rawY = values[plot.y];
					yVal = Number.isFinite(rawY) ? Number(rawY) : Number.NaN;
				}

				if (Number.isFinite(xVal) && Number.isFinite(yVal)) {
					state.points.push({ x: xVal, y: yVal });
					state.hasReceivedData = true;
				} else {
					// Mark gap without fabricating zero
					if (
						state.points.length > 0 &&
						!Number.isNaN(state.points[state.points.length - 1].y)
					) {
						state.points.push({ x: xVal, y: Number.NaN });
					}
				}

				state.sampleCounter++;
				if (state.points.length > state.effectiveMaxPoints) {
					state.points.splice(
						0,
						state.points.length - state.effectiveMaxPoints,
					);
				}
			});

			// Schedule render of visible plot on next animation frame
			if (rafId === null) {
				rafId = requestAnimationFrame(() => {
					rafId = null;
					if (!isDisposed) {
						renderPlot(plotStates[activeIndex]);
					}
				});
			}
		},

		reset(): void {
			if (isDisposed) return;
			if (rafId !== null) {
				cancelAnimationFrame(rafId);
				rafId = null;
			}

			plotStates.forEach((state) => {
				state.points = [];
				state.seriesPoints.forEach((arr) => {
					arr.length = 0;
				});
				state.sampleCounter = 0;
				state.lastSampleTime = 0;
				state.hasReceivedData = false;
				renderPlot(state);
			});
		},

		dispose(): void {
			if (isDisposed) return;
			isDisposed = true;

			if (rafId !== null) {
				cancelAnimationFrame(rafId);
				rafId = null;
			}

			if (prevBtn) prevBtn.replaceWith(prevBtn.cloneNode(true));
			if (nextBtn) nextBtn.replaceWith(nextBtn.cloneNode(true));
			carousel.removeEventListener("keydown", handleKeyDown);
			carousel.removeEventListener("touchstart", handleTouchStart);
			carousel.removeEventListener("touchend", handleTouchEnd);

			container.textContent = "";
		},
	};
}
