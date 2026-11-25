import {
	type BlogKitSettings,
	blogKitSettingsSchema,
	MrmdConfigError,
	resolveSettings,
} from "../config.js";
import type { BuildOptions } from "../types.js";

export function presentationOptions(
	options: BuildOptions,
	override?: BlogKitSettings,
): BuildOptions {
	const settings = resolveSettings(options.presentation ?? {}, override);
	const result = blogKitSettingsSchema.safeParse(settings);
	if (!result.success)
		throw new MrmdConfigError(
			result.error.issues.map((issue) => ({
				path: issue.path.join("."),
				message: issue.message,
			})),
		);
	return {
		...options,
		presentation: settings,
		theme: settings.theme?.mode ?? options.theme,
		palette: settings.theme?.palette ?? options.palette,
		ui: settings.ui ?? options.ui,
		font: settings.theme?.font ?? options.font,
		preset: {
			...options.preset,
			density: settings.density ?? options.preset?.density,
			tone: settings.tone ?? options.preset?.tone,
		},
	};
}
