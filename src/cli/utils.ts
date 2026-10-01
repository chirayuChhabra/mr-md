/**
 * Resolves the original current working directory when the CLI is executed.
 *
 * When running CLIs via package managers (like `npm run`, `yarn run`, or `bun run`),
 * the process.cwd() is automatically overridden to point to the directory containing
 * the package.json file, rather than the directory where the user actually typed the command.
 *
 * To support execution via package manager scripts, we check for injected environment variables:
 * - `INIT_CWD`: Set by npm, yarn, and pnpm.
 * - `npm_config_local_prefix`: Set by bun.
 * - Fallback to standard `process.cwd()` for direct execution (e.g. `npx`, global installs).
 *
 * @returns The original working directory path.
 */
export function getOriginalCwd(): string {
	return (
		process.env.INIT_CWD || process.env.npm_config_local_prefix || process.cwd()
	);
}

export interface CliOptions {
	target?: string;
	port?: number;
	theme?: "light" | "dark" | "auto";
	palette?: string;
	noStudio?: boolean;
	outDir?: string;
	out?: string;
}

export function parseCliArgs(args: string[]): CliOptions {
	const options: CliOptions = {};
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "-p" || arg === "--port") {
			const val = args[++i];
			if (val) options.port = parseInt(val, 10);
		} else if (arg === "--theme") {
			const val = args[++i];
			if (val === "light" || val === "dark" || val === "auto") {
				options.theme = val;
			}
		} else if (arg === "--palette") {
			const val = args[++i];
			if (val) options.palette = val;
		} else if (arg === "--no-studio") {
			options.noStudio = true;
		} else if (arg === "-o" || arg === "--out") {
			const val = args[++i];
			if (val) {
				options.outDir = val;
				options.out = val;
			}
		} else if (!arg.startsWith("-") && !options.target) {
			options.target = arg;
		}
	}
	return options;
}
