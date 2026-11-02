// @ts-nocheck
let interactiveObs: IntersectionObserver | undefined;

export function bkInitInteractiveFrames() {
	if (!interactiveObs) {
		interactiveObs = new IntersectionObserver(
			(entries) => {
				entries.forEach((e) => {
					const frame = e.target;
					const iframe = frame.querySelector("iframe");
					if (!e.isIntersecting) {
						if (frame.classList.contains("is-interactive")) {
							frame.classList.remove("is-interactive");
						}
						if (iframe?.contentWindow) {
							iframe.contentWindow.postMessage({ type: "bk:pause" }, "*");
						}
						const stepsCard = frame.closest?.(".bk-steps-object");
						if (stepsCard) {
							stepsCard.dispatchEvent(
								new CustomEvent("bk:steps-deactivate", { bubbles: true }),
							);
						}
					} else {
						if (frame.dataset.isAnimation === "true") {
							if (iframe?.contentWindow) {
								iframe.contentWindow.postMessage({ type: "bk:play" }, "*");
							}
						}
					}
				});
			},
			{ threshold: 0, rootMargin: "0px" },
		);
	}

	interactiveObs.disconnect();
	document.querySelectorAll(".bk-embed-interactive").forEach((frame) => {
		interactiveObs.observe(frame);
	});
}

export function bkWireInteractiveFrames() {
	const interactiveHandler = (e: Event) => {
		const target = e.target as HTMLElement;
		const obj = target.closest?.(".bk-object");
		const activateFrame = obj
			? obj.querySelector(".bk-embed-interactive")
			: null;

		document
			.querySelectorAll(".bk-embed-interactive.is-interactive")
			.forEach((frame) => {
				if (frame !== activateFrame) {
					frame.classList.remove("is-interactive");
					const iframe = frame.querySelector("iframe");
					if (iframe?.contentWindow) {
						iframe.contentWindow.postMessage({ type: "bk:pause" }, "*");
					}
					const stepsCard = frame.closest?.(".bk-steps-object");
					if (stepsCard) {
						stepsCard.dispatchEvent(
							new CustomEvent("bk:steps-deactivate", { bubbles: true }),
						);
					}
				}
			});

		if (activateFrame) {
			const isSteps = obj?.classList.contains("bk-steps-object");

			// For step-by-step simulations, reading banner text, toggling hints, audio,
			// or previewing step dots while not yet interactive should NOT prematurely
			// dismiss the "Click to interact" canvas shield.
			if (isSteps && !activateFrame.classList.contains("is-interactive")) {
				const isCanvasClick = !!target.closest(
					".bk-embed-interactive, .bk-embed-overlay",
				);
				const isPlayOrReset = !!target.closest(
					".bk-steps-btn--play, .bk-steps-btn--reset, .bk-steps-feedback-restart",
				);
				if (!isCanvasClick && !isPlayOrReset) {
					// User is interacting with outer banner, hints, or step browser; leave canvas shield intact
					return;
				}
			}

			if (!activateFrame.classList.contains("is-interactive")) {
				activateFrame.classList.add("is-interactive");
				const isPaused =
					isSteps && !obj?.querySelector(".bk-steps-btn--play.is-active");
				if (!isPaused) {
					const iframe = activateFrame.querySelector("iframe");
					if (iframe?.contentWindow) {
						iframe.contentWindow.postMessage({ type: "bk:play" }, "*");
					}
				}
				if (isSteps && obj) {
					obj.dispatchEvent(
						new CustomEvent("bk:steps-activate", { bubbles: true }),
					);
				}
			}
		}
	};
	document.addEventListener("pointerdown", interactiveHandler, {
		passive: true,
	});
	document.addEventListener("focusin", interactiveHandler, { passive: true });

	let scrollTimeout: ReturnType<typeof setTimeout> | undefined;
	window.addEventListener(
		"scroll",
		() => {
			if (!document.body.classList.contains("bk-is-scrolling")) {
				document.body.classList.add("bk-is-scrolling");
			}
			clearTimeout(scrollTimeout);
			scrollTimeout = setTimeout(() => {
				document.body.classList.remove("bk-is-scrolling");
			}, 150);
		},
		{ capture: true, passive: true },
	);

	bkInitInteractiveFrames();

	document.addEventListener(
		"contentvisibilityautostatechange",
		(e: Event & { skipped?: boolean }) => {
			const frame = e.target as HTMLElement;
			if (frame?.classList?.contains("bk-embed-interactive")) {
				const iframe = frame.querySelector("iframe") as HTMLIFrameElement;
				if (!iframe?.contentWindow) return;

				if (e.skipped) {
					iframe.contentWindow.postMessage({ type: "bk:pause" }, "*");
				} else {
					if (
						frame.dataset.isAnimation === "true" ||
						frame.classList.contains("is-interactive")
					) {
						iframe.contentWindow.postMessage({ type: "bk:play" }, "*");
					}
				}
			}
		},
		{ capture: true },
	);
}
