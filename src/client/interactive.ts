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
					} else {
						if (frame.dataset.isAnimation === "true") {
							if (iframe?.contentWindow) {
								iframe.contentWindow.postMessage({ type: "bk:play" }, "*");
							}
						}
					}
				});
			},
			{ threshold: 0, rootMargin: "50% 0px 50% 0px" },
		);
	}

	interactiveObs.disconnect();
	document.querySelectorAll(".bk-embed-interactive").forEach((frame) => {
		interactiveObs.observe(frame);
	});
}

export function bkWireInteractiveFrames() {
	const interactiveHandler = (e: Event) => {
		const obj = (e.target as HTMLElement).closest?.(".bk-object");
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
				}
			});

		if (activateFrame && !activateFrame.classList.contains("is-interactive")) {
			activateFrame.classList.add("is-interactive");
			const iframe = activateFrame.querySelector("iframe");
			if (iframe?.contentWindow) {
				iframe.contentWindow.postMessage({ type: "bk:play" }, "*");
			}
		}
	};
	document.addEventListener("pointerdown", interactiveHandler, {
		passive: true,
	});
	document.addEventListener("focusin", interactiveHandler, { passive: true });

	let scrollTimeout: ReturnType<typeof setTimeout> | undefined;
	document.addEventListener(
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
		{ passive: true },
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
