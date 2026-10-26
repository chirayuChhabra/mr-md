import { escAttr } from "./utils.js";

export function stepsIframeDoc(
	js: string,
	props: string,
	dependencies?: string[],
): string {
	const scriptTags = (dependencies ?? [])
		.map((url) => `<script src="${escAttr(url)}"></script>`)
		.join("\n");
	const simJsBase64 = Buffer.from(js).toString("base64");
	const doc = `<!DOCTYPE html><html><head>
${scriptTags}
<style>
  html, body {
    height: 100%;
    width: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  canvas {
    display: block;
    touch-action: none;
    transform-origin: center center;
    flex-shrink: 0;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
</style>
</head><body>
<canvas id="c" width="800" height="450"></canvas>
<script id="bk-sim-props" type="application/json">${props}</script>
<script>
window.__simProps = JSON.parse(document.getElementById("bk-sim-props").textContent || "{}");
window.__loop = false;
window.bkSetupCalled = false;
window.__bkTheme = { colors: {}, theme: "light", palette: "ink", ui: "standard" };
window.__bkStepCallbacks = [];
window.__bkResetCallbacks = [];
window.__currentStepIndex = typeof window.__simProps.step === "number" ? window.__simProps.step : 0;
window.__currentStepData = null;
window.__renderFrame = function() {};
window.__startLoop = function() { window.__loop = true; };
window.__stopLoop = function() { window.__loop = false; };

window.addEventListener("error", function(e) {
  console.error("Simulation Error:", e.error || e.message);
  const errDiv = document.createElement("div");
  errDiv.style.cssText = "position:absolute;inset:0;padding:20px;color:#ef4444;background:rgba(15,23,42,0.96);font-family:monospace;font-size:13px;z-index:9999;overflow:auto;";
  errDiv.innerHTML = "<h4 style='margin:0 0 8px;color:#f87171;'>Simulation Error</h4><pre style='white-space:pre-wrap;margin:0;'>" + (e.error ? (e.error.stack || e.error.message) : e.message) + "</pre>";
  document.body.appendChild(errDiv);
});

window.addEventListener("unhandledrejection", function(e) {
  console.error("Simulation Promise Rejection:", e.reason);
  const errDiv = document.createElement("div");
  errDiv.style.cssText = "position:absolute;inset:0;padding:20px;color:#ef4444;background:rgba(15,23,42,0.96);font-family:monospace;font-size:13px;z-index:9999;overflow:auto;";
  const msg = e.reason ? (e.reason.stack || e.reason.message || String(e.reason)) : "Unhandled Promise Rejection";
  errDiv.innerHTML = "<h4 style='margin:0 0 8px;color:#f87171;'>Simulation Promise Rejection</h4><pre style='white-space:pre-wrap;margin:0;'>" + msg + "</pre>";
  document.body.appendChild(errDiv);
});

window.bkThemeMode = function() {
  const rootTheme = window.__bkTheme.theme;
  if (rootTheme === "auto") {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? "dark" : "light";
  }
  return rootTheme || "light";
};

window.bkColor = function(name) {
  if (window.__bkTheme.colors && window.__bkTheme.colors[name]) {
    return window.__bkTheme.colors[name];
  }
  const isDark = window.bkThemeMode() === "dark";
  switch (name) {
    case "bg": return isDark ? "#080c14" : "#f8fafc";
    case "paper": return isDark ? "#0f172a" : "#ffffff";
    case "line": return isDark ? "#1e293b" : "#e2e8f0";
    case "line-strong": return isDark ? "#334155" : "#cbd5e1";
    case "text": return isDark ? "#f8fafc" : "#0f172a";
    case "text-light": return isDark ? "#94a3b8" : "#64748b";
    case "accent": return isDark ? "#38bdf8" : "#0284c7";
    case "accent-soft": return isDark ? "rgba(56, 189, 248, 0.15)" : "rgba(2, 132, 199, 0.1)";
    default: return isDark ? "#ffffff" : "#000000";
  }
};

window.bkUi = function() {
  return window.__bkTheme.ui || "standard";
};

window.addEventListener("message", function(e) {
  if (e.source !== window.parent || !e.data) return;
  if (e.data.type === "bk:theme-sync") {
    window.__bkTheme = e.data.state;
    const bg = window.bkColor("bg");
    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;
    window.dispatchEvent(new CustomEvent("bk:theme-changed", { detail: window.__bkTheme }));
    if (!window.__loop && typeof window.__renderFrame === "function") {
      window.__renderFrame();
    }
  } else if (e.data.type === "bk:steps-set-step") {
    if (typeof window.__stopLoop === "function") {
      window.__stopLoop();
    } else {
      window.__loop = false;
    }
    window.__currentStepIndex = e.data.stepIndex ?? 0;
    window.__currentStepData = e.data.step || null;
    const stepProps = e.data.props || e.data.step?.initialProps || {};
    window.__simProps = { ...window.__simProps, ...stepProps, step: window.__currentStepIndex };
    window.dispatchEvent(new CustomEvent("bk:props", { detail: window.__simProps }));
    window.__bkStepCallbacks.forEach(function(fn) {
      try { fn(window.__currentStepIndex, window.__currentStepData, window.__simProps); } catch(err) { console.error(err); }
    });
    if (typeof window.__renderFrame === "function") {
      window.__renderFrame();
    }
  } else if (e.data.type === "bk:steps-reset-step") {
    if (typeof window.__stopLoop === "function") {
      window.__stopLoop();
    } else {
      window.__loop = false;
    }
    if (e.data.props) {
      window.__simProps = { ...window.__simProps, ...e.data.props, step: window.__currentStepIndex };
      window.dispatchEvent(new CustomEvent("bk:props", { detail: window.__simProps }));
    }
    window.__bkResetCallbacks.forEach(function(fn) {
      try { fn(window.__currentStepIndex, window.__currentStepData); } catch(err) { console.error(err); }
    });
    if (typeof window.__renderFrame === "function") {
      window.__renderFrame();
    }
  } else if (e.data.type === "bk:set-props") {
    window.__simProps = { ...window.__simProps, ...e.data.props };
    window.dispatchEvent(new CustomEvent("bk:props", { detail: window.__simProps }));
    if (window.__loop && typeof window.__startLoop === "function") {
      window.__startLoop();
    } else if (typeof window.__renderFrame === "function") {
      window.__renderFrame();
    }
  } else if (e.data.type === "bk:sim-play-state") {
    if (e.data.playing) {
      if (typeof window.__startLoop === "function") window.__startLoop();
      else window.__loop = true;
    } else {
      if (typeof window.__stopLoop === "function") window.__stopLoop();
      else window.__loop = false;
    }
  } else if (e.data.type === "bk:play") {
    if (typeof window.__startLoop === "function") window.__startLoop();
    else window.__loop = true;
  } else if (e.data.type === "bk:pause") {
    if (typeof window.__stopLoop === "function") window.__stopLoop();
    else window.__loop = false;
  }
});

if (window.parent && window.parent !== window) {
  window.parent.postMessage({ type: "bk:request-theme" }, "*");
  window.parent.postMessage({ type: "bk:steps-ready" }, "*");
  window.addEventListener("pointerdown", function() {
    window.parent.postMessage({ type: "bk:steps-user-interacted" }, "*");
  }, { passive: true });
  window.addEventListener("keydown", function(e) {
    if (e.defaultPrevented) return;
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable)) {
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === " " || e.key === "r" || e.key === "R") {
      if (e.key === " ") {
        e.preventDefault();
      }
      window.parent.postMessage({
        type: "bk:steps-keydown",
        key: e.key
      }, "*");
    }
  });
}

window.bkCanvasPoint = function(event, canvas) {
  const c = canvas || event.currentTarget || event.target;
  const rect = c.getBoundingClientRect();
  const logicalW = c.__bkLogicalW || 800;
  const logicalH = c.__bkLogicalH || 450;
  const clientX = event.clientX !== undefined ? event.clientX : (event.touches?.[0]?.clientX ?? event.changedTouches?.[0]?.clientX ?? 0);
  const clientY = event.clientY !== undefined ? event.clientY : (event.touches?.[0]?.clientY ?? event.changedTouches?.[0]?.clientY ?? 0);
  return {
    x: rect.width ? ((clientX - rect.left) * logicalW) / rect.width : 0,
    y: rect.height ? ((clientY - rect.top) * logicalH) / rect.height : 0
  };
};

window.bkFitCanvas = function(c, requestedW, requestedH) {
  if (!c) return { scale: 1, width: requestedW, height: requestedH, cssScale: 1 };
  const dpr = window.devicePixelRatio || 1;
  const w = requestedW || 800;
  const h = requestedH || 450;
  c.__bkLogicalW = w;
  c.__bkLogicalH = h;
  c.style.width = w + "px";
  c.style.height = h + "px";
  c.style.position = "relative";
  c.style.transformOrigin = "center center";
  const scaleX = window.innerWidth / w;
  const scaleY = window.innerHeight / h;
  const cssScale = Math.min(scaleX, scaleY);
  c.style.transform = "scale(" + cssScale + ")";
  const physW = Math.max(1, Math.round(w * dpr));
  const physH = Math.max(1, Math.round(h * dpr));
  if (c.width !== physW || c.height !== physH) {
    c.width = physW;
    c.height = physH;
  }
  return { scale: dpr, width: w, height: h, cssScale };
};

window.bkOnStep = function(callback) {
  window.__bkStepCallbacks.push(callback);
  if (window.__currentStepData !== null) {
    try { callback(window.__currentStepIndex, window.__currentStepData, window.__simProps); } catch(err) { console.error(err); }
  }
};

window.bkOnReset = function(callback) {
  window.__bkResetCallbacks.push(callback);
};

window.bkSetup = function(requestedW, requestedH, loopFn) {
  window.bkSetupCalled = true;
  const canvas = document.getElementById("c");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let loopId = null;
  let cachedFit = window.bkFitCanvas(canvas, requestedW || 800, requestedH || 450);

  function renderFrame() {
    if (window.innerWidth >= 32 && window.innerHeight >= 32) {
      cachedFit = window.bkFitCanvas(canvas, requestedW || 800, requestedH || 450);
      ctx.save();
      ctx.scale(cachedFit.scale, cachedFit.scale);
      loopFn(ctx, cachedFit.width, cachedFit.height);
      ctx.restore();
    }
  }
  window.__renderFrame = renderFrame;

  function loop() {
    renderFrame();
    if (window.__loop) {
      loopId = requestAnimationFrame(loop);
    } else {
      loopId = null;
    }
  }

  window.__startLoop = function() {
    window.__loop = true;
    if (!loopId) {
      loop();
    }
  };

  window.__stopLoop = function() {
    window.__loop = false;
    if (loopId) {
      cancelAnimationFrame(loopId);
      loopId = null;
    }
  };

  function initDraw() {
    if (window.innerWidth >= 32 && window.innerHeight >= 32) {
      cachedFit = window.bkFitCanvas(canvas, requestedW || 800, requestedH || 450);
      loop();
    } else {
      requestAnimationFrame(initDraw);
    }
  }
  initDraw();

  function handleResize() {
    cachedFit = window.bkFitCanvas(canvas, requestedW || 800, requestedH || 450);
    if (!window.__loop) {
      renderFrame();
    }
  }

  window.addEventListener("resize", handleResize);
  window.addEventListener("bk:theme-changed", () => {
    if (!window.__loop) {
      renderFrame();
    }
  });
};

window.bkCompleteStep = function(stepIndexOrMsg, feedbackMsg) {
  let stepIdx = window.__currentStepIndex || 0;
  let msg = "";
  let voice = undefined;
  if (typeof stepIndexOrMsg === "object" && stepIndexOrMsg !== null) {
    stepIdx = stepIndexOrMsg.stepIndex !== undefined ? stepIndexOrMsg.stepIndex : (window.__currentStepIndex || 0);
    msg = stepIndexOrMsg.feedback || stepIndexOrMsg.message || "";
    voice = stepIndexOrMsg.voice;
  } else if (typeof stepIndexOrMsg === "number") {
    stepIdx = stepIndexOrMsg;
    msg = feedbackMsg || "";
  } else if (typeof stepIndexOrMsg === "string") {
    msg = stepIndexOrMsg;
    if (typeof feedbackMsg === "string") voice = feedbackMsg;
  }
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({
      type: "bk:steps-complete",
      stepIndex: stepIdx,
      feedback: msg,
      voice: voice
    }, "*");
  }
};
</script>
<script src="data:text/javascript;charset=utf-8;base64,${simJsBase64}"></script>
</body></html>`;
	return escAttr(doc);
}
