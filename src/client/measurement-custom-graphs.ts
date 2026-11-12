import type { SimulationTelemetry } from "../types.js";
import type { MeasurementGraphSpec } from "./measurement-graphs.js";

export type CustomGraphResult =
	| { ok: true; spec: MeasurementGraphSpec }
	| { ok: false; message: string };

export function customGraphSpec(
	schema: SimulationTelemetry,
	x: string,
	y: string,
): CustomGraphResult {
	if ((x !== "time" && !Object.hasOwn(schema, x)) || !Object.hasOwn(schema, y))
		return { ok: false, message: "Choose a measurement for each axis." };
	const xItem = schema[x],
		yItem = schema[y];
	return {
		ok: true,
		spec: {
			key: `custom:${encodeURIComponent(x)}:${encodeURIComponent(y)}`,
			yKey: y,
			label: `${yItem.label || y} vs ${xItem?.label || (x === "time" ? "Time" : x)}`,
			precision: yItem.precision,
			xAxis: {
				key: x,
				label: xItem?.label || (x === "time" ? "Time" : x),
				unit: xItem?.unit || (x === "time" ? "s" : undefined),
			},
			yAxis: { label: yItem.label || y, unit: yItem.unit },
		},
	};
}

/** Pair only samples from the same instant and experimental branch. */
export function pairGraphSamples(
	xKey: string,
	xs: import("./measurement-graphs.js").MeasurementGraphPoint[],
	ys: import("./measurement-graphs.js").MeasurementGraphPoint[],
) {
	const byTime = new Map(
		xs.map((point) => [`${point.branchId || ""}:${point.time}`, point.y]),
	);
	return ys.flatMap((point) => {
		const x =
			xKey === "time"
				? point.time
				: byTime.get(`${point.branchId || ""}:${point.time}`);
		return typeof x === "number" &&
			Number.isFinite(x) &&
			Number.isFinite(point.y)
			? [{ ...point, x }]
			: [];
	});
}
