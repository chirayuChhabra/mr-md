// Copy this file into the lesson project and rename it with the concept it
// teaches. Before editing, read the complete target lesson and replace every
// generic prop, label, instruction, unit, and model choice with the lesson's
// exact terminology and notation. Replace the example model rather than
// layering new behavior over it.

const state = {
  speed: readFiniteNumber(window.__simProps?.speed, 1),
  showGuide: Boolean(window.__simProps?.showGuide ?? true),
  x: 400,
  y: 250,
  phase: 0,
};

let initialized = false;
let previousTime = performance.now();

function readFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

window.addEventListener("bk:props", (event) => {
  const props = event.detail ?? {};
  state.speed = readFiniteNumber(props.speed, state.speed);
  if (props.showGuide !== undefined) {
    state.showGuide = Boolean(props.showGuide);
  }
});

function initialize(canvas) {
  if (initialized) return;

  canvas.addEventListener("pointerdown", (event) => {
    const point = window.bkCanvasPoint(event, canvas);
    state.x = point.x;
    state.y = point.y;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!canvas.hasPointerCapture(event.pointerId)) return;
    const point = window.bkCanvasPoint(event, canvas);
    state.x = point.x;
    state.y = point.y;
  });

  initialized = true;
}

function getUiStyle() {
  switch (window.bkUi()) {
    case "neo":
      return {
        markerShape: "square",
        lineWidth: 3,
        lineCap: "square",
        guideDash: [],
        shadow: "hard",
        shadowOffset: 6,
        pulseAmount: 0,
        font: "800 18px monospace",
      };
    case "playful":
      return {
        markerShape: "circle",
        lineWidth: 3,
        lineCap: "round",
        guideDash: [4, 10],
        shadow: "chunky",
        shadowOffset: 5,
        pulseAmount: 7,
        font: "800 18px sans-serif",
      };
    default:
      return {
        markerShape: "rounded-square",
        lineWidth: 2,
        lineCap: "round",
        guideDash: [8, 8],
        shadow: "soft",
        shadowOffset: 3,
        pulseAmount: 4,
        font: "600 18px sans-serif",
      };
  }
}

function markerPath(context, x, y, radius, shape) {
  context.beginPath();
  if (shape === "circle") {
    context.arc(x, y, radius, 0, Math.PI * 2);
  } else if (shape === "square") {
    context.rect(x - radius, y - radius, radius * 2, radius * 2);
  } else {
    context.roundRect(
      x - radius,
      y - radius,
      radius * 2,
      radius * 2,
      radius * 0.35,
    );
  }
}

function drawMarker(context, style, radius) {
  context.save();

  if (style.shadow === "hard") {
    context.fillStyle = window.bkColor("text");
    markerPath(
      context,
      state.x + style.shadowOffset,
      state.y + style.shadowOffset,
      radius,
      style.markerShape,
    );
    context.fill();
  } else {
    context.shadowColor = window.bkColor("line-strong");
    context.shadowBlur = style.shadow === "soft" ? 10 : 0;
    context.shadowOffsetY = style.shadowOffset;
  }

  context.fillStyle = window.bkColor("accent");
  context.strokeStyle = window.bkColor("text");
  context.lineWidth = style.lineWidth;
  markerPath(context, state.x, state.y, radius, style.markerShape);
  context.fill();
  if (style.markerShape === "square") context.stroke();

  context.restore();
}

function draw(context, width, height) {
  initialize(context.canvas);

  const now = performance.now();
  const dt = Math.min((now - previousTime) / 1000, 0.1);
  previousTime = now;
  state.phase += dt * state.speed;

  const ui = getUiStyle();

  context.clearRect(0, 0, width, height);
  context.fillStyle = window.bkColor("bg");
  context.fillRect(0, 0, width, height);

  if (state.showGuide) {
    context.strokeStyle = window.bkColor("line");
    context.lineWidth = ui.lineWidth;
    context.lineCap = ui.lineCap;
    context.setLineDash(ui.guideDash);
    context.beginPath();
    context.moveTo(0, state.y);
    context.lineTo(width, state.y);
    context.stroke();
    context.setLineDash([]);
  }

  const pulse =
    26 + Math.sin(state.phase * Math.PI * 2) * ui.pulseAmount;
  drawMarker(context, ui, pulse);

  context.fillStyle = window.bkColor("text");
  context.font = ui.font;
  context.textAlign = "center";
  context.fillText("Drag the point", state.x, state.y - pulse - 14);
}

window.bkSetup(800, 500, draw);

