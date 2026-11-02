import boxen from "boxen";
import clipboardy from "clipboardy";
import { createConsola } from "consola";
import ora from "ora";
import pc from "picocolors";

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
	httpReq: (ip: string, method: string, path: string) => {
		const date = new Date().toLocaleString("en-US");
		safeLog(
			`${pc.bgCyan(pc.black(pc.bold(" HTTP ")))} ${pc.gray(date)} ${pc.yellow(ip)} ${pc.greenBright(method)} ${pc.greenBright(path)}`,
		);
	},
	httpRes: (ip: string, status: number, ms: number) => {
		const date = new Date().toLocaleString("en-US");
		safeLog(
			`${pc.bgCyan(pc.black(pc.bold(" HTTP ")))} ${pc.gray(date)} ${pc.yellow(ip)} ${pc.greenBright(`Returned ${status} in ${ms} ms`)}`,
		);
	},
	serveBox: (
		localUrl: string,
		networkUrl: string | null,
		basePort?: number,
		currentPort?: number,
	) => {
		let text = `${pc.greenBright("Serving!")}\n\n`;
		text += `- ${pc.bold("Local:")}    ${localUrl}\n`;
		if (networkUrl) {
			text += `- ${pc.bold("Network:")}  ${networkUrl}\n`;
		}

		if (basePort && currentPort && basePort !== currentPort) {
			text += `\n${pc.red(`This port was picked because ${pc.underline(basePort.toString())} is in use.`)}\n`;
		}

		text += `\nCopied local address to clipboard!`;

		try {
			clipboardy.writeSync(localUrl);
		} catch (err: unknown) {
			logger.warn(
				`Failed to copy address to clipboard (may be headless environment): ${err instanceof Error ? err.message : String(err)}`,
			);
		}

		safeLog(boxen(text, { padding: 1, margin: 1, borderColor: "green" }));
	},
};
