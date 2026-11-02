import { escAttr } from "./utils.js";

export function iframeDoc(
	js: string,
	props: string,
	loop?: boolean,
	dependencies?: string[],
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
  body { font-family: sans-serif; }
</style>
</head><body>
<canvas id="c" width="800" height="500"></canvas>
<script id="bk-sim-props" type="application/json">${props}</script>
<script>
window.__simProps=JSON.parse(document.getElementById("bk-sim-props").textContent || "{}");
window.__loop=${loop ?? false};
window.bkSetupCalled = false;
window.__bkTheme = { colors: {}, theme: "light", palette: "ink", ui: "standard" };
window.bkColor = function(name) { return window.__bkTheme.colors[name] || "#000000"; };
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
    window.dispatchEvent(new CustomEvent("bk:theme-changed", { detail: window.__bkTheme }));
  }
});
if (window.parent && window.parent !== window) {
  window.parent.postMessage({ type: "bk:request-theme" }, "*");
}

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
  const cssScale = Math.max(scaleX, scaleY);
  
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
};

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  if (!event.data || event.data.type !== "bk:set-props") return;
  window.__simProps = { ...window.__simProps, ...event.data.props };
  window.dispatchEvent(new CustomEvent("bk:props", { detail: window.__simProps }));
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
