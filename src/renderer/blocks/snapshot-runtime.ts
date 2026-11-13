export const snapshotRuntimeCode = `
window.__bkSnapshotHandlers = null;
window.__bkInitialSnapshot = null;
window.__bkSnapshotTelemetry = null;

function __bkDeepClone(value) {
  if (value === null || typeof value !== "object") return value;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch (_) {}
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    if (Array.isArray(value)) {
      return value.map(function(item) { return __bkDeepClone(item); });
    }
    var copy = {};
    for (var key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        try {
          copy[key] = __bkDeepClone(value[key]);
        } catch (_) {
          copy[key] = value[key];
        }
      }
    }
    return copy;
  }
}

function __bkCaptureSnapshotImage() {
  return new Promise(function(resolve) {
    try {
      var width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
      var height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
      var scale = Math.min(window.devicePixelRatio || 1, 2, 2048 / width, 2048 / height);
      var output = document.createElement("canvas");
      output.width = Math.max(1, Math.round(width * scale));
      output.height = Math.max(1, Math.round(height * scale));
      var ctx = output.getContext("2d");
      if (!ctx) throw new Error("Image capture is unavailable in this browser.");
      ctx.scale(scale, scale);
      var background = "#ffffff";
      if (typeof window.bkColor === "function") {
        try { background = window.bkColor("bg") || background; } catch (_) {}
      }
      for (var surface of [document.documentElement, document.body]) {
        if (!surface) continue;
        var color = window.getComputedStyle(surface).backgroundColor;
        if (color && color !== "transparent" && color !== "rgba(0, 0, 0, 0)") background = color;
      }
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
      var visible = function(element) {
        var rect = element.getBoundingClientRect();
        var style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < width && rect.top < height && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) !== 0;
      };
      // Capture scene bounds so viewport letterboxing does not become part of the image.
      var encodeScene = function(rects) {
        var left = Math.max(0, Math.min.apply(null, rects.map(function(r) { return r.left; })));
        var top = Math.max(0, Math.min.apply(null, rects.map(function(r) { return r.top; })));
        var right = Math.min(width, Math.max.apply(null, rects.map(function(r) { return r.right; })));
        var bottom = Math.min(height, Math.max.apply(null, rects.map(function(r) { return r.bottom; })));
        var cropped = document.createElement("canvas");
        cropped.width = Math.max(1, Math.round((right - left) * scale));
        cropped.height = Math.max(1, Math.round((bottom - top) * scale));
        var cropContext = cropped.getContext("2d");
        if (!cropContext) throw new Error("Image capture is unavailable in this browser.");
        cropContext.drawImage(output, left * scale, top * scale, (right - left) * scale, (bottom - top) * scale, 0, 0, cropped.width, cropped.height);
        return cropped.toDataURL("image/png");
      };
      var canvases = Array.from(document.querySelectorAll("canvas")).filter(visible);
      canvases.sort(function(a, b) {
        return (parseInt(window.getComputedStyle(a).zIndex, 10) || 0) - (parseInt(window.getComputedStyle(b).zIndex, 10) || 0);
      });
      if (canvases.length) {
        for (var canvas of canvases) {
          var rect = canvas.getBoundingClientRect();
          ctx.globalAlpha = Number(window.getComputedStyle(canvas).opacity || 1);
          ctx.drawImage(canvas, rect.left, rect.top, rect.width, rect.height);
        }
        resolve({ imageDataUrl: encodeScene(canvases.map(function(canvas) { return canvas.getBoundingClientRect(); })) });
        return;
      }
      var scenes = Array.from(document.querySelectorAll("svg")).filter(visible);
      scenes.sort(function(a, b) {
        var ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
        return br.width * br.height - ar.width * ar.height;
      });
      if (!scenes.length) throw new Error("This simulation has no canvas or SVG scene to capture.");
      var scene = scenes[0];
      var bounds = scene.getBoundingClientRect();
      var copy = scene.cloneNode(true);
      copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      copy.setAttribute("width", String(bounds.width));
      copy.setAttribute("height", String(bounds.height));
      copy.style.color = window.getComputedStyle(scene).color;
      var css = document.createElementNS("http://www.w3.org/2000/svg", "style");
      css.textContent = Array.from(document.querySelectorAll("style")).map(function(style) { return style.textContent; }).join("\\n");
      copy.insertBefore(css, copy.firstChild);
      var image = new window.Image();
      var imageTimer = window.setTimeout(function() { resolve({ imageError: "The SVG image took too long to capture." }); }, 1500);
      image.onload = function() {
        window.clearTimeout(imageTimer);
        try {
          ctx.drawImage(image, bounds.left, bounds.top, bounds.width, bounds.height);
          resolve({ imageDataUrl: encodeScene([bounds]) });
        } catch (_) {
          resolve({ imageError: "The scene image could not be saved because it contains restricted content." });
        }
      };
      image.onerror = function() {
        window.clearTimeout(imageTimer);
        resolve({ imageError: "The SVG scene could not be captured." });
      };
      image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new window.XMLSerializer().serializeToString(copy));
    } catch (err) {
      resolve({ imageError: String(err && err.message ? err.message : err) });
    }
  });
}

function __bkCaptureInitialSnapshot() {
  var handlers = window.__bkSnapshotHandlers;
  if (!handlers || typeof handlers.capture !== "function") return;
  try {
    var raw = handlers.capture();
    if (raw === undefined || raw === null) return;
    if (raw && typeof raw.then === "function") {
      console.warn("mr-md: Async snapshot capture is not supported; capture handler must be synchronous.");
      return;
    }
    var rawTime = (raw && typeof raw.time === "number" && Number.isFinite(raw.time)) ? raw.time : 0;
    var rawProps = (raw && raw.props && typeof raw.props === "object") ? raw.props : (window.__simProps || {});
    window.__bkInitialSnapshot = {
      state: __bkDeepClone(raw),
      props: __bkDeepClone(rawProps),
      telemetry: __bkDeepClone(window.__bkSnapshotTelemetry || {}),
      time: rawTime
    };
  } catch (_) {}
}

window.bkRegisterSnapshot = function(handlers) {
  if (!handlers || typeof handlers !== "object") {
    console.warn("mr-md: bkRegisterSnapshot requires an object with capture and restore functions.");
    return;
  }
  var captureFn = typeof handlers.capture === "function" ? handlers.capture : (typeof handlers.getSnapshot === "function" ? handlers.getSnapshot : null);
  var restoreFn = typeof handlers.restore === "function" ? handlers.restore : (typeof handlers.restoreSnapshot === "function" ? handlers.restoreSnapshot : null);

  if (!captureFn || !restoreFn) {
    console.warn("mr-md: bkRegisterSnapshot requires both capture (or getSnapshot) and restore (or restoreSnapshot) functions.");
    return;
  }

  window.__bkSnapshotHandlers = {
    capture: captureFn,
    restore: restoreFn
  };

  __bkCaptureInitialSnapshot();

  if (window.parent && window.parent !== window) {
    try {
      window.parent.postMessage({
        type: "bk:snapshot-capabilities",
        supported: true,
        capabilities: {
          exactState: true,
          customProps: true
        }
      }, "*");
    } catch (_) {}
  }
};

window.bkOnSnapshot = function(captureFn) {
  window.__bkSnapshotHandlers = window.__bkSnapshotHandlers || {};
  window.__bkSnapshotHandlers.capture = captureFn;
  if (typeof window.__bkSnapshotHandlers.restore === "function") {
    __bkCaptureInitialSnapshot();
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({
          type: "bk:snapshot-capabilities",
          supported: true,
          capabilities: { exactState: true, customProps: true }
        }, "*");
      } catch (_) {}
    }
  }
};

window.bkOnRestore = function(restoreFn) {
  window.__bkSnapshotHandlers = window.__bkSnapshotHandlers || {};
  window.__bkSnapshotHandlers.restore = restoreFn;
  if (typeof window.__bkSnapshotHandlers.capture === "function") {
    __bkCaptureInitialSnapshot();
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({
          type: "bk:snapshot-capabilities",
          supported: true,
          capabilities: { exactState: true, customProps: true }
        }, "*");
      } catch (_) {}
    }
  }
};

if (window.defineSimulation) {
  var _origDefineSimulation = window.defineSimulation;
  window.defineSimulation = function(options) {
    var instance = _origDefineSimulation(options);
    if (instance && typeof instance === "object") {
      var origReset = instance.onReset;
      if (typeof origReset === "function") {
        instance.onReset = function(fn) {
          return origReset.call(instance, function() {
            window.__bkInitialSnapshot = null;
            window.__bkSnapshotTelemetry = null;
            if (typeof fn === "function") fn.apply(this, arguments);
            __bkCaptureInitialSnapshot();
          });
        };
      }
      var publish = instance.publishTelemetry;
      if (typeof publish === "function") {
        instance.publishTelemetry = function(data) {
          window.__bkSnapshotTelemetry = Object.assign({}, window.__bkSnapshotTelemetry || {}, data);
          if (!window.__bkInitialSnapshot) {
            __bkCaptureInitialSnapshot();
          } else if (data && typeof data === "object") {
            if (!window.__bkInitialSnapshot.telemetry || Object.keys(window.__bkInitialSnapshot.telemetry).length === 0) {
              window.__bkInitialSnapshot.telemetry = __bkDeepClone(data);
            }
          }
          return publish.call(instance, data);
        };
      }
      instance.onSnapshot = function(fn) {
        window.bkOnSnapshot(fn);
        return instance;
      };
      instance.onRestore = function(fn) {
        window.bkOnRestore(fn);
        return instance;
      };
    }
    return instance;
  };
}

window.addEventListener("message", function(event) {
  if (event.source !== window.parent || !event.data || typeof event.data !== "object") return;

  if (["bk:reset", "bk:telemetry-reset", "bk:steps-set-step", "bk:steps-reset-step"].includes(event.data.type)) {
    window.__bkInitialSnapshot = null;
    window.__bkSnapshotTelemetry = null;
    return;
  }
  if (event.data.type === "bk:snapshot-query-capabilities") {
    var hasOptIn = Boolean(
      window.__bkSnapshotHandlers &&
      typeof window.__bkSnapshotHandlers.capture === "function" &&
      typeof window.__bkSnapshotHandlers.restore === "function"
    );
    window.parent.postMessage({
      type: "bk:snapshot-capabilities",
      supported: hasOptIn,
      capabilities: {
        exactState: hasOptIn,
        customProps: true
      },
      reason: hasOptIn ? undefined : "Simulation has not opted in to exact state snapshots via window.bkRegisterSnapshot"
    }, "*");
  } else if (event.data.type === "bk:snapshot-capture") {
    var captureRequest = Object.assign({}, event.data);
    var captureSnapshot = function() {
      var reqId = captureRequest.id || String(Date.now());
      var handlers = window.__bkSnapshotHandlers;
      if (handlers && typeof handlers.capture === "function") {
        try {
          if (captureRequest.initial === true && !window.__bkInitialSnapshot) {
            __bkCaptureInitialSnapshot();
          }
          var initial = captureRequest.initial === true ? window.__bkInitialSnapshot : null;
          var rawState = initial ? initial.state : handlers.capture();
          if (rawState && typeof rawState.then === "function") {
            window.parent.postMessage({
              type: "bk:snapshot-data",
              id: reqId,
              success: false,
              isExact: false,
              error: "Async snapshot capture is not supported; capture handler must be synchronous",
              props: Object.assign({}, window.__simProps || {})
            }, "*");
            return;
          }
          var clonedState = __bkDeepClone(rawState);
          var rawProps = (rawState && rawState.props && typeof rawState.props === "object") ? rawState.props : Object.assign({}, window.__simProps || {});
          var clonedProps = __bkDeepClone(rawProps);
          var stateTime = (rawState && typeof rawState.time === "number" && Number.isFinite(rawState.time)) ? rawState.time : (typeof captureRequest.time === "number" ? captureRequest.time : (initial ? initial.time : 0));
          var response = {
            type: "bk:snapshot-data",
            id: reqId,
            success: true,
            isExact: true,
            state: clonedState,
            telemetry: Object.assign({}, initial ? initial.telemetry : window.__bkSnapshotTelemetry || {}),
            time: initial ? initial.time : stateTime,
            props: initial ? __bkDeepClone(initial.props) : clonedProps
          };
          if (captureRequest.includeImage === true && !initial) {
            __bkCaptureSnapshotImage().then(function(image) {
              window.parent.postMessage(Object.assign(response, image), "*");
            });
          } else {
            if (captureRequest.includeImage === true) response.imageError = "An image is available only for the current simulation state.";
            window.parent.postMessage(response, "*");
          }
        } catch (err) {
          window.parent.postMessage({
            type: "bk:snapshot-data",
            id: reqId,
            success: false,
            isExact: false,
            error: String(err && err.message ? err.message : err),
            props: Object.assign({}, window.__simProps || {})
          }, "*");
        }
      } else {
        window.parent.postMessage({
          type: "bk:snapshot-data",
          id: reqId,
          success: false,
          isExact: false,
          error: "Simulation has not opted in to exact state snapshots (window.bkRegisterSnapshot not called)",
          props: Object.assign({}, window.__simProps || {})
        }, "*");
      }
    };
    if (captureRequest.includeImage === true && typeof window.requestAnimationFrame === "function") {
      // The simulation's queued draw runs first, leaving WebGL pixels available for readback.
      window.requestAnimationFrame(captureSnapshot);
    } else {
      captureSnapshot();
    }
  } else if (event.data.type === "bk:snapshot-restore") {
    var reqId = event.data.id || String(Date.now());
    var snapshot = event.data.snapshot;
    var handlers = window.__bkSnapshotHandlers;
    if (!snapshot) {
      window.parent.postMessage({
        type: "bk:snapshot-restored",
        id: reqId,
        success: false,
        isExact: false,
        error: "No snapshot provided"
      }, "*");
      return;
    }
    if (!handlers || typeof handlers.restore !== "function") {
      window.parent.postMessage({
        type: "bk:snapshot-restored",
        id: reqId,
        success: false,
        isExact: false,
        error: "Exact state restoration requires simulation opt-in via window.bkRegisterSnapshot({ restore: ... })"
      }, "*");
      return;
    }
    try {
      window.__bkRestoring = true;
      if (event.data.resumePlayback) {
        window.__loop = true;
        if (typeof window.__startLoop === "function") window.__startLoop();
      } else {
        window.__loop = false;
        if (typeof window.__stopLoop === "function") window.__stopLoop();
      }
      if (snapshot.props && typeof snapshot.props === "object") {
        window.__simProps = __bkDeepClone(snapshot.props);
        try {
          var Ctr = typeof window.CustomEvent === "function" ? window.CustomEvent : (typeof CustomEvent === "function" ? CustomEvent : null);
          if (Ctr) {
            window.dispatchEvent(new Ctr("bk:props", { detail: window.__simProps }));
          }
        } catch (_) {
          try {
            var evt = window.document.createEvent("CustomEvent");
            evt.initCustomEvent("bk:props", false, false, window.__simProps);
            window.dispatchEvent(evt);
          } catch (__ignored) {}
        }
      }
      var restoredState = __bkDeepClone(snapshot.state);
      var restoreResult = handlers.restore(restoredState, snapshot.props, snapshot.time);
      if (restoreResult && typeof restoreResult.then === "function") {
        window.__bkRestoring = false;
        window.parent.postMessage({
          type: "bk:snapshot-restored",
          id: reqId,
          success: false,
          isExact: false,
          error: "Async snapshot restore is not supported; restore handler must be synchronous"
        }, "*");
        return;
      }
      if (typeof window.__renderFrame === "function") window.__renderFrame();
      window.__bkRestoring = false;
      window.parent.postMessage({
        type: "bk:snapshot-restored",
        id: reqId,
        success: true,
        isExact: true,
        time: snapshot.time,
        props: __bkDeepClone(window.__simProps)
      }, "*");
    } catch (err) {
      window.__bkRestoring = false;
      window.parent.postMessage({
        type: "bk:snapshot-restored",
        id: reqId,
        success: false,
        isExact: false,
        error: String(err && err.message ? err.message : err)
      }, "*");
    }
  }
});

var __bkInteractionSequence = 0;
var __bkPointerInteractions = new Map();
var __bkKeyInteractions = new Map();
window.bkBeginInteraction = function(label) {
  var id = "user-" + Date.now() + "-" + (++__bkInteractionSequence);
  label = typeof label === "string" ? label.trim().slice(0, 120) : "";
  label = label || "Scene interaction";
  var send = function(phase) {
    if (window.parent && window.parent !== window) {
      try { window.parent.postMessage({ type: "bk:scene-interaction", phase: phase, id: id, label: label }, "*"); } catch (_) {}
    }
  };
  send("start");
  var ended = false;
  return function() {
    if (ended) return;
    ended = true;
    send("end");
    if (typeof redrawPausedInteraction === "function") redrawPausedInteraction();
  };
};
function __bkFinishInteraction(interactions, key) {
  var end = interactions.get(key);
  if (end) end();
  interactions.delete(key);
}
window.addEventListener("pointerdown", function(e) {
  __bkFinishInteraction(__bkPointerInteractions, e.pointerId);
  var label = e.target && e.target.closest && e.target.closest("[data-bk-interaction-label]");
  __bkPointerInteractions.set(e.pointerId, window.bkBeginInteraction(label && label.getAttribute("data-bk-interaction-label")));
}, { capture: true, passive: true });
for (var eventType of ["pointerup", "pointercancel", "lostpointercapture"]) {
  window.addEventListener(eventType, function(e) { __bkFinishInteraction(__bkPointerInteractions, e.pointerId); }, { capture: true, passive: true });
}
window.addEventListener("keydown", function(e) {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || ["Tab", "Escape", " ", "Space", "Spacebar", "r", "R", "Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
  if (!__bkKeyInteractions.has(e.code || e.key)) __bkKeyInteractions.set(e.code || e.key, window.bkBeginInteraction("Keyboard interaction"));
}, { capture: true, passive: true });
window.addEventListener("keyup", function(e) { __bkFinishInteraction(__bkKeyInteractions, e.code || e.key); }, { capture: true, passive: true });
window.addEventListener("blur", function() {
  for (var key of __bkPointerInteractions.keys()) __bkFinishInteraction(__bkPointerInteractions, key);
  for (var key of __bkKeyInteractions.keys()) __bkFinishInteraction(__bkKeyInteractions, key);
});
`;
