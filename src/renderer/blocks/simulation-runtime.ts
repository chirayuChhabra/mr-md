import { defineSimulation } from "../../simulation.js";

// Keep the injected global identical to the package's optional authoring import.
export const simulationAuthoringRuntime = `window.defineSimulation = ${defineSimulation.toString()};`;

export const workspaceKeyboardBridge = `
window.addEventListener("keydown", function(event) {
  if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target;
  const editable = target && target.closest && target.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="slider"], [role="combobox"]');
  if (event.key === "Escape") {
    event.preventDefault();
    window.parent.postMessage({ type: "bk:workspace-close" }, "*");
  } else if (!editable && ([" ", "Space", "Spacebar", "r", "R"].includes(event.key) || (typeof window.__currentStepIndex === "number" && ["ArrowLeft", "ArrowRight"].includes(event.key)))) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) window.parent.postMessage({ type: "bk:workspace-keydown", key: event.key }, "*");
  } else if (event.key === "Tab") {
    const focusable = Array.from(document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')).filter(function(el) {
      return !el.disabled && el.tabIndex >= 0 && el.getClientRects().length > 0 && !el.closest('[hidden], [inert]');
    });
    const current = document.activeElement;
    if (!focusable.length || (event.shiftKey ? current === focusable[0] : current === focusable[focusable.length - 1]) || !focusable.includes(current)) {
      event.preventDefault();
      window.parent.postMessage({ type: "bk:workspace-focus", direction: event.shiftKey ? "backward" : "forward" }, "*");
    }
  }
}, true);
`;

export const pausedInteractionRuntime = `
let pausedInteractionFrame = null;
function redrawPausedInteraction() {
  if (window.__loop || pausedInteractionFrame !== null) return;
  pausedInteractionFrame = requestAnimationFrame(function() {
    pausedInteractionFrame = null;
    if (!window.__loop && !window.__bkRestoring) window.__renderFrame?.();
  });
}
for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "keydown", "keyup"]) {
  window.addEventListener(type, redrawPausedInteraction, { capture: true, passive: true });
}
`;
