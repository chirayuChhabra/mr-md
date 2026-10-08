import boxen from "boxen";
import { createConsola } from "consola";
import ora from "ora";
import pc from "picocolors";
import { writeText } from "tinyclip";

export const consola = createConsola({
	level: 4,
	fancy: true,
	formatOptions: {
		colors: true,
		compact: false,
	},
});

let currentSpinner: ReturnType<typeof ora> | null = null;

const safeLog = (msg: string) => {
	if (currentSpinner) {
		const spinnerOpts = { text: currentSpinner.text };
		currentSpinner.stop();
		console.log(msg);
		currentSpinner = ora({
			prefixText: badge("BUILD", pc.bgBlue),
			text: spinnerOpts.text,
			color: "cyan",
		}).start();
	} else {
		console.log(msg);
	}
};

const badge = (text: string, bgColor: (s: string) => string) =>
	bgColor(pc.black(pc.bold(` ${text} `)));

export const logger = {
	info: (msg: string) => safeLog(`${badge("INFO", pc.bgBlue)} ${msg}`),
	success: (msg: string) => safeLog(`${badge("BUILD", pc.bgGreen)} ${msg}`),
	warn: (msg: string) => safeLog(`${badge("WARN", pc.bgYellow)} ${msg}`),
	error: (msg: string, err?: unknown) => {
		if (currentSpinner) {
			currentSpinner.fail(`${badge("BUILD", pc.bgRed)} Process failed.`);
			currentSpinner = null;
		}
		safeLog(`${badge("ERROR", pc.bgRed)} ${msg}`);
		if (err) console.error(err);
	},
	log: (msg: string) => safeLog(msg),
	dev: (msg: string) => safeLog(`${badge("DEV", pc.bgMagenta)} ${msg}`),
	watch: (msg: string) => safeLog(`${badge("WATCH", pc.bgYellow)} ${msg}`),
	startSpinner: (msg: string) => {
		if (currentSpinner) currentSpinner.stop();
		currentSpinner = ora({
			prefixText: badge("BUILD", pc.bgBlue),
			text: msg,
			color: "cyan",
		}).start();
	},
	succeedSpinner: (msg: string) => {
		if (currentSpinner) {
			currentSpinner.stop();
			currentSpinner = null;
		}
		safeLog(`${badge("BUILD", pc.bgGreen)} ${pc.green(msg)}`);
	},
	failSpinner: (msg: string) => {
		if (currentSpinner) {
			currentSpinner.stop();
			currentSpinner = null;
		}
		safeLog(`${badge("BUILD", pc.bgRed)} ${pc.red(msg)}`);
	},
	box: (msg: string) => consola.box(msg),
	http: (
		_ip: string,
		method: string,
		path: string,
		status: number,
		ms: number,
	) => {
		const time = new Date().toLocaleTimeString("en-US", { hour12: false });
		const colorStatus =
			status >= 400
				? pc.red(status)
				: status >= 300
					? pc.yellow(status)
					: pc.green(status);
		safeLog(
			`${pc.bgCyan(pc.black(pc.bold(" HTTP ")))} ${pc.gray(time)} ${pc.greenBright(method)} ${pc.cyan(path)} → ${colorStatus} ${pc.gray(`(${ms}ms)`)}`,
		);
	},
	serveBox: (
		localUrl: string,
		networkUrl: string | null,
		basePort?: number,
		currentPort?: number,
		shortcuts = true,
	) => {
		// biome-ignore lint/suspicious/noControlCharactersInRegex: needed to strip ANSI escape codes for column alignment
		const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, "");
		const pad = (str: string, width: number) =>
			str + " ".repeat(Math.max(0, width - stripAnsi(str).length));

		const col1Line1 = `${pc.bold("Local:")}    ${pc.cyan(localUrl)}`;
		const col1Line2 = networkUrl
			? `${pc.bold("Network:")}  ${pc.cyan(networkUrl)}`
			: "";
		const col1Line3 = `${pc.green("✔")} ${pc.gray("Copied local address to clipboard!")}`;

		let text = "";

		if (shortcuts) {
			const col2Line1 = `${pc.bold("u")} ${pc.gray("url")}    ${pc.bold("o")} ${pc.gray("open")}`;
			const col2Line2 = `${pc.bold("c")} ${pc.gray("clear")}  ${pc.bold("q")} ${pc.gray("quit")}`;

			const colWidth = Math.max(
				33,
				stripAnsi(col1Line1).length + 2,
				stripAnsi(col1Line2).length + 2,
			);
			const sep = pc.gray("  │  ");

			text += `${pad(col1Line1, colWidth)}${sep}${col2Line1}\n`;
			text += `${pad(col1Line2, colWidth)}${sep}${col2Line2}\n`;
			text += `${col1Line3}`;
		} else {
			text += `${col1Line1}\n`;
			if (col1Line2) text += `${col1Line2}\n`;
			text += `${col1Line3}`;
		}

		if (basePort && currentPort && basePort !== currentPort) {
			text += `\n${pc.red(`Port ${basePort} was in use, switched to ${currentPort}`)}`;
		}

		writeText(localUrl).catch((err: unknown) => {
			logger.warn(
				`Failed to copy address to clipboard (may be headless environment): ${err instanceof Error ? err.message : String(err)}`,
			);
		});

		safeLog(
			boxen(text, {
				padding: { top: 0, bottom: 0, left: 1, right: 1 },
				margin: { top: 1, bottom: 1 },
				borderColor: "green",
			}),
		);
	},
};
