// @ts-nocheck
import {
	bkInitInteractiveFrames,
	bkWireInteractiveFrames,
} from "./interactive.js";
import { bkWireQuizzes } from "./quiz.js";
import { bkInitRouter } from "./router.js";
import { bkInitSimControls, bkWireSimControls } from "./simulation.js";
import { bkWireThemeControls } from "./theme.js";
import {
	bkInitCodeCopy,
	bkWireCodeCopy,
	bkWireLastLessonTracking,
	bkWireMaximizeControls,
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
	bkWireQuizzes();
}

function initOnPageLoad() {
	bkInitCodeCopy();
	bkInitSimControls();
	bkInitInteractiveFrames();
	bkWireScrollSpy();
	bkWireLastLessonTracking();
}

document.addEventListener("DOMContentLoaded", () => {
	wireOnce();
	initOnPageLoad();
});

window.addEventListener("bk-page-loaded", () => {
	initOnPageLoad();
});
