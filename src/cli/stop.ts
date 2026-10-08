import * as fs from "node:fs";
import * as path from "node:path";
import { logger } from "./logger.js";
import { getOriginalCwd } from "./utils.js";

export async function runStop(args: string[]) {
	const target = args[0] || ".";
	const targetPath = path.resolve(getOriginalCwd(), target);
	let contentBase = targetPath;

	if (fs.existsSync(targetPath) && !fs.statSync(targetPath).isDirectory()) {
		contentBase = path.dirname(targetPath);
	}

	const outDir = path.resolve(contentBase, "out");
	const pidFile = path.resolve(outDir, ".dev.pid");

	if (!fs.existsSync(pidFile)) {
		logger.warn(
			`No background dev server found for: ${path.relative(process.cwd(), targetPath) || "."}`,
		);
		return;
	}

	try {
		const raw = fs.readFileSync(pidFile, "utf-8");
		const data = JSON.parse(raw);
		const pid = Number(data.pid);

		let isRunning = false;
		try {
			process.kill(pid, 0);
			isRunning = true;
		} catch {
			isRunning = false;
		}

		if (isRunning) {
			process.kill(pid, "SIGINT");
			let attempts = 0;
			while (attempts < 20) {
				await new Promise((r) => setTimeout(r, 100));
				try {
					process.kill(pid, 0);
					attempts++;
				} catch {
					break;
				}
			}
			logger.success(
				`Stopped dev server (PID ${pid}${data.port ? ` on port ${data.port}` : ""}).`,
			);
		} else {
			logger.info(`Dev server (PID ${pid}) was already stopped.`);
		}
	} catch (err: unknown) {
		logger.error(
			`Failed to stop dev server: ${err instanceof Error ? err.message : String(err)}`,
		);
	} finally {
		if (fs.existsSync(pidFile)) {
			try {
				fs.unlinkSync(pidFile);
			} catch {}
		}
	}
}
