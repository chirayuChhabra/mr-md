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
const telemetry = z.record(
	z.string(),
	z.object({
		label: z.string().optional(),
		unit: z.string().optional(),
		precision: z.number().int().min(0).max(20).optional(),
		group: z.string().optional(),
		description: z.string().optional(),
		display: z.enum(["metric", "status", "row"]).optional(),
	}),
);

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
	const issues: SimulationConfigIssue[] = [];
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
