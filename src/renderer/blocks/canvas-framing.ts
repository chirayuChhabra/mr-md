/** Shared 2D canvas and pointer contract for block and guided workspaces. */
export function canvasFramingRuntime(defaultHeight = 500): string {
	return `
window.addEventListener("message", function(event) {
  if (event.source === window.parent && event.data?.type === "bk:runtime-query" && window.__bkCanvasSize) {
    window.parent.postMessage(window.__bkCanvasSize, "*");
  }
});
// Both setup forms use fixed logical dimensions unless framing is explicit.
window.bkResolveSetup = function(widthOrDraw, heightOrOptions, drawOrOptions, maybeDraw) {
  if (typeof widthOrDraw === "function") {
    const options = heightOrOptions || {};
    const width = options.width === undefined ? 800 : options.width;
    const height = options.height === undefined ? 450 : options.height;
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      throw new RangeError("bkSetup: width and height must be positive finite numbers");
    }
    return { width, height, draw: widthOrDraw, options: options };
  }
  return {
    width: widthOrDraw,
    height: heightOrOptions,
    draw: typeof drawOrOptions === "function" ? drawOrOptions : maybeDraw,
    options: (typeof drawOrOptions === "object" && drawOrOptions !== null) ? drawOrOptions : ((typeof maybeDraw === "object" && maybeDraw !== null) ? maybeDraw : {})
  };
};

window.bkCanvasPoint = function(event, canvas) {
  const c = canvas || event.currentTarget || event.target;
  if (!c || typeof c.getBoundingClientRect !== "function") return { x: 0, y: 0 };
  const rect = c.getBoundingClientRect();
  const logicalW = c.__bkLogicalW || 800;
  const logicalH = c.__bkLogicalH || ${defaultHeight};
  const clientX = event.clientX !== undefined ? event.clientX : (event.touches?.[0]?.clientX ?? event.changedTouches?.[0]?.clientX ?? 0);
  const clientY = event.clientY !== undefined ? event.clientY : (event.touches?.[0]?.clientY ?? event.changedTouches?.[0]?.clientY ?? 0);

  if (c.__bkFraming === "bleed" || c.__bkFraming === "responsive") {
    const scale = c.__bkScale || 1;
    const offsetX = c.__bkOffsetX || 0;
    const offsetY = c.__bkOffsetY || 0;
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;
    return {
      x: scale > 0 ? (relX - offsetX) / scale : 0,
      y: scale > 0 ? (relY - offsetY) / scale : 0
    };
  }

  return {
    x: rect.width ? ((clientX - rect.left) * logicalW) / rect.width : 0,
    y: rect.height ? ((clientY - rect.top) * logicalH) / rect.height : 0
  };
};
window.bkFitCanvas = function(c, requestedW, requestedH, options) {
  if (!c) return { scale: 1, width: requestedW || 800, height: requestedH || ${defaultHeight}, cssScale: 1, offsetX: 0, offsetY: 0, framing: "contain" };
  const dpr = window.devicePixelRatio || 1;
  const w = requestedW || 800;
  const h = requestedH || ${defaultHeight};
  const opts = options || {};
  const framing = opts.framing || opts.fit || (opts.bleed === false ? "contain" : "bleed");
  const responsive = framing === "responsive";
  if (c.__bkReportedW !== w || c.__bkReportedH !== h || c.__bkReportedResponsive !== responsive) {
    c.__bkReportedW = w;
    c.__bkReportedH = h;
    c.__bkReportedResponsive = responsive;
    window.__bkCanvasSize = { type: "bk:canvas-size", width: w, height: h, responsive: responsive };
    window.parent.postMessage(window.__bkCanvasSize, "*");
  }

  const isResponsive = framing === "responsive";
  const isBleed = framing === "bleed" || framing === "fill" || framing === "edge-to-edge" || isResponsive;

  c.__bkLogicalW = w;
  c.__bkLogicalH = h;
  c.__bkFraming = isResponsive ? "responsive" : (isBleed ? "bleed" : "contain");

  const winW = window.innerWidth;
  const winH = window.innerHeight;
  const scaleX = winW / w;
  const scaleY = winH / h;

  if (isBleed) {
    c.style.position = "absolute";
    c.style.left = "0px";
    c.style.top = "0px";
    c.style.width = "100%";
    c.style.height = "100%";
    c.style.transform = "none";
    c.style.transformOrigin = "0 0";

    const physW = Math.max(1, Math.round(winW * dpr));
    const physH = Math.max(1, Math.round(winH * dpr));
    if (opts.bitmap !== false) {
      if (c.width !== physW || c.height !== physH) {
        c.width = physW;
        c.height = physH;
      }
    }

    const scale = Math.min(scaleX, scaleY);
    const diagramW = w * scale;
    const diagramH = h * scale;
    const offsetX = isResponsive ? 0 : (winW - diagramW) / 2;
    const offsetY = isResponsive ? 0 : (winH - diagramH) / 2;
    const viewportW = scale > 0 ? winW / scale : w;
    const viewportH = scale > 0 ? winH / scale : h;
    const originX = isResponsive ? 0 : (scale > 0 ? -offsetX / scale : 0);
    const originY = isResponsive ? 0 : (scale > 0 ? -offsetY / scale : 0);

    c.__bkLogicalW = isResponsive ? viewportW : w;
    c.__bkLogicalH = isResponsive ? viewportH : h;
    c.__bkScale = scale;
    c.__bkOffsetX = offsetX;
    c.__bkOffsetY = offsetY;
    c.__bkDpr = dpr;
    c.__bkViewportW = viewportW;
    c.__bkViewportH = viewportH;
    c.__bkOriginX = originX;
    c.__bkOriginY = originY;

    return {
      scale: dpr,
      cssScale: 1,
      fitScale: scale,
      width: c.__bkLogicalW,
      height: c.__bkLogicalH,
      framing: c.__bkFraming,
      offsetX: offsetX,
      offsetY: offsetY,
      viewportWidth: viewportW,
      viewportHeight: viewportH,
      originX: originX,
      originY: originY,
      windowWidth: winW,
      windowHeight: winH
    };
  } else {
    c.style.position = "relative";
    c.style.left = "auto";
    c.style.top = "auto";
    c.style.width = w + "px";
    c.style.height = h + "px";
    c.style.transformOrigin = "center center";

    const cssScale = Math.min(scaleX, scaleY);
    c.style.transform = "scale(" + cssScale + ")";

    const physW = Math.max(1, Math.round(w * dpr));
    const physH = Math.max(1, Math.round(h * dpr));

    if (opts.bitmap !== false) {
      if (c.width !== physW || c.height !== physH) {
        c.width = physW;
        c.height = physH;
      }
    }

    c.__bkScale = cssScale;
    c.__bkOffsetX = 0;
    c.__bkOffsetY = 0;
    c.__bkDpr = dpr;

    return {
      scale: dpr,
      width: w,
      height: h,
      cssScale: cssScale,
      framing: "contain",
      offsetX: 0,
      offsetY: 0
    };
  }
};
`;
}
