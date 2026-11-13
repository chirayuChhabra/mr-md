import type {
	MeasurementGraphPoint,
	MeasurementGraphSpec,
} from "./measurement-graphs.js";

export function graphValue(value: number, precision?: number): string {
	if (!Number.isFinite(value)) return "—";
	return precision === undefined
		? String(Number(value.toPrecision(4)))
		: value.toFixed(Math.max(0, Math.min(20, precision)));
}

const tick = (value: number) =>
	Math.abs(value) >= 10000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)
		? value.toExponential(1)
		: String(Number(value.toFixed(3)));

const axis = (label: string, unit?: string) =>
	unit ? `${label} (${unit})` : label;

interface ChartScale {
	xmin: number;
	xmax: number;
	ymin: number;
	ymax: number;
	pointsCount: number;
}

function niceStep(range: number, intervals = 2): number {
	if (range <= 0 || !Number.isFinite(range)) return 1;
	const roughStep = range / intervals;
	const exponent = Math.floor(Math.log10(roughStep));
	const fraction = roughStep / 10 ** exponent;
	let niceFraction = 1;
	if (fraction <= 1.2) niceFraction = 1;
	else if (fraction <= 2.5) niceFraction = 2;
	else if (fraction <= 6) niceFraction = 5;
	else niceFraction = 10;
	return niceFraction * 10 ** exponent;
}

function calculateNiceBounds(
	rawMin: number,
	rawMax: number,
	intervals = 2,
): { min: number; max: number; step: number } {
	if (rawMin === rawMax) {
		if (rawMin === 0) return { min: -1, max: 1, step: 1 };
		const delta = Math.abs(rawMin) * 0.2 || 1;
		rawMin -= delta;
		rawMax += delta;
	}
	const step = niceStep(rawMax - rawMin, intervals);
	const min = Math.floor(rawMin / step) * step;
	let max = Math.ceil(rawMax / step) * step;
	while ((max - min) / step < intervals) {
		max += step;
	}
	if (Math.round((max - min) / step) % intervals !== 0) {
		max += step;
	}
	return { min, max, step };
}

export function renderMeasurementGraph(
	container: HTMLElement,
	spec: MeasurementGraphSpec,
	points: MeasurementGraphPoint[],
	options: {
		cursor?: number | null;
		comparison?: MeasurementGraphPoint[];
		onInspect?: (point: MeasurementGraphPoint | null) => void;
	} = {},
) {
	const doc = container.ownerDocument;
	const values = points.filter(
		(point) => Number.isFinite(point.x) && Number.isFinite(point.y),
	);

	if (!values.length) {
		delete (container as any).__chartScale;
		if (container.querySelector(".bk-graph-empty")) return;
		container.replaceChildren();
		const empty = doc.createElement("p");
		empty.className = "bk-graph-empty";
		empty.textContent = "Waiting for measurements";
		container.append(empty);
		return;
	}

	const empty = container.querySelector(".bk-graph-empty");
	if (empty) empty.remove();

	const domainValues = [
		...values,
		...(options.comparison || []).filter(
			(point) => Number.isFinite(point.x) && Number.isFinite(point.y),
		),
	];
	let rawXMin = values[0].x,
		rawXMax = values[0].x,
		rawYMin = values[0].y,
		rawYMax = values[0].y;

	for (let i = 1; i < domainValues.length; i++) {
		const p = domainValues[i];
		if (p.x < rawXMin) rawXMin = p.x;
		if (p.x > rawXMax) rawXMax = p.x;
		if (p.y < rawYMin) rawYMin = p.y;
		if (p.y > rawYMax) rawYMax = p.y;
	}

	const cached = (container as any).__chartScale as ChartScale | undefined;
	let xmin: number;
	let xmax: number;
	let ymin: number;
	let ymax: number;

	if (
		cached &&
		values.length >= cached.pointsCount &&
		rawXMin >= cached.xmin &&
		rawXMax <= cached.xmax &&
		rawYMin >= cached.ymin &&
		rawYMax <= cached.ymax
	) {
		xmin = cached.xmin;
		xmax = cached.xmax;
		ymin = cached.ymin;
		ymax = cached.ymax;
		cached.pointsCount = values.length;
	} else {
		let minX = rawXMin;
		let maxX = rawXMax;
		if (spec.xAxis.key === "time") {
			minX = Math.min(0, rawXMin);
			if (maxX - minX < 2) maxX = minX + 2;
		}
		const xBounds = calculateNiceBounds(minX, maxX, 2);
		xmin = xBounds.min;
		xmax = xBounds.max;

		let minY = rawYMin;
		const maxY = rawYMax;
		if (minY >= 0 && minY < maxY * 0.3) {
			minY = 0;
		}
		const yBounds = calculateNiceBounds(minY, maxY, 2);
		ymin = yBounds.min;
		ymax = yBounds.max;

		if (cached && values.length >= cached.pointsCount) {
			if (xmin > cached.xmin && rawXMin >= cached.xmin) xmin = cached.xmin;
			if (xmax < cached.xmax && rawXMax <= cached.xmax) xmax = cached.xmax;
			if (ymin > cached.ymin && rawYMin >= cached.ymin) ymin = cached.ymin;
			if (ymax < cached.ymax && rawYMax <= cached.ymax) ymax = cached.ymax;
		}

		(container as any).__chartScale = {
			xmin,
			xmax,
			ymin,
			ymax,
			pointsCount: values.length,
		};
	}

	const sy = (y: number) => 224 - ((y - ymin) / (ymax - ymin)) * 188;
	const sx = (x: number) => 64 + ((x - xmin) / (xmax - xmin)) * 432;
	const ns = "http://www.w3.org/2000/svg";

	let svg = container.querySelector<SVGSVGElement>("svg");
	let gridLines: SVGLineElement[] = [];
	let gridTexts: SVGTextElement[] = [];
	let yLabel: SVGTextElement | null = null;
	let xminText: SVGTextElement | null = null;
	let xmaxText: SVGTextElement | null = null;
	let xLabel: SVGTextElement | null = null;
	let trace: SVGPolylineElement | null = null;
	let dot: SVGCircleElement | null = null;

	if (!svg) {
		container.replaceChildren();
		svg = doc.createElementNS(ns, "svg");
		svg.setAttribute("viewBox", "0 0 520 280");
		svg.setAttribute("role", "img");

		for (let i = 0; i <= 2; i++) {
			const line = doc.createElementNS(ns, "line");
			line.setAttribute("x1", "64");
			line.setAttribute("x2", "496");
			line.setAttribute("class", "bk-chart-grid");
			svg.append(line);
			gridLines.push(line);

			const node = doc.createElementNS(ns, "text");
			node.setAttribute("text-anchor", "end");
			svg.append(node);
			gridTexts.push(node);
		}

		yLabel = doc.createElementNS(ns, "text");
		yLabel.setAttribute("x", "64");
		yLabel.setAttribute("y", "18");
		svg.append(yLabel);

		xminText = doc.createElementNS(ns, "text");
		xminText.setAttribute("x", "64");
		xminText.setAttribute("y", "246");
		svg.append(xminText);

		xmaxText = doc.createElementNS(ns, "text");
		xmaxText.setAttribute("x", "496");
		xmaxText.setAttribute("y", "246");
		xmaxText.setAttribute("text-anchor", "end");
		svg.append(xmaxText);

		xLabel = doc.createElementNS(ns, "text");
		xLabel.setAttribute("x", "280");
		xLabel.setAttribute("y", "273");
		xLabel.setAttribute("text-anchor", "middle");
		svg.append(xLabel);

		trace = doc.createElementNS(ns, "polyline");
		trace.setAttribute("class", "bk-chart-trace");
		trace.setAttribute("fill", "none");
		svg.append(trace);

		dot = doc.createElementNS(ns, "circle");
		dot.setAttribute("r", "3");
		dot.setAttribute("class", "bk-chart-current");
		svg.append(dot);

		container.append(svg);
	} else {
		gridLines = Array.from(
			svg.querySelectorAll<SVGLineElement>(".bk-chart-grid"),
		);
		const texts = svg.querySelectorAll<SVGTextElement>("text");
		gridTexts = [texts[0], texts[1], texts[2]];
		yLabel = texts[3] || null;
		xminText = texts[4] || null;
		xmaxText = texts[5] || null;
		xLabel = texts[6] || null;
		trace = svg.querySelector<SVGPolylineElement>(".bk-chart-trace");
		dot = svg.querySelector<SVGCircleElement>(".bk-chart-current");
	}

	svg.setAttribute(
		"aria-label",
		`${spec.label}: ${axis(spec.yAxis.label, spec.yAxis.unit)} versus ${axis(spec.xAxis.label, spec.xAxis.unit)}`,
	);

	for (let i = 0; i <= 2; i++) {
		const value = ymin + ((ymax - ymin) * i) / 2;
		const line = gridLines[i];
		const yPos = Math.round(sy(value));
		if (line) {
			line.setAttribute("y1", String(yPos));
			line.setAttribute("y2", String(yPos));
		}
		const textNode = gridTexts[i];
		if (textNode) {
			textNode.setAttribute("x", "54");
			textNode.setAttribute("y", String(yPos + 4));
			textNode.textContent = tick(value);
		}
	}

	if (yLabel) yLabel.textContent = axis(spec.yAxis.label, spec.yAxis.unit);
	if (xminText) xminText.textContent = tick(xmin);
	if (xmaxText) xmaxText.textContent = tick(xmax);
	if (xLabel) xLabel.textContent = axis(spec.xAxis.label, spec.xAxis.unit);

	for (const node of svg.querySelectorAll(
		".bk-chart-branch, .bk-chart-user-band, .bk-chart-user-marker, .bk-chart-interaction-legend",
	))
		node.remove();
	if (trace) {
		const groups: {
			points: MeasurementGraphPoint[];
			interaction?: MeasurementGraphPoint["interaction"];
		}[] = [];
		for (let index = 0; index < values.length; index++) {
			const point = values[index];
			const previous = values[index - 1];
			const group = groups.at(-1);
			if (!group || previous.branchId !== point.branchId) {
				groups.push({ points: [point], interaction: point.interaction });
			} else if (group.interaction?.id !== point.interaction?.id) {
				// Each edge belongs to its destination sample. Automatic motion resumes
				// with the first untagged sample after a gesture ends.
				groups.push({
					points: [previous, point],
					interaction: point.interaction,
				});
			} else group.points.push(point);
		}
		for (const [index, group] of groups.entries()) {
			const segment = index === 0 ? trace : doc.createElementNS(ns, "polyline");
			segment.setAttribute(
				"class",
				`bk-chart-trace${index ? " bk-chart-branch" : ""}${group.interaction ? " bk-chart-user-trace" : ""}`,
			);
			segment.setAttribute("fill", "none");
			segment.setAttribute(
				"points",
				group.points.map((point) => `${sx(point.x)},${sy(point.y)}`).join(" "),
			);
			segment.replaceChildren();
			segment.removeAttribute("aria-label");
			if (index) svg.insertBefore(segment, dot);
			if (!group.interaction) continue;
			const label = `User interaction: ${group.interaction.label}`;
			const title = doc.createElementNS(ns, "title");
			title.textContent = label;
			segment.append(title);
			segment.setAttribute("aria-label", label);
			if (spec.xAxis.key === "time") {
				let left = sx(group.points[0].x),
					right = left;
				for (const point of group.points) {
					left = Math.min(left, sx(point.x));
					right = Math.max(right, sx(point.x));
				}
				const width = Math.max(4, right - left);
				const band = doc.createElementNS(ns, "rect");
				band.setAttribute("class", "bk-chart-user-band");
				band.setAttribute(
					"x",
					String(
						Math.max(
							64,
							Math.min(496 - width, left - (width - (right - left)) / 2),
						),
					),
				);
				band.setAttribute("y", "36");
				band.setAttribute("width", String(width));
				band.setAttribute("height", "188");
				band.setAttribute("aria-label", label);
				band.append(title.cloneNode(true));
				svg.insertBefore(band, trace);
			}
			const lastPoint = group.points.at(-1);
			if (!lastPoint) continue;
			const marker = doc.createElementNS(ns, "circle");
			marker.setAttribute("class", "bk-chart-user-marker");
			marker.setAttribute("cx", String(sx(lastPoint.x)));
			marker.setAttribute("cy", String(sy(lastPoint.y)));
			marker.setAttribute("r", "3");
			marker.setAttribute("aria-label", label);
			marker.append(title.cloneNode(true));
			svg.insertBefore(marker, dot);
		}
		if (groups.some((group) => group.interaction)) {
			const legend = doc.createElementNS(ns, "g");
			legend.setAttribute("class", "bk-chart-interaction-legend");
			legend.setAttribute(
				"aria-label",
				spec.xAxis.key === "time"
					? "User changes are shaded and drawn with dashed lines"
					: "User changes are drawn with dashed lines",
			);
			const swatch = doc.createElementNS(ns, "line");
			swatch.setAttribute("x1", "360");
			swatch.setAttribute("x2", "384");
			swatch.setAttribute("y1", "28");
			swatch.setAttribute("y2", "28");
			const text = doc.createElementNS(ns, "text");
			text.setAttribute("x", "392");
			text.setAttribute("y", "32");
			text.textContent = "User changes";
			legend.append(swatch, text);
			svg.append(legend);
		}
	}
	svg.querySelector(".bk-chart-comparison")?.remove();
	if (options.comparison?.length) {
		const comparison = doc.createElementNS(ns, "polyline");
		comparison.setAttribute("class", "bk-chart-comparison");
		comparison.setAttribute("fill", "none");
		comparison.setAttribute(
			"points",
			options.comparison
				.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
				.map((point) => `${sx(point.x)},${sy(point.y)}`)
				.join(" "),
		);
		svg.append(comparison);
	}
	svg.querySelector(".bk-chart-cursor")?.remove();
	container.querySelector(".bk-chart-readout")?.remove();
	const selected =
		options.cursor == null
			? null
			: values.reduce((best, point) =>
					Math.abs(point.time - options.cursor!) <=
					Math.abs(best.time - options.cursor!)
						? point
						: best,
				);
	if (selected) {
		const line = doc.createElementNS(ns, "line");
		line.setAttribute("class", "bk-chart-cursor");
		line.setAttribute("x1", String(sx(selected.x)));
		line.setAttribute("x2", String(sx(selected.x)));
		line.setAttribute("y1", "36");
		line.setAttribute("y2", "224");
		svg.append(line);
		const readout = doc.createElement("output");
		readout.className = "bk-chart-readout";
		readout.textContent = `${graphValue(selected.x)} ${spec.xAxis.unit || ""} · ${graphValue(selected.y, spec.precision)} ${spec.yAxis.unit || ""}`;
		if (selected.interaction)
			readout.textContent += ` · User interaction: ${selected.interaction.label}`;
		readout.title = readout.textContent || "";
		container.append(readout);
	}
	container.onpointermove = (event) => {
		if (!options.onInspect) return;
		const rect = svg!.getBoundingClientRect();
		if (!rect.width) return;
		const x =
			xmin +
			((((event.clientX - rect.left) / rect.width) * 520 - 64) / 432) *
				(xmax - xmin);
		options.onInspect(
			values.reduce((best, point) =>
				Math.abs(point.x - x) <= Math.abs(best.x - x) ? point : best,
			),
		);
	};
	container.onpointerleave = () => options.onInspect?.(null);

	const last = values.at(-1);
	if (last && dot) {
		dot.setAttribute("cx", String(Math.round(sx(last.x) * 10) / 10));
		dot.setAttribute("cy", String(Math.round(sy(last.y) * 10) / 10));
		dot.style.display = "";
	} else if (dot) {
		dot.style.display = "none";
	}
}
