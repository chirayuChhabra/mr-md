// @ts-nocheck
import DOMPurify from "isomorphic-dompurify";
import { bkThemeColors } from "./theme.js";

const DOMPURIFY_CONFIG = {
	USE_PROFILES: { mathMl: true, html: true },
	ADD_ATTR: ["aria-hidden", "style"],
};

function safeHtml(raw: string): string {
	if (!raw) return "";
	return DOMPurify.sanitize(raw, DOMPURIFY_CONFIG);
}

let audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
	if (!audioCtx && typeof window !== "undefined") {
		const AudioContextClass =
			window.AudioContext ||
			(window as unknown as { webkitAudioContext: typeof AudioContext })
				.webkitAudioContext;
		if (AudioContextClass) audioCtx = new AudioContextClass();
	}
	if (audioCtx && audioCtx.state === "suspended") {
		audioCtx.resume().catch(() => {});
	}
	return audioCtx;
}

function playSuccessChime(isFanfare = false) {
	try {
		const ctx = getAudioContext();
		if (!ctx) return;
		const now = ctx.currentTime;
		const notes = isFanfare
			? [523.25, 659.25, 783.99, 1046.5, 1318.51] // C5, E5, G5, C6, E6
			: [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
		notes.forEach((freq, i) => {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = "sine";
			osc.frequency.setValueAtTime(freq, now + i * 0.07);
			gain.gain.setValueAtTime(0.12, now + i * 0.07);
			gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.07 + 0.35);
			osc.connect(gain);
			gain.connect(ctx.destination);
			osc.start(now + i * 0.07);
			osc.stop(now + i * 0.07 + 0.35);
		});
	} catch {
		// AudioContext may be blocked before user interaction
	}
}

// ─── Browser Speech Synthesis ───
let currentUtterance: SpeechSynthesisUtterance | null = null;
let speechDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function cleanTextForSpeech(raw: string): string {
	if (!raw) return "";
	return raw
		.replace(/<[^>]+>/g, " ") // strip HTML tags
		.replace(/\$\$[\s\S]*?\$\$/g, " ") // strip display math formulas
		.replace(/\$[^$]+\$/g, " ") // strip inline math formulas
		.replace(/[*_#`~[\]()]/g, " ") // strip markdown punctuation
		.replace(/\s+/g, " ")
		.trim();
}

function speakText(text: string, state?: StepsState | null) {
	if (
		state?.isVoiceMuted ||
		typeof window === "undefined" ||
		!("speechSynthesis" in window)
	)
		return;
	try {
		stopSpeech();
		const clean = cleanTextForSpeech(text);
		if (!clean) return;

		if (window.speechSynthesis.paused) {
			window.speechSynthesis.resume();
		}

		const utterance = new SpeechSynthesisUtterance(clean);
		currentUtterance = utterance; // Prevent garbage collection bug in Chromium
		utterance.rate = 0.96;
		utterance.pitch = 1.0;

		const applyVoice = () => {
			const voices = window.speechSynthesis.getVoices();
			if (voices.length > 0) {
				const preferredVoice = voices.find(
					(v) =>
						v.lang.startsWith("en") &&
						(v.name.includes("Samantha") ||
							v.name.includes("Google") ||
							v.name.includes("Natural") ||
							v.name.includes("Daniel") ||
							v.name.includes("Alex") ||
							v.name.includes("Victoria") ||
							v.name.includes("Karen")),
				);
				if (preferredVoice) {
					utterance.voice = preferredVoice;
				}
			}
		};

		applyVoice();
		if (window.speechSynthesis.getVoices().length === 0) {
			window.speechSynthesis.onvoiceschanged = () => {
				applyVoice();
			};
		}

		utterance.onend = () => {
			if (currentUtterance === utterance) {
				currentUtterance = null;
			}
		};
		utterance.onerror = () => {
			if (currentUtterance === utterance) {
				currentUtterance = null;
			}
		};

		if (speechDebounceTimer) clearTimeout(speechDebounceTimer);
		speechDebounceTimer = setTimeout(() => {
			if (state?.isVoiceMuted) return;
			try {
				window.speechSynthesis.speak(utterance);
				if (window.speechSynthesis.paused) {
					window.speechSynthesis.resume();
				}
			} catch {}
		}, 15);
	} catch {
		// Speech synthesis blocked or unavailable
	}
}

function stopSpeech() {
	if (speechDebounceTimer) {
		clearTimeout(speechDebounceTimer);
		speechDebounceTimer = null;
	}
	currentUtterance = null;
	if (typeof window !== "undefined" && "speechSynthesis" in window) {
		try {
			window.speechSynthesis.cancel();
		} catch {}
	}
}

function formatMessage(raw: string): string {
	if (!raw) return "";
	const escaped = raw
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
	let formatted = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
	formatted = formatted.replace(/`([^`]+)`/g, "<code>$1</code>");
	const win =
		typeof window !== "undefined"
			? (window as unknown as {
					katex?: {
						renderToString(s: string, o?: Record<string, unknown>): string;
					};
				})
			: null;
	if (win?.katex) {
		formatted = formatted.replace(/\$([^$]+)\$/g, (_: string, math: string) => {
			try {
				return (
					win.katex?.renderToString(math, { throwOnError: false }) ??
					`<em>${math}</em>`
				);
			} catch {
				return `<span style="font-family:serif;font-style:italic;">${math}</span>`;
			}
		});
	} else {
		formatted = formatted.replace(
			/\$([^$]+)\$/g,
			'<span style="font-family:serif;font-style:italic;">$1</span>',
		);
	}
	return safeHtml(formatted);
}

interface StepsState {
	currentIndex: number;
	steps: Array<{
		id: string;
		title: string;
		targetHtml?: string;
		instructionHtml?: string;
		promptHtml?: string;
		voice?: string;
		feedback?: string;
		feedbackHtml?: string;
		hint?: string;
		hintHtml?: string;
		audio?: string;
		initialProps?: Record<string, unknown>;
	}>;
	solved: boolean[];
	isPlaying: boolean;
	isVoiceMuted: boolean;
	hasActivated: boolean;
	audioEl?: HTMLAudioElement | null;
}

const stepsMap = new WeakMap<HTMLElement, StepsState>();
let lastActiveSteps: HTMLElement | null = null;

function getStepsState(card: HTMLElement): StepsState | null {
	const existing = stepsMap.get(card);
	if (existing) return existing;
	const dataEl = card.querySelector(".bk-steps-data");
	if (!dataEl) return null;
	try {
		const steps = JSON.parse(dataEl.textContent || "[]");
		const state: StepsState = {
			currentIndex: 0,
			steps: Array.isArray(steps) ? steps : [],
			solved: new Array(steps.length).fill(false),
			isPlaying: true,
			isVoiceMuted: false,
			hasActivated: false,
			audioEl: null,
		};
		stepsMap.set(card, state);
		return state;
	} catch (e) {
		console.warn("Failed to parse simulation steps:", e);
		return null;
	}
}

function playStepAudio(_card: HTMLElement, state: StepsState) {
	if (state.isVoiceMuted) return;
	const step = state.steps[state.currentIndex];
	if (!step) return;

	stopSpeech();
	if (state.audioEl) {
		state.audioEl.pause();
		state.audioEl = null;
	}

	if (step.audio) {
		const audio = new Audio(step.audio);
		state.audioEl = audio;
		audio.play().catch(() => {});
	} else if (step.voice) {
		speakText(step.voice, state);
	}
}

function handleStepsActivation(card: HTMLElement) {
	const frame = card.querySelector(".bk-steps-frame, .bk-embed-interactive");
	if (frame && !frame.classList.contains("is-interactive")) {
		frame.classList.add("is-interactive");
	}
	document
		.querySelectorAll(".bk-embed-interactive.is-interactive")
		.forEach((otherFrame) => {
			if (otherFrame !== frame) {
				otherFrame.classList.remove("is-interactive");
				const iframe = otherFrame.querySelector("iframe");
				iframe?.contentWindow?.postMessage({ type: "bk:pause" }, "*");
				const stepsCard = otherFrame.closest?.(".bk-steps-object");
				if (stepsCard) {
					stepsCard.dispatchEvent(
						new CustomEvent("bk:steps-deactivate", { bubbles: true }),
					);
				}
			}
		});

	const state = getStepsState(card);
	if (!state) return;
	state.isPlaying = true;

	const iframe = card.querySelector("iframe");
	iframe?.contentWindow?.postMessage({ type: "bk:play" }, "*");
	iframe?.contentWindow?.postMessage(
		{ type: "bk:sim-play-state", playing: true },
		"*",
	);
	const playBtn = card.querySelector(
		".bk-steps-btn--play",
	) as HTMLElement | null;
	if (playBtn) {
		playBtn.classList.add("is-active");
		playBtn.setAttribute("title", "Pause simulation (Space)");
		playBtn.setAttribute("aria-label", "Pause simulation");
		const iconPause = playBtn.querySelector(
			".bk-icon-pause",
		) as HTMLElement | null;
		const iconPlay = playBtn.querySelector(
			".bk-icon-play",
		) as HTMLElement | null;
		if (iconPause) iconPause.style.display = "";
		if (iconPlay) iconPlay.style.display = "none";
	}
	if (!state.isVoiceMuted && !state.hasActivated) {
		state.hasActivated = true;
		playStepAudio(card, state);
	}
}

function getHostThemeState() {
	const root = document.documentElement;
	const styles = getComputedStyle(root);
	return {
		theme: root.dataset.theme || "light",
		palette: root.dataset.palette || "ink",
		ui: root.dataset.ui || "standard",
		colors: bkThemeColors(styles),
	};
}

function syncHostControls(card: HTMLElement, props?: Record<string, unknown>) {
	if (!props || typeof props !== "object") return;
	for (const [key, val] of Object.entries(props)) {
		card.querySelectorAll(`[data-bk-prop="${key}"]`).forEach((el) => {
			const input = el as HTMLInputElement;
			if (input.type === "checkbox") {
				input.checked = Boolean(val);
			} else if (input.type === "range" || input.type === "number") {
				input.value = String(val);
				if (input.type === "range") {
					const min = parseFloat(input.min) || 0;
					const max = parseFloat(input.max) || 100;
					const numVal = parseFloat(String(val)) || 0;
					const pct = Math.max(
						0,
						Math.min(100, ((numVal - min) / (max - min)) * 100),
					);
					input.style.setProperty("--bk-track-fill", `${pct}%`);
				}
				const sync = input.parentElement?.querySelector(
					`[data-bk-sync="${key}"]`,
				) as HTMLInputElement | null;
				if (sync) sync.value = String(val);
			} else {
				input.value = String(val);
			}
		});
	}
}

function updateStepsStep(
	card: HTMLElement,
	targetIndex: number,
	triggerVoice = true,
) {
	const state = getStepsState(card);
	if (!state?.steps.length) return;
	if (targetIndex < 0 || targetIndex >= state.steps.length) return;

	stopSpeech();

	if (state.audioEl) {
		state.audioEl.pause();
		state.audioEl = null;
	}

	state.currentIndex = targetIndex;
	const step = state.steps[targetIndex];

	// Update step indicator
	const headerBadge = card.querySelector(".bk-steps-step-badge");
	if (headerBadge) {
		const allSolved = state.solved.every(Boolean);
		headerBadge.replaceChildren();
		if (allSolved) {
			headerBadge.textContent = "Completed ✓";
			headerBadge.classList.add("is-completed");
		} else {
			const stepCur = document.createElement("strong");
			stepCur.className = "bk-step-cur";
			stepCur.textContent = String(targetIndex + 1);
			headerBadge.append("Step ", stepCur, ` of ${state.steps.length}`);
			headerBadge.classList.remove("is-completed");
		}
	}

	// Update Title
	const titleEl = card.querySelector(".bk-steps-step-title");
	if (titleEl) titleEl.textContent = step.title;

	// Update Target / Badge
	let targetEl = card.querySelector(".bk-steps-step-target");
	const targetHtml = step.targetHtml;
	if (targetHtml) {
		if (!targetEl) {
			targetEl = document.createElement("span");
			targetEl.className = "bk-steps-step-target";
			const group = card.querySelector(".bk-steps-title-group");
			if (group) group.appendChild(targetEl);
		}
		targetEl.innerHTML = safeHtml(targetHtml);
		targetEl.style.display = "";
	} else if (targetEl) {
		targetEl.style.display = "none";
	}

	// Update "What to do" Instruction
	const instructionHtml =
		step.instructionHtml || step.promptHtml || step.instruction || "";
	let instructionEl = card.querySelector(".bk-steps-instruction-text");
	let banner = card.querySelector(
		".bk-steps-instruction",
	) as HTMLElement | null;
	if (instructionHtml) {
		if (!banner) {
			banner = document.createElement("div");
			banner.className = "bk-steps-instruction";
			const badge = document.createElement("span");
			badge.className = "bk-steps-instruction-badge";
			badge.textContent = "What to do";
			const textSpan = document.createElement("span");
			textSpan.className = "bk-steps-instruction-text";
			banner.append(badge, textSpan);

			const parentBanner = card.querySelector(".bk-steps-banner");
			const hintPopover = card.querySelector(".bk-steps-hint-popover");
			if (hintPopover && parentBanner) {
				parentBanner.insertBefore(banner, hintPopover);
			} else if (parentBanner) {
				parentBanner.appendChild(banner);
			}
			instructionEl = textSpan;
		}
		if (instructionEl) {
			instructionEl.innerHTML = safeHtml(instructionHtml);
		}
		banner.style.display = "";
	} else if (banner) {
		banner.style.display = "none";
	}

	// Synchronize host controls with step-specific initialProps
	if (step.initialProps) {
		syncHostControls(card, step.initialProps);
	}

	// Reset interactivity on step transition so each step starts cleanly paused behind the "Click to interact" overlay
	const frame = card.querySelector(
		".bk-steps-frame, .bk-embed-interactive",
	) as HTMLElement | null;
	if (frame) {
		frame.classList.remove("is-interactive");
	}

	// Update Hint Popover and Hint Button
	const hintBtn = card.querySelector(
		".bk-steps-btn--hint",
	) as HTMLElement | null;
	const hintPopover = card.querySelector(
		".bk-steps-hint-popover",
	) as HTMLElement | null;
	if (hintPopover) {
		hintPopover.hidden = true;
		hintPopover.setAttribute("hidden", "");
		hintPopover.classList.remove("is-visible");
		const hintContent = hintPopover.querySelector(".bk-steps-hint-content");
		if (hintContent) {
			hintContent.innerHTML = safeHtml(
				step.hintHtml || formatMessage(step.hint || ""),
			);
		}
	}
	if (hintBtn) {
		hintBtn.classList.remove("is-active");
		hintBtn.setAttribute("aria-expanded", "false");
		if (step.hintHtml || step.hint) {
			hintBtn.style.display = "";
			hintBtn.removeAttribute("disabled");
		} else {
			hintBtn.style.display = "none";
		}
	}

	// Update toolbar buttons
	const prevBtn = card.querySelector(
		".bk-steps-btn--prev",
	) as HTMLButtonElement | null;
	if (prevBtn) prevBtn.disabled = targetIndex === 0;

	const nextBtn = card.querySelector(
		".bk-steps-btn--next",
	) as HTMLButtonElement | null;
	if (nextBtn) {
		nextBtn.disabled = targetIndex >= state.steps.length - 1;
	}

	// Update progress dots
	card.querySelectorAll(".bk-steps-dot").forEach((dot, idx) => {
		if (idx === targetIndex) {
			dot.classList.add("is-active");
		} else {
			dot.classList.remove("is-active");
		}
		if (state.solved[idx]) {
			dot.classList.add("is-solved");
		} else {
			dot.classList.remove("is-solved");
		}
	});

	// Hide feedback popup
	const feedback = card.querySelector(
		".bk-steps-feedback",
	) as HTMLElement | null;
	if (feedback) {
		feedback.hidden = true;
		feedback.setAttribute("hidden", "");
		feedback.classList.remove("is-visible");
	}

	// Autoplay step audio or voice narration if active and not muted
	if (triggerVoice && !state.isVoiceMuted) {
		state.hasActivated = true;
		playStepAudio(card, state);
	}

	// Send step sync to iframe
	const iframe = card.querySelector("iframe");
	if (iframe?.contentWindow) {
		iframe.contentWindow.postMessage(
			{
				type: "bk:steps-set-step",
				stepIndex: targetIndex,
				step: step,
				props: step.initialProps || {},
			},
			"*",
		);
		iframe.contentWindow.postMessage({ type: "bk:pause" }, "*");
		iframe.contentWindow.postMessage(
			{ type: "bk:sim-play-state", playing: false },
			"*",
		);
	}
}

function handleStepsKey(
	card: HTMLElement,
	state: StepsState,
	key: string,
	event?: KeyboardEvent,
) {
	if (key === "ArrowLeft") {
		if (state.currentIndex > 0) {
			if (event) event.preventDefault();
			updateStepsStep(card, state.currentIndex - 1, true);
		}
	} else if (key === "ArrowRight") {
		if (state.currentIndex < state.steps.length - 1) {
			if (event) event.preventDefault();
			updateStepsStep(card, state.currentIndex + 1, true);
		}
	} else if (key === "r" || key === "R") {
		if (event) event.preventDefault();
		const resetBtn = card.querySelector(
			".bk-steps-btn--reset",
		) as HTMLButtonElement | null;
		resetBtn?.click();
	} else if (key === " " || key === "Space" || key === "Spacebar") {
		if (event) event.preventDefault();
		const playBtn = card.querySelector(
			".bk-steps-btn--play",
		) as HTMLButtonElement | null;
		playBtn?.click();
	}
}

export function bkInitSteps() {
	document.querySelectorAll(".bk-steps-object").forEach((el) => {
		const card = el as HTMLElement;
		const state = getStepsState(card);
		if (state) {
			updateStepsStep(card, state.currentIndex, false);
		}
	});
}

export function bkWireSteps() {
	bkInitSteps();

	// Listen for simulation activation from interactive.ts or iframe
	const handleActivationEvent = (e: Event) => {
		const card = (e.target as HTMLElement)?.closest?.(
			".bk-steps-object",
		) as HTMLElement;
		if (card) {
			handleStepsActivation(card);
		}
	};
	document.addEventListener("bk:steps-activate", handleActivationEvent);

	// Listen for simulation deactivation (scrolled off-screen or clicked outside)
	const handleDeactivationEvent = (e: Event) => {
		const card = (e.target as HTMLElement)?.closest?.(
			".bk-steps-object",
		) as HTMLElement;
		if (card) {
			stopSpeech();
			const state = getStepsState(card);
			if (state) {
				state.isPlaying = false;
				if (state.audioEl) {
					state.audioEl.pause();
				}
				const playBtn = card.querySelector(
					".bk-steps-btn--play",
				) as HTMLElement | null;
				if (playBtn) {
					playBtn.classList.remove("is-active");
					playBtn.setAttribute("title", "Play simulation (Space)");
					playBtn.setAttribute("aria-label", "Play simulation");
					const iconPause = playBtn.querySelector(
						".bk-icon-pause",
					) as HTMLElement | null;
					const iconPlay = playBtn.querySelector(
						".bk-icon-play",
					) as HTMLElement | null;
					if (iconPause) iconPause.style.display = "none";
					if (iconPlay) iconPlay.style.display = "";
				}
			}
		}
	};
	document.addEventListener("bk:steps-deactivate", handleDeactivationEvent);

	// Track active step simulation on pointerdown or focus
	document.addEventListener(
		"pointerdown",
		(e) => {
			const target = e.target as HTMLElement;
			const card = target.closest?.(".bk-steps-object") as HTMLElement | null;
			if (card) {
				lastActiveSteps = card;
			}
		},
		{ passive: true },
	);

	document.addEventListener(
		"focusin",
		(e) => {
			const target = e.target as HTMLElement;
			const card = target.closest?.(".bk-steps-object") as HTMLElement | null;
			if (card) {
				lastActiveSteps = card;
			}
		},
		{ passive: true },
	);

	document.addEventListener("click", (e) => {
		const target = e.target as HTMLElement;

		// 0. Click to Interact Overlay or Card activation
		const overlay = target.closest(".bk-embed-overlay");
		if (overlay) {
			const card = overlay.closest(".bk-steps-object") as HTMLElement;
			if (card) {
				handleStepsActivation(card);
			}
		}

		// 1. Previous Button
		const prevBtn = target.closest(".bk-steps-btn--prev");
		if (prevBtn) {
			const card = prevBtn.closest(".bk-steps-object") as HTMLElement;
			const state = getStepsState(card);
			if (state && state.currentIndex > 0) {
				updateStepsStep(card, state.currentIndex - 1, true);
			}
			return;
		}

		// 2. Next Button
		const nextBtn = target.closest(".bk-steps-btn--next");
		if (nextBtn) {
			const card = nextBtn.closest(".bk-steps-object") as HTMLElement;
			const state = getStepsState(card);
			if (state && state.currentIndex < state.steps.length - 1) {
				updateStepsStep(card, state.currentIndex + 1, true);
			}
			return;
		}

		// 3. Play / Pause Button
		const playBtn = target.closest(".bk-steps-btn--play");
		if (playBtn) {
			const card = playBtn.closest(".bk-steps-object") as HTMLElement;
			const frame = card.querySelector(
				".bk-steps-frame, .bk-embed-interactive",
			);
			const wasInteractive = frame?.classList.contains("is-interactive");
			const state = getStepsState(card);
			if (state) {
				if (!wasInteractive || !state.isPlaying) {
					// Currently paused / in click-to-interact mode -> activate and resume playing
					handleStepsActivation(card);
				} else {
					// Currently playing -> pause and return to click-to-interact mode
					state.isPlaying = false;
					if (frame) {
						frame.classList.remove("is-interactive");
					}
					const iframe = card.querySelector("iframe");
					if (iframe?.contentWindow) {
						iframe.contentWindow.postMessage(
							{
								type: "bk:sim-play-state",
								playing: false,
							},
							"*",
						);
						iframe.contentWindow.postMessage({ type: "bk:pause" }, "*");
					}
					const iconPause = playBtn.querySelector(
						".bk-icon-pause",
					) as HTMLElement;
					const iconPlay = playBtn.querySelector(
						".bk-icon-play",
					) as HTMLElement;
					if (iconPause && iconPlay) {
						iconPause.style.display = "none";
						iconPlay.style.display = "";
					}
					playBtn.classList.remove("is-active");
					playBtn.setAttribute("title", "Play simulation (Space)");
					playBtn.setAttribute("aria-label", "Play simulation");
					stopSpeech();
					if (state.audioEl) {
						state.audioEl.pause();
					}
				}
			}
			return;
		}

		// 4. Reset Button
		const resetBtn = target.closest(".bk-steps-btn--reset");
		if (resetBtn) {
			const card = resetBtn.closest(".bk-steps-object") as HTMLElement;
			handleStepsActivation(card);
			const state = getStepsState(card);
			if (state) {
				state.solved[state.currentIndex] = false;
				const dots = card.querySelectorAll(".bk-steps-dot");
				if (dots[state.currentIndex]) {
					dots[state.currentIndex].classList.remove("is-solved");
				}
				const headerBadge = card.querySelector(".bk-steps-step-badge");
				if (headerBadge) {
					headerBadge.replaceChildren();
					const stepCur = document.createElement("strong");
					stepCur.className = "bk-step-cur";
					stepCur.textContent = String(state.currentIndex + 1);
					headerBadge.append("Step ", stepCur, ` of ${state.steps.length}`);
					headerBadge.classList.remove("is-completed");
				}
				const feedback = card.querySelector(
					".bk-steps-feedback",
				) as HTMLElement | null;
				if (feedback) {
					feedback.hidden = true;
					feedback.setAttribute("hidden", "");
					feedback.classList.remove("is-visible");
				}
				const step = state.steps[state.currentIndex];
				if (step?.initialProps) {
					syncHostControls(card, step.initialProps);
				}
				const iframe = card.querySelector("iframe");
				if (iframe?.contentWindow) {
					iframe.contentWindow.postMessage(
						{
							type: "bk:steps-reset-step",
							stepIndex: state.currentIndex,
							props: step?.initialProps || {},
						},
						"*",
					);
					if (state.isPlaying) {
						iframe.contentWindow.postMessage({ type: "bk:play" }, "*");
					}
				}
			}
			return;
		}

		// 5. Audio / Voice Narration Toggle
		const audioBtn = target.closest(".bk-steps-btn--audio");
		if (audioBtn) {
			const card = audioBtn.closest(".bk-steps-object") as HTMLElement;
			const state = getStepsState(card);
			if (!state) return;

			if (state.isVoiceMuted) {
				state.isVoiceMuted = false;
				state.hasActivated = true;
				audioBtn.classList.add("is-active");
				audioBtn.setAttribute("title", "Mute voice narration");
				playStepAudio(card, state);
			} else {
				state.isVoiceMuted = true;
				stopSpeech();
				if (state.audioEl) {
					state.audioEl.pause();
				}
				audioBtn.classList.remove("is-active");
				audioBtn.setAttribute("title", "Enable voice narration");
			}
			return;
		}

		// 6. Hint Toggle Button
		const hintBtn = target.closest(".bk-steps-btn--hint");
		if (hintBtn) {
			const card = hintBtn.closest(".bk-steps-object") as HTMLElement;
			const popover = card.querySelector(
				".bk-steps-hint-popover",
			) as HTMLElement | null;
			if (popover) {
				const isHidden = popover.hidden;
				popover.hidden = !isHidden;
				if (!isHidden) {
					popover.setAttribute("hidden", "");
					popover.classList.remove("is-visible");
					hintBtn.classList.remove("is-active");
					hintBtn.setAttribute("aria-expanded", "false");
				} else {
					popover.removeAttribute("hidden");
					popover.classList.add("is-visible");
					hintBtn.classList.add("is-active");
					hintBtn.setAttribute("aria-expanded", "true");
				}
			}
			return;
		}

		// 7. Hint Close Button
		const hintClose = target.closest(".bk-steps-hint-close");
		if (hintClose) {
			const popover = hintClose.closest(
				".bk-steps-hint-popover",
			) as HTMLElement | null;
			if (popover) {
				popover.hidden = true;
				popover.setAttribute("hidden", "");
				popover.classList.remove("is-visible");
				const card = popover.closest(".bk-steps-object") as HTMLElement | null;
				const hintBtn = card?.querySelector(
					".bk-steps-btn--hint",
				) as HTMLElement | null;
				hintBtn?.classList.remove("is-active");
				hintBtn?.setAttribute("aria-expanded", "false");
			}
			return;
		}

		// 8. Clickable Progress Dots
		const dotBtn = target.closest(".bk-steps-dot");
		if (dotBtn) {
			const card = dotBtn.closest(".bk-steps-object") as HTMLElement;
			const stepIdx = parseInt(dotBtn.getAttribute("data-step") || "0", 10);
			const state = getStepsState(card);
			if (
				state &&
				stepIdx >= 0 &&
				stepIdx < state.steps.length &&
				stepIdx !== state.currentIndex
			) {
				updateStepsStep(card, stepIdx, true);
			}
			return;
		}

		// 9. Next Step Button on Feedback Toast
		const feedbackNext = target.closest(".bk-steps-feedback-next");
		if (feedbackNext) {
			const card = feedbackNext.closest(".bk-steps-object") as HTMLElement;
			const state = getStepsState(card);
			if (state && state.currentIndex < state.steps.length - 1) {
				updateStepsStep(card, state.currentIndex + 1, true);
			}
			return;
		}

		// 10. Restart Steps Button on Feedback Toast
		const feedbackRestart = target.closest(".bk-steps-feedback-restart");
		if (feedbackRestart) {
			const card = feedbackRestart.closest(".bk-steps-object") as HTMLElement;
			const state = getStepsState(card);
			if (state) {
				state.solved.fill(false);
				updateStepsStep(card, 0, true);
				const step0 = state.steps[0];
				if (step0?.initialProps) {
					syncHostControls(card, step0.initialProps);
				}
				const iframe = card.querySelector("iframe");
				if (iframe?.contentWindow) {
					iframe.contentWindow.postMessage(
						{
							type: "bk:steps-reset-step",
							stepIndex: 0,
							props: step0?.initialProps || {},
						},
						"*",
					);
					if (state.isPlaying) {
						iframe.contentWindow.postMessage({ type: "bk:play" }, "*");
					}
				}
			}
			return;
		}
	});

	// Keyboard navigation support
	document.addEventListener("keydown", (e) => {
		const activeEl = document.activeElement as HTMLElement | null;
		if (
			activeEl &&
			(activeEl.tagName === "INPUT" ||
				activeEl.tagName === "TEXTAREA" ||
				activeEl.tagName === "SELECT" ||
				activeEl.isContentEditable)
		) {
			return;
		}

		// If user is focused on an interactive element outside of any steps block, do not hijack keystrokes
		if (
			activeEl &&
			activeEl !== document.body &&
			activeEl !== document.documentElement &&
			!activeEl.closest(".bk-steps-object")
		) {
			return;
		}

		// Native Space on any button should activate that button, not toggle play/pause
		if (
			activeEl?.tagName === "BUTTON" &&
			(e.key === " " || e.key === "Space" || e.key === "Spacebar")
		) {
			return;
		}

		let card = activeEl?.closest(".bk-steps-object") as HTMLElement | null;

		if (!card && lastActiveSteps && document.body.contains(lastActiveSteps)) {
			card = lastActiveSteps;
		}

		if (!card) return;
		// Do not hijack Spacebar, Arrow keys, or 'r' unless the simulation is actively interactive!
		const frame = card.querySelector(".bk-steps-frame, .bk-embed-interactive");
		if (!frame?.classList.contains("is-interactive")) {
			return;
		}

		const state = getStepsState(card);
		if (!state) return;

		if (
			e.key === "ArrowLeft" ||
			e.key === "ArrowRight" ||
			e.key === "r" ||
			e.key === "R" ||
			e.key === " "
		) {
			handleStepsKey(card, state, e.key, e);
		}
	});

	// Handle postMessages from iframe
	window.addEventListener("message", (e) => {
		if (!e.data) return;

		// Forwarded keydown from inside sandboxed iframe
		if (e.data.type === "bk:steps-keydown" && e.data.key) {
			document.querySelectorAll(".bk-steps-object").forEach((el) => {
				const card = el as HTMLElement;
				const iframe = card.querySelector("iframe");
				if (iframe && iframe.contentWindow === e.source) {
					const state = getStepsState(card);
					if (state) {
						handleStepsKey(card, state, e.data.key);
					}
				}
			});
			return;
		}

		// Iframe requesting theme state
		if (e.data.type === "bk:request-theme") {
			const themeState = getHostThemeState();
			if (e.source && typeof e.source.postMessage === "function") {
				e.source.postMessage({ type: "bk:theme-sync", state: themeState }, "*");
			}
			return;
		}

		// User interacted inside iframe
		if (e.data.type === "bk:steps-user-interacted") {
			document.querySelectorAll(".bk-steps-object").forEach((el) => {
				const card = el as HTMLElement;
				const iframe = card.querySelector("iframe");
				if (iframe && iframe.contentWindow === e.source) {
					handleStepsActivation(card);
				}
			});
			return;
		}

		// Iframe ready handshake
		if (e.data.type === "bk:steps-ready") {
			document.querySelectorAll(".bk-steps-object").forEach((el) => {
				const card = el as HTMLElement;
				const iframe = card.querySelector("iframe");
				if (iframe && iframe.contentWindow === e.source) {
					const state = getStepsState(card);
					if (state) {
						updateStepsStep(card, state.currentIndex, false);
						const frame = card.querySelector(
							".bk-steps-frame, .bk-embed-interactive",
						);
						const isInteractive = frame?.classList.contains("is-interactive");
						if (isInteractive && state.isPlaying) {
							iframe.contentWindow.postMessage({ type: "bk:play" }, "*");
							iframe.contentWindow.postMessage(
								{ type: "bk:sim-play-state", playing: true },
								"*",
							);
						} else {
							iframe.contentWindow.postMessage({ type: "bk:pause" }, "*");
						}
					}
				}
			});
			return;
		}

		// Step complete notification from iframe
		if (e.data.type === "bk:steps-complete") {
			let matchedCard: HTMLElement | null = null;
			document.querySelectorAll(".bk-steps-object").forEach((el) => {
				const card = el as HTMLElement;
				const iframe = card.querySelector("iframe");
				try {
					if (iframe && iframe.contentWindow === e.source) {
						matchedCard = card;
					}
				} catch {}
			});

			if (matchedCard) {
				const card = matchedCard as HTMLElement;
				const state = getStepsState(card);
				if (!state) return;

				// Validate step index matches current step
				const solvedStep =
					typeof e.data.stepIndex === "number"
						? e.data.stepIndex
						: state.currentIndex;
				if (solvedStep !== state.currentIndex) {
					return;
				}

				// If already marked as solved, do not re-trigger celebration chime or speech
				if (state.solved[state.currentIndex]) {
					return;
				}

				state.solved[state.currentIndex] = true;
				const isLastStep = state.currentIndex >= state.steps.length - 1;
				const allSolved = state.solved.every(Boolean);

				const currentStep = state.steps[state.currentIndex];
				const feedbackMsg =
					typeof e.data.feedback === "string"
						? e.data.feedback
						: currentStep?.feedback || "Step completed! Excellent job!";

				const feedback = card.querySelector(
					".bk-steps-feedback",
				) as HTMLElement | null;
				if (!feedback) return;

				feedback.hidden = false;
				feedback.removeAttribute("hidden");
				feedback.classList.add("is-visible");

				const badgeEl = feedback.querySelector(
					".bk-steps-feedback-badge",
				) as HTMLElement | null;
				if (badgeEl) {
					if (isLastStep || allSolved) {
						badgeEl.textContent = "Steps Completed 🎉";
						badgeEl.classList.add("is-completed");
					} else {
						badgeEl.textContent = "Step Complete";
						badgeEl.classList.remove("is-completed");
					}
				}

				const msgEl = feedback.querySelector(
					".bk-steps-feedback-msg",
				) as HTMLElement | null;
				if (msgEl) {
					const rawFeedback =
						currentStep?.feedbackHtml || formatMessage(feedbackMsg);
					msgEl.innerHTML = safeHtml(rawFeedback);
				}

				const nextBtn = feedback.querySelector(
					".bk-steps-feedback-next",
				) as HTMLElement | null;
				const restartBtn = feedback.querySelector(
					".bk-steps-feedback-restart",
				) as HTMLElement | null;

				if (isLastStep) {
					if (nextBtn) nextBtn.style.display = "none";
					if (restartBtn) restartBtn.style.display = "";
				} else {
					if (nextBtn) nextBtn.style.display = "";
					if (restartBtn) restartBtn.style.display = "none";
				}

				const headerBadge = card.querySelector(".bk-steps-step-badge");
				if (headerBadge && (isLastStep || allSolved)) {
					headerBadge.textContent = "Completed ✓";
					headerBadge.classList.add("is-completed");
				}

				playSuccessChime(isLastStep || allSolved);
				// Synthetic speech is strictly opt-in: only speak if explicitly requested via event
				if (!state.isVoiceMuted && e.data.voice) {
					speakText(e.data.voice, state);
				}

				const toolbarNext = card.querySelector(
					".bk-steps-btn--next",
				) as HTMLButtonElement | null;
				if (toolbarNext && state.currentIndex < state.steps.length - 1) {
					toolbarNext.disabled = false;
				}

				const dots = card.querySelectorAll(".bk-steps-dot");
				if (dots[state.currentIndex]) {
					dots[state.currentIndex].classList.add("is-solved");
				}
			}
		}
	});
}
