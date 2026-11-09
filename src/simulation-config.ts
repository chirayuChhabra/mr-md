import { readFileSync } from "node:fs";
import { z } from "zod";

const scalar = z.union([z.string(), z.number(), z.boolean()]);
const props = z.record(z.string(), z.unknown());
const control = z.object({
	type: z
		.enum(["range", "number", "text", "boolean", "select", "segmented"])
		.optional(),
	label: z.string().optional(),
	min: z.number().optional(),
	max: z.number().optional(),
	step: z.number().positive().optional(),
	unit: z.string().optional(),
	options: z.array(z.object({ label: z.string(), value: scalar })).optional(),
	advanced: z.boolean().optional(),
	group: z.string().optional(),
});
const tunables = z.record(z.string(), control);
const action = z.object({
	label: z.string(),
	color: z.enum(["accent", "neutral", "red", "green", "amber"]).optional(),
});
const condition = z.union([
	z.object({
		op: z.enum(["gt", "gte", "lt", "lte"]),
		value: z.number().finite(),
	}),
	z.object({
		op: z.enum(["eq", "neq"]),
		value: z.union([z.string(), z.number().finite(), z.boolean()]),
	}),
]);
const telemetry = z.record(
	z.string(),
	z.object({
		label: z.string().optional(),
		unit: z.string().optional(),
		precision: z.number().int().min(0).max(20).optional(),
		group: z.string().optional(),
		description: z.string().optional(),
		display: z.enum(["metric", "status", "row"]).optional(),
		states: z
			.array(
				z.object({
					when: condition,
					tone: z.enum(["neutral", "accent", "success", "warning", "danger"]),
					label: z.string().optional(),
				}),
			)
			.optional(),
		notifications: z
			.array(
				z.object({
					id: z.string(),
					when: condition,
					message: z.string(),
					once: z.boolean().optional(),
					cooldown: z.number().finite().nonnegative().optional(),
					tone: z
						.enum(["neutral", "accent", "success", "warning", "danger"])
						.optional(),
					toast: z.boolean().optional(),
				}),
			)
			.optional(),
		graph: z
			.union([
				z.boolean(),
				z.object({
					label: z.string().optional(),
					x: z
						.object({
							key: z.string().optional(),
							label: z.string().optional(),
							unit: z.string().optional(),
						})
						.optional(),
					y: z
						.object({
							label: z.string().optional(),
							unit: z.string().optional(),
						})
						.optional(),
				}),
			])
			.optional(),
		scene: z.string().optional(),
		changeThreshold: z.number().finite().nonnegative().optional(),
	}),
);

const timeline = z.union([
	z.boolean(),
	z.object({
		start: z.boolean().optional(),
		present: z.boolean().optional(),
		controls: z.boolean().optional(),
		capture: z.boolean().optional(),
	}),
]);

/** Structural schema is also the source for the published editor JSON Schema. */
export const simulationConfigSchema = z
	.object({
		$schema: z.string().optional(),
		type: z.enum(["block", "steps", "world"]).optional(),
		props: props.optional(),
		tunables: tunables.optional(),
		actions: z.record(z.string(), action).optional(),
		presets: z
			.record(
				z.string(),
				z.object({ label: z.string(), props: z.record(z.string(), scalar) }),
			)
			.optional(),
		advancedControls: z.array(z.string()).optional(),
		telemetry: telemetry.optional(),
		timeline: timeline.optional(),
		measurements: z
			.object({
				visible: z.array(z.string()).optional(),
				graphs: z
					.array(
						z.object({
							key: z.string(),
							minimized: z.boolean().optional(),
							x: z.number().finite().optional(),
							y: z.number().finite().optional(),
							width: z.number().finite().positive().optional(),
							height: z.number().finite().positive().optional(),
						}),
					)
					.optional(),
				initialTab: z.enum(["controls", "telemetry", "timeline", "graphs"]).optional(),
				notifications: z
					.object({
						enabled: z.boolean().optional(),
						minInterval: z.number().finite().nonnegative().optional(),
						duration: z.number().finite().nonnegative().optional(),
						maxVisible: z.number().int().min(1).max(3).optional(),
					})
					.optional(),
				timeline: timeline.optional(),
			})
			.optional(),
		height: z.number().positive().optional(),
		label: z.string().optional(),
		caption: z.string().optional(),
		controls: z.enum(["interactive", "observe"]).optional(),
		accent: z
			.enum(["neutral", "blue", "teal", "amber", "rose", "violet"])
			.optional(),
		dependencies: z.array(z.string()).optional(),
		portal: z.enum(["minimal", "wormhole", "pixel"]).optional(),
		kicker: z.string().optional(),
		voice: z.union([z.boolean(), z.string()]).optional(),
		audio: z.union([z.boolean(), z.string()]).optional(),
		steps: z
			.array(
				z.object({
					id: z.string().optional(),
					title: z.string().optional(),
					target: z.string().optional(),
					badge: z.string().optional(),
					instruction: z.string().optional(),
					prompt: z.string().optional(),
					voice: z.string().optional(),
					feedback: z.string().optional(),
					hint: z.string().optional(),
					audio: z.string().optional(),
					initialProps: props.optional(),
					tunables: tunables.optional(),
				}),
			)
			.optional(),
	})
	.passthrough();

export type ValidatedSimulationConfig = z.infer<typeof simulationConfigSchema>;
export interface SimulationConfigIssue {
	field: string;
	message: string;
}
export class SimulationConfigError extends Error {
	readonly code = "INVALID_SIMULATION_CONFIG";
	constructor(
		readonly source: string,
		readonly issues: SimulationConfigIssue[],
	) {
		super(
			`${source}\n${issues.map((issue) => `  ${issue.field}: ${issue.message}`).join("\n")}`,
		);
		this.name = "SimulationConfigError";
	}
}

export function validateSimulationConfig(
	value: unknown,
	source = "Simulation config",
): ValidatedSimulationConfig {
	const result = simulationConfigSchema.safeParse(value);
	if (!result.success)
		throw new SimulationConfigError(
			source,
			result.error.issues.map((issue) => ({
				field: issue.path.join(".") || "config",
				message: issue.message,
			})),
		);
	const config = result.data;
	if (config.timeline !== undefined) {
		config.measurements = config.measurements ?? {};
		if (config.measurements.timeline === undefined) {
			config.measurements.timeline = config.timeline;
		}
	}
	const issues: SimulationConfigIssue[] = [];
	for (const [key, item] of Object.entries(config.telemetry ?? {})) {
		const ids = new Set<string>();
		for (const [index, notification] of (item.notifications ?? []).entries()) {
			if (ids.has(notification.id))
				issues.push({
					field: `telemetry.${key}.notifications.${index}.id`,
					message: "Duplicate notification id",
				});
			ids.add(notification.id);
		}
	}
	for (const [key, item] of Object.entries(config.telemetry ?? {})) {
		const x = typeof item.graph === "object" ? item.graph.x?.key : undefined;
		if (x && x !== "time" && !Object.hasOwn(config.telemetry ?? {}, x))
			issues.push({
				field: `telemetry.${key}.graph.x.key`,
				message: "Unknown telemetry key",
			});
	}
	for (const [index, key] of (config.measurements?.visible ?? []).entries()) {
		if (!config.telemetry?.[key]?.scene)
			issues.push({
				field: `measurements.visible.${index}`,
				message: "Unknown telemetry key or missing scene",
			});
	}
	const graphKeys = new Set<string>();
	for (const [index, graph] of (config.measurements?.graphs ?? []).entries()) {
		if (graphKeys.has(graph.key))
			issues.push({
				field: `measurements.graphs.${index}.key`,
				message: "Duplicate graph key",
			});
		if (!config.telemetry?.[graph.key]?.graph)
			issues.push({
				field: `measurements.graphs.${index}.key`,
				message: "Unknown or graph-disabled telemetry key",
			});
		graphKeys.add(graph.key);
	}
	const check = (
		controls: ValidatedSimulationConfig["tunables"],
		defaults: Record<string, unknown>,
		prefix: string,
	) => {
		for (const [key, item] of Object.entries(controls ?? {})) {
			const field = `${prefix}.${key}`;
			const issue = (message: string) => issues.push({ field, message });
			if (!Object.hasOwn(defaults, key)) {
				issue(`Missing default in props.${key}`);
				continue;
			}
			const initial = defaults[key];
			const type =
				item.type ??
				(typeof initial === "boolean"
					? "boolean"
					: typeof initial === "number"
						? "range"
						: "text");
			if (
				item.min !== undefined &&
				item.max !== undefined &&
				item.min > item.max
			)
				issue("Minimum must not exceed maximum");
			if (type === "range" || type === "number") {
				if (typeof initial !== "number" || !Number.isFinite(initial)) {
					issue("Default must be a finite number");
					continue;
				}
				if (item.min !== undefined && initial < item.min)
					issue(`Default ${initial} is below minimum ${item.min}`);
				if (item.max !== undefined && initial > item.max)
					issue(`Default ${initial} exceeds maximum ${item.max}`);
			} else if (type === "boolean" && typeof initial !== "boolean")
				issue("Default must be a boolean");
			else if (type === "text" && typeof initial !== "string")
				issue("Default must be a string");
			else if (type === "select" || type === "segmented") {
				if (!item.options?.length)
					issue("Provide at least one choice in options");
				else if (!item.options.some((option) => option.value === initial))
					issue("Default must match an option value, including its type");
			}
		}
	};
	check(config.tunables, config.props ?? {}, "tunables");
	for (const [index, step] of (config.steps ?? []).entries())
		check(
			step.tunables,
			{ ...config.props, ...step.initialProps },
			`steps.${index}.tunables`,
		);
	for (const key of config.advancedControls ?? [])
		if (!config.tunables?.[key])
			issues.push({
				field: "advancedControls",
				message: `Unknown control ${key}`,
			});
	for (const [key, preset] of Object.entries(config.presets ?? {}))
		check(
			config.tunables &&
				Object.fromEntries(
					Object.entries(config.tunables).filter(([name]) =>
						Object.hasOwn(preset.props, name),
					),
				),
			{ ...config.props, ...preset.props },
			`presets.${key}.props`,
		);
	if (issues.length) throw new SimulationConfigError(source, issues);
	return config;
}

export function readSimulationConfig(
	source: string,
): ValidatedSimulationConfig {
	let value: unknown;
	try {
		value = JSON.parse(readFileSync(source, "utf8"));
	} catch (error) {
		throw new SimulationConfigError(source, [
			{
				field: "config",
				message: error instanceof Error ? error.message : String(error),
			},
		]);
	}
	return validateSimulationConfig(value, source);
}

export const simulationConfigJsonSchema = z.toJSONSchema(
	simulationConfigSchema,
);
