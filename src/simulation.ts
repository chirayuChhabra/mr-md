export type TelemetryValue = string | number | boolean | null;
export type Unsubscribe = () => void;

export interface CanvasFrameInfo {
	width: number;
	height: number;
	scale: number;
	offsetX: number;
	offsetY: number;
	viewportWidth: number;
	viewportHeight: number;
	originX: number;
	originY: number;
	windowWidth: number;
	windowHeight: number;
	framing: string;
}
export type CanvasDraw = (
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	frame?: CanvasFrameInfo,
) => void;
export interface CanvasOptions {
	framing?: "contain" | "responsive" | "bleed";
}
export interface FixedCanvasOptions extends CanvasOptions {
	width?: number;
	height?: number;
}

export interface SimulationRuntime<Props extends object> {
	readonly props: Readonly<Props>;
	readonly isPlaying: boolean;
	onPropsChange(callback: (props: Readonly<Props>) => void): Unsubscribe;
	onReset(callback: (props: Readonly<Props>) => void): Unsubscribe;
	onPlaybackChange(callback: (playing: boolean) => void): Unsubscribe;
	publishTelemetry(values: Record<string, TelemetryValue>): void;
	/** Seconds since the previous draw; zero while paused, capped after delays. */
	deltaTime(now?: number): number;
	dispose(): void;
}

declare global {
	interface Window {
		/** Label a direct user edit until the returned cleanup is called. */
		bkBeginInteraction?: (label?: string) => Unsubscribe;
		bkSetup(draw: CanvasDraw, options?: FixedCanvasOptions): void;
		bkSetup(
			width: number,
			height: number,
			draw: CanvasDraw,
			options?: CanvasOptions,
		): void;
		bkSetup(
			width: number,
			height: number,
			options: CanvasOptions,
			draw: CanvasDraw,
		): void;
		defineSimulation: typeof defineSimulation;
	}
}

/** Optional authoring interface over the existing mr-md iframe bridge. */
export function defineSimulation<Props extends object>(options: {
	props: Props;
}): SimulationRuntime<Props> {
	const scope = window as Window & {
		__simProps?: Props;
		__loop?: boolean;
		__bkRestoring?: boolean;
		__renderFrame?: () => void;
		__startLoop?: () => void;
		__stopLoop?: () => void;
		bkOnReset?: (callback: () => void) => void;
		bkTelemetry?: (data: Record<string, TelemetryValue>) => void;
	};
	const defaults = structuredClone(options.props);
	scope.__simProps = { ...defaults, ...scope.__simProps };
	let props: Readonly<Props> = Object.freeze({ ...scope.__simProps });
	let playing = Boolean(scope.__loop);
	let lastTime: number | null = null;
	let disposed = false;
	const propsCallbacks = new Set<(props: Readonly<Props>) => void>();
	const resetCallbacks = new Set<(props: Readonly<Props>) => void>();
	const playbackCallbacks = new Set<(playing: boolean) => void>();
	const announce = () => {
		scope.parent.postMessage(
			{ type: "bk:runtime-ready", reset: !disposed && resetCallbacks.size > 0 },
			"*",
		);
	};
	const receiveProps = () => {
		props = Object.freeze({ ...scope.__simProps }) as Readonly<Props>;
		for (const callback of propsCallbacks) callback(props);
	};
	const updatePlayback = (next: boolean) => {
		if (playing === next) return;
		playing = next;
		lastTime = null;
		for (const callback of playbackCallbacks) callback(playing);
	};
	const receiveMessage = (event: MessageEvent) => {
		if (
			event.source !== scope.parent ||
			!event.data ||
			typeof event.data !== "object"
		)
			return;
		const message = event.data;
		if (message.type === "bk:runtime-query") {
			announce();
		} else if (message.type === "bk:play" || message.type === "bk:pause") {
			updatePlayback(message.type === "bk:play");
		} else if (
			message.type === "bk:steps-set-step" ||
			message.type === "bk:steps-reset-step"
		) {
			updatePlayback(false);
		} else if (message.type === "bk:snapshot-restore") {
			lastTime = null;
			updatePlayback(Boolean(message.resumePlayback));
		} else if (message.type === "bk:sim-play-state") {
			updatePlayback(Boolean(message.playing));
		} else if (message.type === "bk:reset" && resetCallbacks.size > 0) {
			scope.__simProps = { ...structuredClone(defaults), ...message.props };
			scope.dispatchEvent(
				new CustomEvent("bk:props", { detail: scope.__simProps }),
			);
			for (const callback of resetCallbacks) callback(props);
			lastTime = null;
			if (typeof message.playing === "boolean") {
				scope.__loop = message.playing;
				updatePlayback(message.playing);
				if (message.playing) scope.__startLoop?.();
				else scope.__stopLoop?.();
			}
			scope.__renderFrame?.();
			scope.parent.postMessage({ type: "bk:reset-complete" }, "*");
		}
	};
	scope.bkOnReset?.(() => {
		lastTime = null;
		for (const callback of resetCallbacks) callback(props);
	});
	scope.addEventListener("bk:props", receiveProps);
	scope.addEventListener("message", receiveMessage);
	announce();
	return {
		get props() {
			return props;
		},
		get isPlaying() {
			return playing && Boolean(scope.__loop);
		},
		onPropsChange(callback) {
			propsCallbacks.add(callback);
			return () => {
				propsCallbacks.delete(callback);
			};
		},
		onReset(callback) {
			resetCallbacks.add(callback);
			announce();
			return () => {
				resetCallbacks.delete(callback);
				announce();
			};
		},
		onPlaybackChange(callback) {
			playbackCallbacks.add(callback);
			return () => {
				playbackCallbacks.delete(callback);
			};
		},
		publishTelemetry(values) {
			if (!disposed) scope.bkTelemetry?.(values);
		},
		deltaTime(now = performance.now()) {
			if (!playing || !scope.__loop || scope.__bkRestoring) {
				lastTime = null;
				return 0;
			}
			const delta =
				lastTime === null
					? 0
					: Math.max(0, Math.min(0.1, (now - lastTime) / 1000));
			lastTime = now;
			return delta;
		},
		dispose() {
			disposed = true;
			scope.removeEventListener("bk:props", receiveProps);
			scope.removeEventListener("message", receiveMessage);
			propsCallbacks.clear();
			resetCallbacks.clear();
			playbackCallbacks.clear();
			announce();
		},
	};
}
