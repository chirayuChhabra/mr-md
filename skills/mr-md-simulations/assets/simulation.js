// Copy this file into the lesson project and rename it with the concept it
// teaches. Before editing, read the complete target lesson and replace every
// generic prop, label, instruction, unit, and model choice with the lesson's
// exact terminology and notation. Replace the example model rather than
// layering new behavior over it.

const sim = window.defineSimulation({ props: { speed: 1, showGuide: true } });

const state = {
  speed: readFiniteNumber(window.__simProps?.speed, 1),
  showGuide: Boolean(window.__simProps?.showGuide ?? true),
  x: 400,
  y: 250,
  phase: 0,
};

let initialized = false;

const LOGICAL_WIDTH = 800;
const LOGICAL_HEIGHT = 450;
const viewport = { width: LOGICAL_WIDTH, height: LOGICAL_HEIGHT };
const SAFE_INSET = 80;
const MARKER_RADIUS = 26;
const MAX_MARKER_EXTENT = 36;

function readFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function moveMarker(point) {
  state.x = clamp(
    point.x,
    SAFE_INSET + MAX_MARKER_EXTENT,
    viewport.width - SAFE_INSET - MAX_MARKER_EXTENT,
  );
  state.y = clamp(
    point.y,
    SAFE_INSET + MAX_MARKER_EXTENT,
    viewport.height - SAFE_INSET - MAX_MARKER_EXTENT,
  );
}

sim.onPropsChange((props) => {
  state.speed = readFiniteNumber(props.speed, state.speed);
  if (props.showGuide !== undefined) {
    state.showGuide = Boolean(props.showGuide);
  }
});

sim.onReset(() => {
  state.x = 400;
  state.y = 250;
  state.phase = 0;
});

function initialize(canvas) {
  if (initialized) return;

  canvas.addEventListener("pointerdown", (event) => {
    const point = window.bkCanvasPoint(event, canvas);
    moveMarker(point);
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!canvas.hasPointerCapture(event.pointerId)) return;
    const point = window.bkCanvasPoint(event, canvas);
    moveMarker(point);
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
        shadowOffset: 4,
        pulseAmount: 0,
      };
    case "playful":
      return {
        markerShape: "circle",
        lineWidth: 3,
        lineCap: "round",
        guideDash: [4, 10],
        shadow: "chunky",
        shadowOffset: 5,
        pulseAmount: 4,
      };
    default:
      return {
        markerShape: "rounded-square",
        lineWidth: 2,
        lineCap: "round",
        guideDash: [8, 8],
        shadow: "soft",
        shadowOffset: 3,
        pulseAmount: 3,
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
    context.fillStyle = window.bkColor("line-strong");
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

  context.fillStyle = window.bkColor("paper");
  context.strokeStyle = window.bkColor("accent");
  context.lineWidth = style.lineWidth;
  markerPath(context, state.x, state.y, radius, style.markerShape);
  context.fill();
  context.stroke();

  context.restore();
}

function draw(context, width, height) {
  viewport.width = width;
  viewport.height = height;
  initialize(context.canvas);

  const dt = sim.deltaTime();
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
    context.moveTo(SAFE_INSET, state.y);
    context.lineTo(width - SAFE_INSET, state.y);
    context.stroke();
    context.setLineDash([]);
  }

  const pulse =
    MARKER_RADIUS + Math.sin(state.phase * Math.PI * 2) * ui.pulseAmount;
  drawMarker(context, ui, pulse);
}

window.bkSetup(draw);

