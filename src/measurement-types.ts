/**
 * Types for the mr-md measurement and plotting framework.
 *
 * This contract is shared between the simulation configuration/runtime
 * and the measurement plotting engine.
 */

export type MeasurementBadgeMode = "off" | "dot" | "count";

export type MeasurementPlotType =
	| "line"
	| "scatter"
	| "bar"
	| "vector-field"
	| (string & {});

export interface MeasurementPlotSeries {
	/** Telemetry scalar key for this series y value */
	y: string;
	/** Optional human-readable label for the series legend */
	label?: string;
}

export interface MeasurementPlot {
	/** Unique identifier for the plot card */
	id: string;
	/** Optional title displayed in the measurement carousel header */
	title?: string;
	/** Plot visualization type */
	type: MeasurementPlotType;
	/** Telemetry scalar key for x axis (defaults to sample counter if omitted) */
	x?: string;
	/** Telemetry scalar key for y axis (single series) */
	y?: string;
	/** Multiple y series bindings for multi-trace line or scatter plots */
	series?: MeasurementPlotSeries[];
	/** Telemetry dataset key for full array data binding */
	data?: string;
	/** Accessible label and unit for the x axis (e.g. "Time t (s)") */
	xLabel?: string;
	/** Accessible label and unit for the y axis (e.g. "Displacement x (m)") */
	yLabel?: string;
	/** Optional explicit lower bound for the x axis */
	xMin?: number;
	/** Optional explicit upper bound for the x axis */
	xMax?: number;
	/** Optional explicit lower bound for the y axis */
	yMin?: number;
	/** Optional explicit upper bound for the y axis */
	yMax?: number;
	/**
	 * Maximum historical or dataset points to retain.
	 * Default: 300, clamped to safe bounds [2, 1000].
	 */
	maxPoints?: number;
	/** Optional throttle interval in milliseconds between recorded samples */
	sampleMs?: number;
}

export interface MeasurementsConfig {
	/** Badge mode for measurement tab / indicator: 'off' | 'dot' | 'count' */
	badge?: MeasurementBadgeMode;
	/** Array of measurement plot definitions */
	plots?: MeasurementPlot[];
}

export interface MeasurementDataPoint {
	x: number;
	y: number;
	u?: number;
	v?: number;
}

export interface MeasurementPlotsInstance {
	/** Update plots with latest telemetry values dictionary */
	update(values: Record<string, unknown>): void;
	/** Reset all plot histories to empty state */
	reset(): void;
	/** Clean up event listeners, timers, and DOM elements */
	dispose(): void;
}

export interface MeasurementPlotBounds {
	xMin: number;
	xMax: number;
	yMin: number;
	yMax: number;
}

export interface MeasurementPlotViewBox {
	width: number;
	height: number;
	padding: {
		top: number;
		right: number;
		bottom: number;
		left: number;
	};
}

export interface MeasurementPlotRenderContext {
	/** Root SVG element for the active plot */
	svg: SVGSVGElement;
	/** Content group where data graphics are drawn */
	contentGroup: SVGGElement;
	/** Container DOM element */
	container: HTMLElement;
	/** The plot definition */
	plot: MeasurementPlot;
	/** Primary series points */
	points: MeasurementDataPoint[];
	/** Map of series key to points array for multi-series plots */
	seriesData?: Map<string, MeasurementDataPoint[]>;
	/** Computed coordinate bounds */
	bounds: MeasurementPlotBounds;
	/** Logical SVG viewBox dimensions */
	viewBox: MeasurementPlotViewBox;
	/** Helper to map data coordinates to SVG pixel coordinates */
	mapPointToSvg: (x: number, y: number) => { svgX: number; svgY: number };
}

export type MeasurementPlotRenderer = (
	ctx: MeasurementPlotRenderContext,
) => void;
