import { describe, expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { defineSimulation } from "../src/simulation.js";
import { iframeDoc } from "../src/renderer/blocks/iframe.js";
import { stepsIframeDoc } from "../src/renderer/blocks/steps-iframe.js";

function fixture(stepMode = false) {
	const sent: any[] = [];
	const target = new EventTarget();
	const stepReset: Array<() => void> = [];
	const scope = Object.assign(target, {
		__simProps: { speed: 2 },
		__loop: false,
		parent: { postMessage: (data: unknown) => sent.push(data) },
		bkTelemetry: (data: unknown) => sent.push({ type: "bk:telemetry", data }),
		bkOnReset: stepMode
			? (callback: () => void) => stepReset.push(callback)
			: undefined,
	});
	const create = runInNewContext(`(${defineSimulation.toString()})`, {
		window: scope,
		structuredClone,
		CustomEvent,
		performance,
	});
	const sim = create({ props: { speed: 1, showPath: true } });
	const message = (data: any, source: unknown = scope.parent) => {
		if (source === scope.parent) {
			if (data.type === "bk:play") scope.__loop = true;
			if (
				["bk:pause", "bk:steps-set-step", "bk:steps-reset-step"].includes(
					data.type,
				)
			)
				scope.__loop = false;
		}
		const event = new Event("message");
		Object.assign(event, { data, source });
		scope.dispatchEvent(event);
	};
	return { sim, scope, message, sent, stepReset };
}

describe("optional simulation authoring runtime", () => {
	test("merges host props, updates without duplicate bridge listeners, and publishes telemetry", () => {
		const { sim, scope, sent } = fixture();
		expect(sim.props).toEqual({ speed: 2, showPath: true });
		let observed;
		sim.onPropsChange((props: unknown) => {
			observed = props;
		});
		scope.__simProps = { speed: 3 };
		scope.dispatchEvent(new CustomEvent("bk:props"));
		expect(observed).toEqual({ speed: 3 });
		expect(Object.isFrozen(sim.props)).toBe(true);
		sim.publishTelemetry({ energy: 4 });
		expect(sent.at(-1)).toEqual({ type: "bk:telemetry", data: { energy: 4 } });
	});

	test("reset restores defaults, invokes hook, preserves paused state and advertises capability", () => {
		const { sim, message, sent } = fixture();
		let resetProps;
		const unsubscribe = sim.onReset((props: unknown) => {
			resetProps = props;
		});
		expect(sent.at(-1)).toEqual({ type: "bk:runtime-ready", reset: true });
		message({ type: "bk:reset", props: { speed: 1 }, playing: false });
		expect(resetProps).toEqual({ speed: 1, showPath: true });
		expect(sim.isPlaying).toBe(false);
		message({ type: "bk:runtime-query" });
		expect(sent.at(-1)).toEqual({ type: "bk:runtime-ready", reset: true });
		unsubscribe();
		expect(sent.at(-1)).toEqual({ type: "bk:runtime-ready", reset: false });
	});

	test("clamps elapsed time, resets after pause, and ignores foreign messages", () => {
		const { sim, message } = fixture();
		message({ type: "bk:play" }, {});
		expect(sim.isPlaying).toBe(false);
		message({ type: "bk:play" });
		expect(sim.deltaTime(100)).toBe(0);
		expect(sim.deltaTime(120)).toBeCloseTo(0.02);
		expect(sim.deltaTime(5000)).toBe(0.1);
		message({ type: "bk:pause" });
		expect(sim.deltaTime(6000)).toBe(0);
		message({ type: "bk:play" });
		expect(sim.deltaTime(10000)).toBe(0);
	});

	test("a paused redraw cannot advance time before playback notification arrives", () => {
		const { sim, scope, message } = fixture();
		message({ type: "bk:play" });
		sim.deltaTime(100);
		expect(sim.deltaTime(120)).toBeCloseTo(0.02);
		scope.__loop = false;
		expect(sim.isPlaying).toBe(false);
		expect(sim.deltaTime(140)).toBe(0);
	});

	test("adapts guided step reset without restoring whole-experiment defaults", () => {
		const { sim, scope, stepReset, message } = fixture(true);
		let resetProps;
		sim.onReset((props: unknown) => {
			resetProps = props;
		});
		message({ type: "bk:play" });
		message({ type: "bk:steps-reset-step" });
		scope.__simProps = { speed: 4 };
		scope.dispatchEvent(new CustomEvent("bk:props"));
		stepReset[0]!();
		expect(resetProps).toEqual({ speed: 4 });
		expect(sim.isPlaying).toBe(false);
	});

	test("steps bridge replaces trial props, resets SDK model, and keeps completion routing", () => {
		const sent: any[] = [];
		const scope: any = Object.assign(new EventTarget(), {
			parent: { postMessage: (data: unknown) => sent.push(data) },
		});
		const document = {
			getElementById: () => ({ textContent: '{"speed":1}' }),
			documentElement: { style: {} },
			body: { style: {} },
		};
		const doc = stepsIframeDoc("", '{"speed":1}')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&amp;/g, "&");
		const script = doc.match(/<script>\n([\s\S]*?)<\/script>/)?.[1];
		expect(script).toBeDefined();
		runInNewContext(script!, {
			window: scope,
			document,
			structuredClone,
			CustomEvent,
			performance,
			console,
		});
		const sim = scope.defineSimulation({ props: { speed: 1 } });
		let resetProps;
		sim.onReset((props: unknown) => {
			resetProps = props;
		});
		const message = (data: unknown) => {
			const event = new Event("message");
			Object.assign(event, { data, source: scope.parent });
			scope.dispatchEvent(event);
		};
		message({
			type: "bk:steps-set-step",
			stepIndex: 0,
			props: { speed: 4, oldStepOnly: true },
			replaceProps: true,
		});
		message({
			type: "bk:steps-set-step",
			stepIndex: 1,
			props: { speed: 2 },
			replaceProps: true,
		});
		expect(sim.props).toEqual({ speed: 2, step: 1 });
		message({
			type: "bk:steps-reset-step",
			props: { speed: 2 },
			replaceProps: true,
		});
		expect(resetProps).toEqual({ speed: 2, step: 1 });
		scope.bkCompleteStep();
		expect(sent.at(-1)).toMatchObject({
			type: "bk:steps-complete",
			stepIndex: 1,
		});
	});

	test("dispose unsubscribes lifecycle and removes reset capability", () => {
		const { sim, message, sent } = fixture();
		sim.onReset(() => {});
		sim.dispose();
		message({ type: "bk:play" });
		expect(sim.isPlaying).toBe(false);
		expect(sent.at(-1)).toEqual({ type: "bk:runtime-ready", reset: false });
	});

	test("both frame types inject the same API and workspace keyboard bridge", () => {
		for (const doc of [iframeDoc("", "{}", false), stepsIframeDoc("", "{}")]) {
			expect(doc).toContain("window.defineSimulation");
			expect(doc).toContain("bk:workspace-close");
			expect(doc).toContain("bk:workspace-focus");
			expect(doc).toContain("bk:runtime-query");
		}
	});
});
