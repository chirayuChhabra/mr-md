// @ts-nocheck

import { bkInitInspectors } from "./inspector.js";
import {
	bkInitInteractiveFrames,
	bkWireInteractiveFrames,
} from "./interactive.js";
import { bkInitMedia, bkWireMedia } from "./media.js";
import { bkWireQuizzes } from "./quiz.js";
import { bkInitRouter } from "./router.js";
import { bkInitCodeRunners, bkWireCodeRunners } from "./runner.js";
import { bkInitSimControls, bkWireSimControls } from "./simulation.js";
import { bkInitSteps, bkWireSteps } from "./steps.js";
import { bkInitTelemetry, bkWireTelemetry } from "./telemetry.js";
import { bkBroadcastTheme, bkWireThemeControls } from "./theme.js";
import {
	bkInitCodeCopy,
	bkWireCodeCopy,
	bkWireLastLessonTracking,
	bkWireMaximizeControls,
	bkWireScrollProgress,
	bkWireScrollSpy,
	bkWireSidebarToggle,
} from "./ui.js";
import { bkInitWorldPortals, bkWireWorldPortals } from "./world.js";

function wireOnce() {
	if (window.__bk_wired_once) return;
	window.__bk_wired_once = true;

	bkInitRouter();
	bkWireMedia();
	bkWireMaximizeControls();
	bkWireSidebarToggle();
	bkWireThemeControls();
	bkWireSimControls();
	bkWireTelemetry();
	bkWireInteractiveFrames();
	bkWireCodeCopy();
	bkWireCodeRunners();
	bkWireQuizzes();
	bkWireWorldPortals();
	bkWireSteps();
}

function initOnPageLoad() {
	bkInitMedia();
	bkInitCodeCopy();
	bkInitCodeRunners();
	bkInitSimControls();
	bkInitTelemetry();
	bkInitInspectors();
	bkInitInteractiveFrames();
	bkInitWorldPortals();
	bkInitSteps();
	bkWireScrollSpy();
	bkWireScrollProgress();
	bkWireLastLessonTracking();
	bkBroadcastTheme();
}

document.addEventListener("DOMContentLoaded", () => {
	wireOnce();
	initOnPageLoad();
});

window.addEventListener("bk-page-loaded", () => {
	initOnPageLoad();
});
