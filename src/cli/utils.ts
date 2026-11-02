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
