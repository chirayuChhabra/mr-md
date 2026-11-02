import { escAttr } from "./utils.js";

export function iframeDoc(
	js: string,
	props: string,
	loop?: boolean,
	dependencies?: string[],
	isWorld?: boolean,
): string {
	const scriptTags = (dependencies ?? [])
		.map((url) => `<script src="${escAttr(url)}"></script>`)
		.join("\\n");
	const simJsBase64 = Buffer.from(js).toString("base64");
	const doc = `<!DOCTYPE html><html><head>
${scriptTags}
<style>
  html, body { height: 100%; width: 100%; margin: 0; padding: 0; overflow: hidden; background: transparent; display: flex; align-items: center; justify-content: center; }
  canvas { display: block; touch-action: none; transform-origin: center center; flex-shrink: 0; }
  body { font-family: sans-serif; user-select: none; }
</style>
</head><body>
<canvas id="c" width="800" height="500"></canvas>
<script id="bk-sim-props" type="application/json">${props}</script>
<script>
window.__simProps=JSON.parse(document.getElementById("bk-sim-props").textContent || "{}");
window.__loop=${loop ?? false};
window.__isWorld=${isWorld ? "true" : "false"};
window.bkSetupCalled = false;
window.__bkTheme = { colors: {}, theme: "light", palette: "ink", ui: "standard" };
window.bkColor = function(name) {
  const fallbacks = {
    bg: "#0a0d14",
    paper: "#121722",
    accent: "#38bdf8",
    "accent-soft": "rgba(56, 189, 248, 0.2)",
    text: "#f1f5f9",
    "text-light": "#94a3b8",
    line: "rgba(255, 255, 255, 0.12)",
    "line-strong": "rgba(255, 255, 255, 0.28)"
  };
  return (window.__bkTheme.colors && window.__bkTheme.colors[name]) || fallbacks[name] || "#ffffff";
};
window.bkUi = function() { return window.__bkTheme.ui; };
window.bkThemeMode = function() {
  const rootTheme = window.__bkTheme.theme;
  if (rootTheme === "auto") {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? "dark" : "light";
  }
  return rootTheme;
};
window.addEventListener("message", function(e) {
  if (e.source !== window.parent) return;
  if (e.data && e.data.type === "bk:theme-sync") {
    window.__bkTheme = e.data.state;
    const background = window.__bkTheme.colors && window.__bkTheme.colors.bg;
    if (background) {
      document.documentElement.style.backgroundColor = background;
      document.body.style.backgroundColor = background;
    }
    window.dispatchEvent(new CustomEvent("bk:theme-changed", { detail: window.__bkTheme }));
  }
});
if (window.parent && window.parent !== window) {
  window.parent.postMessage({ type: "bk:request-theme" }, "*");
}

${
	isWorld
		? `
window.addEventListener("keydown", function(e) {
  if (e.key === "Escape") {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "bk:world-exit" }, "*");
    }
  }
  if (e.key === "f" || e.key === "F") {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "bk:world-fullscreen-toggle" }, "*");
    }
  }
}, true);

window.bkFitCanvas = function(c) {
  if (!c) return { scale: 1, width: window.innerWidth, height: window.innerHeight };
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  c.__bkLogicalW = w;
  c.__bkLogicalH = h;
  c.style.width = w + "px";
  c.style.height = h + "px";
  c.style.transform = "none";
  const physW = Math.max(1, Math.round(w * dpr));
  const physH = Math.max(1, Math.round(h * dpr));
  if (c.width !== physW || c.height !== physH) {
    c.width = physW;
    c.height = physH;
  }
  return { scale: dpr, width: w, height: h };
};

var _camera = { x: 0, y: 0, zoom: 1.0 };
window.bkWorld = {
  camera: _camera,
  toWorld: function(clientX, clientY) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return {
      x: (clientX - (w / 2 + _camera.x)) / _camera.zoom,
      y: (clientY - (h / 2 + _camera.y)) / _camera.zoom
    };
  },
  toScreen: function(worldX, worldY) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return {
      x: worldX * _camera.zoom + (w / 2 + _camera.x),
      y: worldY * _camera.zoom + (h / 2 + _camera.y)
    };
  },
  resetCamera: function() {
    _camera.x = 0;
    _camera.y = 0;
    _camera.zoom = 1.0;
  },
  setCamera: function(x, y, zoom) {
    if (typeof x === "number") _camera.x = x;
    if (typeof y === "number") _camera.y = y;
    if (typeof zoom === "number") _camera.zoom = Math.max(0.05, Math.min(20, zoom));
  },
  get active() {
    return Boolean(window.__isWorld);
  }
};

var _isDragging = false;
var _dragStart = { x: 0, y: 0 };
var _keys = {};

window.addEventListener("pointerdown", function(e) {
  if (e.button !== 0 && e.pointerType === "mouse") return;
  _isDragging = true;
  _dragStart = { x: e.clientX, y: e.clientY };
});

window.addEventListener("pointermove", function(e) {
  if (!_isDragging) return;
  const dx = e.clientX - _dragStart.x;
  const dy = e.clientY - _dragStart.y;
  _camera.x += dx;
  _camera.y += dy;
  _dragStart = { x: e.clientX, y: e.clientY };
});

var _stopDrag = function() { _isDragging = false; };
window.addEventListener("pointerup", _stopDrag);
window.addEventListener("pointercancel", _stopDrag);

window.addEventListener("wheel", function(e) {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.12 : 0.89;
  const newZoom = Math.max(0.1, Math.min(10.0, _camera.zoom * factor));
  const w = window.innerWidth;
  const h = window.innerHeight;
  const mouseWorldX = (e.clientX - (w / 2 + _camera.x)) / _camera.zoom;
  const mouseWorldY = (e.clientY - (h / 2 + _camera.y)) / _camera.zoom;
  _camera.zoom = newZoom;
  _camera.x = e.clientX - w / 2 - mouseWorldX * _camera.zoom;
  _camera.y = e.clientY - h / 2 - mouseWorldY * _camera.zoom;
}, { passive: false });

window.addEventListener("keydown", function(e) {
  _keys[e.key.toLowerCase()] = true;
});
window.addEventListener("keyup", function(e) {
  _keys[e.key.toLowerCase()] = false;
});

window.bkSetup = function() {
  throw new Error("mr-md: In an explorable World simulation, use window.bkSetupWorld(function(ctx, world) { ... }) instead of window.bkSetup.");
};

window.bkSetupWorld = function(loopFn) {
  window.bkSetupCalled = true;
  const canvas = document.getElementById("c");
  if (!canvas || typeof loopFn !== "function") return;
  const ctx = canvas.getContext("2d");
  let loopId = null;
  let lastTime = performance.now();

  function renderFrame(time) {
    const now = typeof time === "number" ? time : performance.now();
    const dt = Math.min(0.1, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;

    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    window.bkFitCanvas(canvas);

    const speed = (500 * dt) / Math.max(0.2, _camera.zoom);
    if (_keys["w"] || _keys["arrowup"]) _camera.y += speed;
    if (_keys["s"] || _keys["arrowdown"]) _camera.y -= speed;
    if (_keys["a"] || _keys["arrowleft"]) _camera.x += speed;
    if (_keys["d"] || _keys["arrowright"]) _camera.x -= speed;

    if (w >= 16 && h >= 16) {
      ctx.save();
      ctx.scale(dpr, dpr);
      const worldObj = {
        width: w,
        height: h,
        camera: _camera,
        isWorld: true,
        props: window.__simProps || {}
      };

      ctx.save();
      ctx.translate(w / 2 + _camera.x, h / 2 + _camera.y);
      ctx.scale(_camera.zoom, _camera.zoom);
      loopFn(ctx, worldObj);
      ctx.restore();

      ctx.restore();
    }
    if (window.__loop) {
      loopId = requestAnimationFrame(renderFrame);
    } else {
      loopId = null;
    }
  }

  function start() {
    window.__loop = true;
    lastTime = performance.now();
    if (!loopId) loopId = requestAnimationFrame(renderFrame);
  }
  start();

  window.addEventListener("resize", function() {
    window.bkFitCanvas(canvas);
    if (!window.__loop && !loopId) requestAnimationFrame(renderFrame);
  });
  window.addEventListener("bk:theme-changed", function() {
    if (!window.__loop && !loopId) requestAnimationFrame(renderFrame);
  });
  window.addEventListener("message", function(event) {
    if (!event.data) return;
    if (event.data.type === "bk:play") start();
    else if (event.data.type === "bk:pause") { window.__loop = false; }
  });
};
`
		: `
window.bkCanvasPoint = function(event, canvas) {
  const c = canvas || event.currentTarget || event.target;
  const rect = c.getBoundingClientRect();
  const logicalW = c.__bkLogicalW || 800;
  const logicalH = c.__bkLogicalH || 500;
  const clientX = event.clientX !== undefined ? event.clientX : (event.touches?.[0]?.clientX ?? event.changedTouches?.[0]?.clientX ?? 0);
  const clientY = event.clientY !== undefined ? event.clientY : (event.touches?.[0]?.clientY ?? event.changedTouches?.[0]?.clientY ?? 0);
  return {
    x: rect.width ? ((clientX - rect.left) * logicalW) / rect.width : 0,
    y: rect.height ? ((clientY - rect.top) * logicalH) / rect.height : 0
  };
};
window.bkFitCanvas = function(c, requestedW, requestedH, options) {
  if (!c) return { scale: 1, width: requestedW, height: requestedH, cssScale: 1 };
  const dpr = window.devicePixelRatio || 1;
  const w = requestedW;
  const h = requestedH;
  
  c.__bkLogicalW = w;
  c.__bkLogicalH = h;
  
  c.style.width = w + "px";
  c.style.height = h + "px";
  
  c.style.position = "relative";
  c.style.left = "auto";
  c.style.top = "auto";
  c.style.transformOrigin = "center center";
  
  const scaleX = window.innerWidth / w;
  const scaleY = window.innerHeight / h;
  const cssScale = Math.min(scaleX, scaleY);
  
  c.style.transform = "scale(" + cssScale + ")";
  
  const physW = Math.max(1, Math.round(w * dpr));
  const physH = Math.max(1, Math.round(h * dpr));

  if (!options || options.bitmap !== false) {
    if (c.width !== physW || c.height !== physH) {
      c.width = physW;
      c.height = physH;
    }
  }
  return { scale: dpr, width: w, height: h, cssScale };
};
window.bkSetup = function(requestedW, requestedH, loopFn) {
  window.bkSetupCalled = true;
  const canvas = document.getElementById("c");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  
  let loopId = null;
  let cachedFit = window.bkFitCanvas(canvas, requestedW, requestedH);

  function loop() {
    if (window.innerWidth >= 32 && window.innerHeight >= 32) {
      ctx.save();
      ctx.scale(cachedFit.scale, cachedFit.scale);
      
      loopFn(ctx, cachedFit.width, cachedFit.height);
      
      ctx.restore();
    }
    if (window.__loop) {
      loopId = requestAnimationFrame(loop);
    } else {
      loopId = null;
    }
  }
  
  function initDraw() {
    if (window.innerWidth >= 32 && window.innerHeight >= 32) {
      cachedFit = window.bkFitCanvas(canvas, requestedW, requestedH);
      loop();
    } else {
      requestAnimationFrame(initDraw);
    }
  }
  initDraw();
  
  window.addEventListener("resize", () => {
    cachedFit = window.bkFitCanvas(canvas, requestedW, requestedH);
    if (!window.__loop && window.innerWidth >= 32 && window.innerHeight >= 32) {
      if (!loopId) {
        ctx.save();
        ctx.scale(cachedFit.scale, cachedFit.scale);
        loopFn(ctx, cachedFit.width, cachedFit.height);
        ctx.restore();
      }
    }
  });
  
  window.addEventListener("bk:theme-changed", () => {
    if (!window.__loop && window.innerWidth >= 32 && window.innerHeight >= 32) {
      if (!loopId) {
        ctx.save();
        ctx.scale(cachedFit.scale, cachedFit.scale);
        loopFn(ctx, cachedFit.width, cachedFit.height);
        ctx.restore();
      }
    }
  });
  
  window.addEventListener("message", (event) => {
    if (!event.data) return;
    if (event.data.type === "bk:play") {
      window.__loop = true;
      if (!loopId) loopId = requestAnimationFrame(loop);
    } else if (event.data.type === "bk:pause") {
      window.__loop = false; // will stop at next frame
    }
  });

  if (window.__isWorld) {
    let lastMoveTime = 0;
    const forwardPointer = (e) => {
      const now = performance.now();
      if (now - lastMoveTime > 60) {
        lastMoveTime = now;
        try {
          window.parent.postMessage({ type: "bk:mousemove", clientX: e.clientX, clientY: e.clientY }, "*");
        } catch (_) {}
      }
    };
    window.addEventListener("mousemove", forwardPointer, { passive: true });
    window.addEventListener("pointermove", forwardPointer, { passive: true });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        try {
          window.parent.postMessage({ type: "bk:world-exit" }, "*");
        } catch (_) {}
      }
    });
  }
};
`
}

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  if (!event.data) return;
  if (event.data.type === "bk:set-props") {
    window.__simProps = { ...window.__simProps, ...event.data.props };
    window.dispatchEvent(new CustomEvent("bk:props", { detail: window.__simProps }));
  } else if (event.data.type === "bk:world-enter") {
    if (window.bkWorld) {
      window.bkWorld.active = true;
      window.__loop = true;
      window.dispatchEvent(new CustomEvent("bk:world-enter"));
      window.dispatchEvent(new Event("resize"));
    }
  } else if (event.data.type === "bk:world-exit") {
    if (window.bkWorld) {
      window.bkWorld.active = false;
      window.dispatchEvent(new CustomEvent("bk:world-exit"));
      window.dispatchEvent(new Event("resize"));
    }
  } else if (event.data.type === "bk:world-reset-camera") {
    if (window.bkWorld) {
      window.bkWorld.resetCamera();
    }
  }
});
window.addEventListener("error", function(e) {
  console.error("Simulation Error:", e.error || e.message);
  const errDiv = document.createElement('div');
  errDiv.style.cssText = "padding:20px;color:red;font-family:monospace";
  errDiv.textContent = 'Error: ' + (e.error ? e.error.message : e.message);
  document.body.innerHTML = '';
  document.body.appendChild(errDiv);
});
if (!window.bkSetupCalled) {
  function fallbackScale() {
    window.bkFitCanvas(document.getElementById("c"), 800, 500, { bitmap: false });
  }
  fallbackScale();
  window.addEventListener("resize", fallbackScale);
}
</script>
<script src="data:text/javascript;charset=utf-8;base64,${simJsBase64}"></script>
</body></html>`;
	return escAttr(doc);
}
