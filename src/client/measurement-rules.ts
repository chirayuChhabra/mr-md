import type { MeasurementCondition } from "../types.js";

export function matchesMeasurementCondition(
	value: unknown,
	condition: MeasurementCondition,
): boolean {
	if (
		typeof value !== "number" &&
		typeof value !== "string" &&
		typeof value !== "boolean"
	)
		return false;
	if (condition.op === "eq" || condition.op === "neq") {
		if (typeof value === "number" && !Number.isFinite(value)) return false;
		if (
			typeof condition.value === "number" &&
			!Number.isFinite(condition.value)
		)
			return false;
		return condition.op === "eq"
			? value === condition.value
			: value !== condition.value;
	}
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		!Number.isFinite(condition.value)
	)
		return false;
	switch (condition.op) {
		case "gt":
			return value > condition.value;
		case "gte":
			return value >= condition.value;
		case "lt":
			return value < condition.value;
		case "lte":
			return value <= condition.value;
	}
}
