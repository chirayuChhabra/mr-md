// @ts-nocheck
import {
	bkInitInteractiveFrames,
	bkWireInteractiveFrames,
} from "./interactive.js";
import { bkWireQuizzes } from "./quiz.js";
import { bkInitRouter } from "./router.js";
import { bkInitCodeRunners, bkWireCodeRunners } from "./runner.js";
import { bkInitSimControls, bkWireSimControls } from "./simulation.js";
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

function wireOnce() {
	if (window.__bk_wired_once) return;
	window.__bk_wired_once = true;

	bkInitRouter();
	bkWireMaximizeControls();
	bkWireSidebarToggle();
	bkWireThemeControls();
	bkWireSimControls();
	bkWireInteractiveFrames();
	bkWireCodeCopy();
	bkWireCodeRunners();
	bkWireQuizzes();
}

function initOnPageLoad() {
	bkInitCodeCopy();
	bkInitCodeRunners();
	bkInitSimControls();
	bkInitInteractiveFrames();
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
