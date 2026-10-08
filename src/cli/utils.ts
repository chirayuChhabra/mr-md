import { spawn } from "node:child_process";

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

/**
 * Opens a URL in the user's default web browser cross-platform.
 */
export function openBrowser(url: string): void {
	const platform = process.platform;
	try {
		if (platform === "darwin") {
			spawn("open", [url], { stdio: "ignore", detached: true }).unref();
		} else if (platform === "win32") {
			spawn("cmd", ["/c", "start", "", url], {
				stdio: "ignore",
				detached: true,
			}).unref();
		} else {
			spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
		}
	} catch {
		// Ignore errors if running in headless or unsupported environment
	}
}
