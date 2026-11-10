import * as fs from "fs";
import * as path from "path";
import { PAUSE_ICON, PLAY_ICON, RESET_ICON } from "../../simulation-toolbar.js";
import type {
	BuildOptions,
	SimulationBlock,
	SimulationStep,
	StepsBlock,
} from "../../types.js";
import {
	escapeScriptJson,
	renderInspectorTabs,
	renderSimulationControls,
	renderSimulationTelemetry,
} from "../markdown/index.js";
import { mdInline } from "../markdown/sanitize.js";
import { type NavItem, resolveAssetSrc, resolveContent } from "../utils.js";
import { stepsIframeDoc } from "./steps-iframe.js";
import { escAttr, escHtml } from "./utils.js";

export interface RenderedSimulationStep {
	id: string;
	title: string;
	targetHtml?: string;
	instructionHtml?: string;
	voice?: string;
	feedback?: string;
	feedbackHtml?: string;
	hint?: string;
	hintHtml?: string;
	audio?: string;
	initialProps?: Record<string, unknown>;
}

export function renderSteps(
	block: StepsBlock,
	idx: number,
	options: BuildOptions,
): { html: string; navItems?: NavItem[] } {
	const id = `steps-${idx}`;
	const label = block.label || "Step-by-Step Simulation";
	const simSrc = resolveContent(block.src, options, "js");
	const accent = block.accent ?? "blue";

	const steps: SimulationStep[] =
		Array.isArray(block.steps) && block.steps.length > 0
			? block.steps
			: [{ id: "step-0", title: label, instruction: "" }];

	const simDir = path.dirname(
		path.resolve(options.contentBase ?? ".", block.src),
	);

	const renderedSteps: RenderedSimulationStep[] = steps.map((s, i) => {
		let audioSrc = block.audio === false ? undefined : s.audio;
		if (
			audioSrc &&
			!/^https?:\/\//.test(audioSrc) &&
			!path.isAbsolute(audioSrc)
		) {
			const relativeToSim = path.resolve(simDir, audioSrc);
			if (fs.existsSync(relativeToSim)) {
				audioSrc = relativeToSim;
			}
		}
		const resolvedAudio = audioSrc
			? resolveAssetSrc(audioSrc, options)
			: undefined;

		return {
			id: s.id || `step-${i}`,
			title: s.title || `Step ${i + 1}`,
			targetHtml: s.target
				? mdInline(s.target)
				: s.badge
					? mdInline(s.badge)
					: undefined,
			instructionHtml: s.instruction
				? mdInline(s.instruction)
				: s.prompt
					? mdInline(s.prompt)
					: undefined,
			voice: block.voice === false ? undefined : s.voice,
			feedback: s.feedback,
			feedbackHtml: s.feedback ? mdInline(s.feedback) : undefined,
			hint: s.hint,
			hintHtml: s.hint ? mdInline(s.hint) : undefined,
			audio: block.audio === false ? undefined : resolvedAudio,
			initialProps: s.initialProps,
		};
	});

	const firstStep = renderedSteps[0];
	const propsJson = escapeScriptJson(
		firstStep.initialProps || block.props || {},
	);
	const stepsJson = escapeScriptJson(renderedSteps);

	const stepDots = steps
		.map(
			(_, i) =>
				`<button type="button" class="bk-steps-dot${i === 0 ? " is-active" : ""}" data-step="${i}" aria-label="Step ${i + 1}" title="Jump to Step ${i + 1}"></button>`,
		)
		.join("");

	const initialInstruction = firstStep.instructionHtml || "";

	const hasAnyHint = renderedSteps.some((s) => !!s.hintHtml);
	const isAudioExplicitlyDisabled =
		block.voice === false || block.audio === false;
	const hasAnyAudio =
		!isAudioExplicitlyDisabled &&
		renderedSteps.some((s) => !!s.audio || !!s.voice);

	const controlsHtml =
		block.tunables || block.props || block.actions || block.presets
			? renderSimulationControls(
					{
						type: "simulation",
						src: block.src,
						props: block.props,
						tunables: block.tunables,
						actions: block.actions,
						presets: block.presets,
						advancedControls: block.advancedControls,
						controls: "interactive",
					} as SimulationBlock,
					id,
				)
			: "";

	const frameHeightAttr = block.height
		? `style="height:${block.height}px;"`
		: "";

	const hasTel = Boolean(
		block.telemetry && Object.keys(block.telemetry).length > 0,
	);
	const telemetryHtml = hasTel
		? renderSimulationTelemetry(id, block.telemetry!)
		: "";
	const inspectorContent = renderInspectorTabs(
		id,
		controlsHtml,
		telemetryHtml,
		block.telemetry,
		Boolean(block.measurements?.timeline),
	);
	const telemetrySchemaScript = hasTel
		? `<script type="application/json" class="bk-sim-telemetry-schema">${escapeScriptJson(block.telemetry)}</script>`
		: "";

	const html = `
<figure id="${id}" class="bk-object bk-object--${escAttr(accent)} bk-steps-object" data-step-count="${steps.length}">
  <div class="bk-object-header">
    <span class="bk-object-kicker">${escHtml(block.kicker || "Step-by-Step Simulation")}</span>
    <span class="bk-object-title">${escHtml(label)}</span>
    <div class="bk-expanded-sim-picker" hidden></div>
    <div class="bk-object-actions">
      <button type="button" class="bk-object-maximize" data-bk-lab-entry aria-label="Open lab" title="Open lab">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
        <span>Open lab</span>
      </button>
    </div>
  </div>

  <div class="bk-sim-workspace">
    <div class="bk-sim-stage">
      <div class="bk-embed-frame bk-steps-frame bk-embed-interactive bk-sim-preview" ${frameHeightAttr}>
        <button type="button" class="bk-embed-overlay" data-bk-expand-preview aria-label="Expand step-by-step simulation">
          <span class="bk-embed-overlay-text">Click to expand</span>
        </button>
        <iframe title="${escAttr(label)}" srcdoc="${stepsIframeDoc(simSrc, propsJson, block.dependencies)}"
          sandbox="allow-scripts"
          allow="autoplay"
          style="width:100%;height:100%;border:none;display:block;background:transparent;">
        </iframe>

      </div>
            <div class="bk-steps-controls" role="group" aria-label="Simulation playback">
        <div class="bk-steps-nav">
          <button type="button" class="bk-steps-btn bk-steps-btn--prev" aria-label="Previous step" title="Previous step (Left Arrow)" disabled>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <button type="button" class="bk-steps-btn bk-steps-btn--play is-active" aria-label="Pause / Play" title="Pause / Play (Space)">
            ${PAUSE_ICON}
            ${PLAY_ICON}
          </button>
          <button type="button" class="bk-steps-btn bk-steps-btn--next" aria-label="Next step" title="Next step (Right Arrow)" ${steps.length <= 1 ? "disabled" : ""}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>

        <span class="bk-steps-divider" aria-hidden="true"></span>

        <div class="bk-steps-tools">
          ${
						hasAnyAudio
							? `<button type="button" class="bk-steps-btn bk-steps-btn--audio is-active" aria-label="Audio Narration" title="Toggle audio narration">
            <svg class="bk-icon-audio" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
          </button>`
							: ""
					}
          <button type="button" class="bk-steps-btn bk-steps-btn--reset" aria-label="Reset trial" title="Reset trial (R)">
            ${RESET_ICON}
          </button>
          ${
						hasAnyHint
							? `<button type="button" class="bk-steps-btn bk-steps-btn--hint" aria-label="Step Hint" title="Show hint" ${firstStep.hintHtml ? "" : 'style="display:none;"'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          </button>`
							: ""
					}
        </div>

        <div class="bk-steps-progress">
          <div class="bk-steps-dots">${stepDots}</div>
        </div>
      </div>
    </div>

    <aside class="bk-sim-inspector" aria-label="Step-by-step inspector">
      <div class="bk-steps-banner">
        <div class="bk-steps-banner-row">
          <div class="bk-steps-title-group">
            <h4 class="bk-steps-step-title">${escHtml(firstStep.title)}</h4>
            ${firstStep.targetHtml ? `<span class="bk-steps-step-target">${firstStep.targetHtml}</span>` : ""}
          </div>
        </div>
        <div class="bk-steps-instruction"${initialInstruction ? "" : ' style="display:none;"'}>
          <span class="bk-steps-instruction-text">${initialInstruction}</span>
        </div>
        <div class="bk-steps-hint-popover" hidden>
          <div class="bk-steps-hint-header">
            <span class="bk-steps-hint-label">Hint</span>
            <button type="button" class="bk-steps-hint-close" aria-label="Close hint">&times;</button>
          </div>
          <div class="bk-steps-hint-content">${firstStep.hintHtml || ""}</div>
        </div>
      </div>

        <div class="bk-sr-only bk-steps-announcement" role="status" aria-live="polite" aria-atomic="true"></div>
        <div class="bk-steps-feedback" hidden>
          <div class="bk-steps-feedback-badge">Step Complete</div>
          <div class="bk-steps-feedback-msg"></div>
          <button type="button" class="bk-steps-feedback-next">Next Step &rarr;</button>
          <button type="button" class="bk-steps-feedback-restart" style="display:none;">Restart Steps &#8635;</button>
        </div>

      ${inspectorContent}

    </aside>
  </div>

  ${telemetrySchemaScript}
  <script type="application/json" class="bk-measurements-config">${escapeScriptJson(block.measurements ?? {})}</script>
  ${block.caption ? `<figcaption class="bk-caption">${mdInline(block.caption)}</figcaption>` : ""}
  <script type="application/json" class="bk-steps-default-props">${escapeScriptJson(block.props ?? {})}</script>
  <script type="application/json" class="bk-steps-data">${stepsJson}</script>
</figure>`;

	return {
		html,
		navItems: [{ id, label, kind: "simulation" }],
	};
}
