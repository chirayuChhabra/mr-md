import { createRequire } from "module";

const require = createRequire(import.meta.url);

import { spawn } from "node:child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as readline from "readline";
import { logger } from "./logger.js";
import { getOriginalCwd, openBrowser } from "./utils.js";

interface BunServer {
	port: number;
	stop: () => void;
	publish: (topic: string, data: string) => void;
	requestIP: (req: Request) => { address: string } | null;
	upgrade: (req: Request) => boolean;
}

declare const Bun: {
	serve: (options: unknown) => BunServer;
	file: (path: string) => Blob & { text: () => Promise<string> };
};
const STATIC_ASSET_REGEX =
	/\.(css|js|mjs|map|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot)$/i;

export async function runDev(args: string[]) {
	const { initHighlighter } = require("../renderer/markdown/math.js");
	await initHighlighter();
	process.env.NODE_ENV = "development";
	const isVerbose = args.includes("--verbose") || args.includes("-v");
	const shouldOpen = args.includes("--open");
	const isDetached = args.includes("-d") || args.includes("--detach");
	const isDetachedWorker = process.env.__MR_MD_DETACHED_WORKER === "1";
	const target = args.find((arg) => !arg.startsWith("-"));

	if (!target) {
		logger.error("Usage: mr-md dev <file-or-directory>");
		process.exit(1);
	}

	let isDirectory = false;
	let filePath = "";
	const targetPath = path.resolve(getOriginalCwd(), target);
	if (!fs.existsSync(targetPath)) {
		logger.error(`File or directory not found: ${target}`);
		process.exit(1);
	}

	if (fs.statSync(targetPath).isDirectory()) {
		isDirectory = true;
		try {
			const { generateChapterContent } = require("./chapter.js");
			generateChapterContent(targetPath);
		} catch (err: unknown) {
			logger.error(err instanceof Error ? err.message : String(err));
			process.exit(1);
		}
	} else {
		filePath = targetPath;
		if (!filePath.endsWith(".md")) {
			logger.error(`Not a markdown file: ${target}`);
			process.exit(1);
		}
	}

	const contentBase = isDirectory ? targetPath : path.dirname(filePath);
	const outDir = path.resolve(contentBase, "out");
	const pidFile = path.resolve(outDir, ".dev.pid");

	if (isDetached && !isDetachedWorker) {
		if (fs.existsSync(pidFile)) {
			try {
				const data = JSON.parse(fs.readFileSync(pidFile, "utf-8"));
				const pid = Number(data.pid);
				let alive = false;
				try {
					process.kill(pid, 0);
					alive = true;
				} catch {}
				if (alive) {
					logger.warn(
						`Dev server is already running in background (PID ${pid}${data.localUrl ? ` at ${data.localUrl}` : ""}).`,
					);
					logger.info(`Run 'mr-md stop ${target}' to stop it.`);
					process.exit(0);
				}
			} catch {}
			try {
				fs.unlinkSync(pidFile);
			} catch {}
		}

		if (!fs.existsSync(outDir)) {
			fs.mkdirSync(outDir, { recursive: true });
		}

		const workerArgs = process.argv
			.slice(1)
			.filter((a) => a !== "-d" && a !== "--detach");

		const worker = spawn(process.execPath, workerArgs, {
			detached: true,
			cwd: process.cwd(),
			env: { ...process.env, __MR_MD_DETACHED_WORKER: "1" },
			stdio: ["ignore", "pipe", "ignore"],
		});

		let stdoutBuffer = "";
		worker.stdout?.on("data", (chunk: Buffer) => {
			stdoutBuffer += chunk.toString();
			if (stdoutBuffer.includes("\n")) {
				try {
					const line = stdoutBuffer.trim().split("\n")[0];
					const info = JSON.parse(line);
					if (info.ready) {
						const logFileRel =
							path.relative(process.cwd(), path.resolve(outDir, "dev.log")) ||
							"out/dev.log";
						logger.serveBox(
							info.localUrl,
							info.networkUrl,
							info.basePort,
							info.port,
							false,
						);
						logger.info(`Logs: tail -f ${logFileRel}`);

						worker.unref();
						worker.stdout?.destroy();
						process.exit(0);
					}
				} catch {}
			}
		});

		worker.on("error", (err) => {
			logger.error(`Failed to start detached dev server: ${err.message}`);
			process.exit(1);
		});

		worker.on("exit", (code) => {
			if (code !== 0 && code !== null) {
				logger.error(
					`Detached dev server exited unexpectedly with code ${code}.`,
				);
				process.exit(code);
			}
		});

		setTimeout(() => {
			logger.error("Timed out waiting for background dev server to start.");
			process.exit(1);
		}, 15000).unref();

		return;
	}

	if (isDetachedWorker) {
		if (!fs.existsSync(outDir)) {
			fs.mkdirSync(outDir, { recursive: true });
		}
		const logPath = path.resolve(outDir, "dev.log");
		const logStream = fs.createWriteStream(logPath, { flags: "w" });
		const writeLog = (...msgs: unknown[]) => {
			const text = msgs
				.map((m) => (typeof m === "string" ? m : JSON.stringify(m)))
				.join(" ");
			logStream.write(`${text}\n`);
		};
		console.log = writeLog;
		console.error = writeLog;
	}

	const displayPath =
		path.relative(process.cwd(), targetPath) || path.basename(targetPath);
	logger.dev(`Preparing dev server for: ${displayPath}`);

	let server: BunServer | undefined;
	let singleFileSlug = "";
	let previousFileSlug = "";

	const rebuild = async () => {
		logger.startSpinner("Rebuilding...");
		try {
			const {
				parseChapter,
				parseLesson,
				buildChapter,
				buildLesson,
			} = require("../parser/mdx.js");
			const {
				preloadLanguagesFromMarkdown,
			} = require("../renderer/markdown/index.js");

			if (isDirectory) {
				const { generateChapterContent } = require("./chapter.js");
				const chapterContent = generateChapterContent(targetPath);
				await preloadLanguagesFromMarkdown(chapterContent);
				const chapter = parseChapter(
					chapterContent,
					{ outDir, contentBase },
					contentBase,
				);
				buildChapter(chapter, { outDir, contentBase });
			} else {
				const content = fs.readFileSync(filePath, "utf-8");
				await preloadLanguagesFromMarkdown(content);
				const parsed = require("@11ty/gray-matter")(content);
				const isChapter =
					parsed.data.chapter === true || parsed.data.type === "chapter";

				if (isChapter) {
					const chapter = parseChapter(
						content,
						{ outDir, contentBase },
						contentBase,
					);
					buildChapter(chapter, { outDir, contentBase });
				} else {
					const lesson = parseLesson(
						content,
						{ outDir, contentBase },
						contentBase,
						undefined,
						path.basename(filePath),
					);
					const newSlug = lesson.meta.slug;
					if (previousFileSlug && previousFileSlug !== newSlug) {
						const staleFile = path.join(outDir, `${previousFileSlug}.html`);
						if (fs.existsSync(staleFile)) fs.unlinkSync(staleFile);
					}
					singleFileSlug = newSlug;
					buildLesson(lesson, { outDir, contentBase });
				}
			}
			logger.succeedSpinner(
				`Build successful for ${path.relative(process.cwd(), targetPath) || path.basename(targetPath)}.`,
			);
			if (previousFileSlug && previousFileSlug !== singleFileSlug) {
				server?.publish("livereload", `redirect:/${singleFileSlug}.html`);
			} else {
				server?.publish("livereload", "reload");
			}
			previousFileSlug = singleFileSlug;
		} catch (err: unknown) {
			logger.failSpinner(`Build failed`);
			const msg = err instanceof Error ? err.message : String(err);
			logger.error(msg);
			server?.publish("livereload", `error:${msg}`);
		}
	};

	await rebuild();

	let timeout: NodeJS.Timeout;
	const watcher = fs.watch(
		contentBase,
		{ recursive: true },
		(_eventType, filename) => {
			if (
				!filename ||
				!/\.(md|mdx|js|ts|jsx|tsx|json|css|png|jpg|jpeg|gif|svg|webp|ico)$/i.test(
					filename,
				)
			) {
				return;
			}

			clearTimeout(timeout);
			timeout = setTimeout(() => {
				logger.watch(`File changed: ${filename}`);
				rebuild();
			}, 200);
		},
	);
	logger.watch(
		`Watching ${path.relative(process.cwd(), contentBase) || path.basename(contentBase)} for changes...`,
	);

	const basePort = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
	let port = basePort;
	const maxPort = basePort + 10;

	const fetchHandler = async (req: Request, srv: BunServer) => {
		const start = Date.now();
		const clientIp = srv.requestIP(req)?.address || "::1";
		const url = new URL(req.url);
		const method = req.method;
		const decodedPath = decodeURIComponent(url.pathname);

		const isUpgrade = srv.upgrade(req);

		const handle = async () => {
			if (isUpgrade) return null;

			if (
				!isDirectory &&
				(decodedPath === "/" || decodedPath === "/index.html") &&
				singleFileSlug
			) {
				return new Response(null, {
					status: 302,
					headers: { Location: `/${singleFileSlug}.html` },
				});
			}

			let outFilePath = path.resolve(outDir, `.${decodedPath}`);

			if (decodedPath.endsWith("/")) {
				outFilePath = path.join(outDir, "index.html");
			} else if (
				!fs.existsSync(outFilePath) &&
				fs.existsSync(`${outFilePath}.html`)
			) {
				outFilePath += ".html";
			}

			const normalizedOutDir = outDir.endsWith(path.sep)
				? outDir
				: outDir + path.sep;
			if (!outFilePath.startsWith(normalizedOutDir) && outFilePath !== outDir) {
				return new Response("Forbidden", { status: 403 });
			}

			if (fs.existsSync(outFilePath) && fs.statSync(outFilePath).isFile()) {
				if (outFilePath.endsWith(".html")) {
					const file = Bun.file(outFilePath);
					let text = await file.text();

					const script = `<script>
						const ws = new WebSocket(\`ws://\${location.host}/\`);
						ws.onmessage = async (e) => { 
							if (typeof e.data === "string" && e.data.startsWith("redirect:")) {
								window.location.href = e.data.slice(9);
							} else if (e.data === "reload") {
								try {
									const res = await fetch(location.href);
									const text = await res.text();
									const parser = new DOMParser();
									const doc = parser.parseFromString(text, "text/html");

									const newMain = doc.querySelector(".bk-main");
									const newNav = doc.querySelector(".bk-nav");
									const newHeader = doc.querySelector(".bk-sidebar-header");

									if (newMain && newNav && newHeader) {
										const mainEl = document.querySelector(".bk-main");
										const navEl = document.querySelector(".bk-nav");
										
										const mainScroll = mainEl ? mainEl.scrollTop : 0;
										const navScroll = navEl ? navEl.scrollTop : 0;
										const winScrollY = window.scrollY;
										const winScrollX = window.scrollX;
										
										if (mainEl) mainEl.innerHTML = newMain.innerHTML;
										if (navEl) navEl.innerHTML = newNav.innerHTML;
										
										const headerEl = document.querySelector(".bk-sidebar-header");
										if (headerEl) headerEl.innerHTML = newHeader.innerHTML;
										
										document.title = doc.title;

										if (mainEl) mainEl.scrollTop = mainScroll;
										if (navEl) navEl.scrollTop = navScroll;
										window.scrollTo(winScrollX, winScrollY);

										const existingStyles = Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'));
										const newStyles = Array.from(doc.head.querySelectorAll('link[rel="stylesheet"], style'));
										
										newStyles.forEach(s => {
											if (s.tagName === 'LINK') {
												const href = new URL(s.href, location.href);
												if (href.origin === location.origin) {
													href.searchParams.set('t', Date.now());
													s.href = href.toString();
												}
											}
											document.head.appendChild(s);
										});

										setTimeout(() => {
											existingStyles.forEach(s => s.remove());
										}, 50);

										const overlay = document.getElementById("bk-dev-error");
										if (overlay) overlay.remove();

										window.dispatchEvent(new Event("bk-page-loaded"));
									} else {
										location.reload();
									}
								} catch (err) {
									console.error("Live reload failed:", err);
									location.reload();
								}
							} else if (e.data.startsWith("error:")) {
								const msg = e.data.slice(6);
								console.error("Build Error:", msg);
								let overlay = document.getElementById("bk-dev-error");
								if (!overlay) {
									overlay = document.createElement("div");
									overlay.id = "bk-dev-error";
									overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);color:#ff5555;padding:2rem;z-index:99999;font-family:monospace;white-space:pre-wrap;overflow:auto;backdrop-filter:blur(4px);";
									document.body.appendChild(overlay);
								}
								overlay.textContent = "Build Error\\n\\n" + msg;
							}
						};
					</script>`;

					const lastBodyIndex = text.toLowerCase().lastIndexOf("</body>");
					if (lastBodyIndex !== -1) {
						text =
							text.slice(0, lastBodyIndex) + script + text.slice(lastBodyIndex);
					} else {
						text += script;
					}
					return new Response(text, {
						headers: { "Content-Type": "text/html" },
					});
				}
				return new Response(Bun.file(outFilePath));
			}

			return new Response("Not found", { status: 404 });
		};

		const res = await handle();
		if (res) {
			const isStaticAsset = STATIC_ASSET_REGEX.test(decodedPath);
			if (isVerbose || res.status >= 400 || !isStaticAsset) {
				logger.http(
					clientIp,
					method,
					decodedPath,
					res.status,
					Date.now() - start,
				);
			}
			return res;
		}
	};

	const wsHandler = {
		message() {},
		open(ws: { subscribe: (topic: string) => void }) {
			ws.subscribe("livereload");
		},
	};

	const interfaces = os.networkInterfaces();
	let networkHost: string | null = null;
	for (const name of Object.keys(interfaces)) {
		for (const iface of interfaces[name] || []) {
			if (iface.family === "IPv4" && !iface.internal) {
				networkHost = iface.address;
				break;
			}
		}
		if (networkHost) break;
	}

	const getUrlSuffix = () =>
		!isDirectory && singleFileSlug ? `/${singleFileSlug}.html` : "";
	const getLocalUrl = () =>
		`http://localhost:${server?.port ?? port}${getUrlSuffix()}`;
	const getNetworkUrl = () =>
		networkHost
			? `http://${networkHost}:${server?.port ?? port}${getUrlSuffix()}`
			: null;

	let shuttingDown = false;
	const shutdown = () => {
		if (shuttingDown) return; // Ignore any extra Ctrl+C or duplicate signals
		shuttingDown = true;

		if (fs.existsSync(pidFile)) {
			try {
				fs.unlinkSync(pidFile);
			} catch {}
		}

		if (process.stdin.isTTY) {
			try {
				process.stdin.setRawMode(false);
				process.stdin.pause();
			} catch {}
		}

		console.log(); // Add a newline so it doesn't print on the same line as ^C
		logger.info("Gracefully shutting down. Please wait...");

		process.once("exit", (code) => {
			if (code === 0) {
				if (server) {
					logger.info(`Shutdown complete. Port ${server.port} is now free.`);
				} else {
					logger.info("Shutdown complete.");
				}
			}
		});

		if (server) {
			server.stop();
		}
		watcher.close();
		clearTimeout(timeout);
		setTimeout(() => process.exit(0), 3000).unref();
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);

	while (port <= maxPort) {
		try {
			server = Bun.serve({
				port,
				fetch: fetchHandler,
				websocket: wsHandler,
			});

			if (isDetachedWorker) {
				fs.writeFileSync(
					pidFile,
					JSON.stringify({
						pid: process.pid,
						port: server.port,
						localUrl: getLocalUrl(),
						targetPath,
						startedAt: Date.now(),
					}),
				);
				process.stdout.write(
					`${JSON.stringify({
						ready: true,
						port: server.port,
						localUrl: getLocalUrl(),
						networkUrl: getNetworkUrl(),
						basePort,
					})}\n`,
				);
			} else {
				logger.serveBox(getLocalUrl(), getNetworkUrl(), basePort, port);
			}

			if (shouldOpen) {
				openBrowser(getLocalUrl());
			}

			if (process.stdin.isTTY && !isDetachedWorker) {
				readline.emitKeypressEvents(process.stdin);
				process.stdin.setRawMode(true);
				process.stdin.resume();

				process.stdin.on("keypress", (_str, key: readline.Key) => {
					if (key.ctrl && (key.name === "c" || key.name === "d")) {
						shutdown();
						return;
					}

					switch (key.name) {
						case "u":
							logger.serveBox(
								getLocalUrl(),
								getNetworkUrl(),
								basePort,
								server?.port ?? port,
							);
							break;
						case "o":
							logger.info(`Opening ${getLocalUrl()} in browser...`);
							openBrowser(getLocalUrl());
							break;
						case "c":
							console.clear();
							logger.serveBox(
								getLocalUrl(),
								getNetworkUrl(),
								basePort,
								server?.port ?? port,
							);
							break;

						case "q":
							shutdown();
							break;
						case "h":
							logger.info(
								"Dev shortcuts: [u] Show URL  [o] Open browser  [c] Clear console  [q] Quit",
							);
							break;
					}
				});
			}

			break;
		} catch (err: unknown) {
			if (
				err instanceof Error &&
				(err as Error & { code?: string }).code === "EADDRINUSE"
			) {
				logger.warn(`Port ${port} is in use, trying ${port + 1}...`);
				port++;
			} else {
				throw err;
			}
		}
	}

	if (!server) {
		logger.error(
			`Could not find an open port between ${basePort} and ${maxPort}.`,
		);
		process.exit(1);
	}
}
