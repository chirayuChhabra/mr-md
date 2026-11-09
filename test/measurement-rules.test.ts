import { expect, test } from "bun:test";
import { matchesMeasurementCondition as matches } from "../src/client/measurement-rules.js";

test("compares finite numbers and uses strict equality", () => {
	expect(matches(2, { op: "gt", value: 1 })).toBe(true);
	expect(matches(2, { op: "gte", value: 2 })).toBe(true);
	expect(matches(1, { op: "lt", value: 2 })).toBe(true);
	expect(matches(2, { op: "lte", value: 2 })).toBe(true);
	expect(matches("2", { op: "eq", value: 2 })).toBe(false);
	expect(matches("2", { op: "neq", value: 2 })).toBe(true);
	expect(matches(Infinity, { op: "gt", value: 2 })).toBe(false);
	expect(matches(NaN, { op: "neq", value: 2 })).toBe(false);
});
