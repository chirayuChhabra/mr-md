#!/usr/bin/env bun

import pkg from "../package.json" with { type: "json" };
import { logger } from "./cli/logger.js";

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === "--help" || command === "-h") {
	logger.info(
		"Usage: mr-md <command> [args]\nCommands:\n  build      Build all chapters or a specific file\n  dev        Start local dev server\n  generate   Generate a new markdown file (alias: g)",
	);
	process.exit(command ? 0 : 1);
}

if (command === "--version" || command === "-v") {
	logger.info(`mr-md v${pkg.version}`);
	process.exit(0);
}

switch (command) {
	case "dev":
		import("./cli/dev.js")
			.then((m) => m.runDev(args.slice(1)))
			.catch((e) => {
				logger.error(e instanceof Error ? e.message : String(e));
				process.exit(1);
			});
		break;
	case "build":
		import("./cli/build.js")
			.then((m) => m.runBuild(args.slice(1)))
			.catch((e) => {
				logger.error(e instanceof Error ? e.message : String(e));
				process.exit(1);
			});
		break;
	case "g":
	case "generate":
		import("./cli/generate.js")
			.then((m) => m.runGenerate(args.slice(1)))
			.catch((e) => {
				logger.error(e instanceof Error ? e.message : String(e));
				process.exit(1);
			});
		break;
	default:
		logger.error(`Unknown command: ${command}`);
		process.exit(1);
}
