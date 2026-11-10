(() => {
  "use strict";

  const sim = window.defineSimulation({ props: { damping: 1.5, dampingMode: "viscous", medium: "air", stiffness: 25, mass: 1 } });

  // Core physical state (all variables encapsulated in local closure)
  const state = {
    // Model parameters synced with host controls
    damping: Number(window.__simProps?.damping ?? 1.5), // N·s/m
    dampingMode: String(window.__simProps?.dampingMode ?? "viscous"),
    medium: String(window.__simProps?.medium ?? "air"),
    stiffness: Number(window.__simProps?.stiffness ?? 25), // N/m
    mass: Math.max(0.1, Number(window.__simProps?.mass ?? 1.0)), // kg

    // Dynamical state: displacement x (meters), velocity v (m/s)
    x: 0.75,
    v: 0.0,
    time: 0,
  };

  // Pointer drag and visual animation state
  let isDragging = false;
  let dragPointerId = null;
  let lastDragX = 0;
  let lastDragTime = 0;
  let impulseFlash = 0;
  let pointerInitialized = false;

  // Coordinate geometry for 1280 x 300 logical coordinate space
  const LOGICAL_WIDTH = 1280;
  const LOGICAL_HEIGHT = 300;
  const TRACK_Y = 150;
  const ANCHOR_X = 250;
  const EQUILIBRIUM_X = 640;
  const METERS_TO_PIXELS = 160; // 1.0 m = 160 px
  const CART_WIDTH = 88;
  const CART_HEIGHT = 54;
  const MAX_DISPLACEMENT = 1.25; // meters

  // Environment drag factor
  function getMediumMultiplier(medium) {
    switch (medium) {
      case "vacuum":
        return 0.0;
      case "water":
        return 2.5;
      case "glycerin":
        return 5.0;
      case "air":
      default:
        return 1.0;
    }
  }

  function getMediumColor(medium) {
    switch (medium) {
      case "vacuum":
        return "transparent";
      case "water":
        return "rgba(56, 189, 248, 0.28)";
      case "glycerin":
        return "rgba(234, 179, 8, 0.32)";
      case "air":
      default:
        return "rgba(100, 150, 255, 0.12)";
    }
  }

  // React to host property changes (tunables & presets)
  sim.onPropsChange((p) => {
    if (p.damping !== undefined) state.damping = Math.max(0, Number(p.damping));
    if (p.dampingMode !== undefined) state.dampingMode = String(p.dampingMode);
    if (p.medium !== undefined) state.medium = String(p.medium);
    if (p.stiffness !== undefined) state.stiffness = Math.max(1, Number(p.stiffness));
    if (p.mass !== undefined) state.mass = Math.max(0.1, Number(p.mass));
  });

  sim.onReset(() => {
    state.x = 0.75;
    state.v = 0;
    state.time = 0;
    isDragging = false;
    dragPointerId = null;
    impulseFlash = 0;
  });

  window.bkRegisterSnapshot({
    capture: () => ({ ...state, impulseFlash }),
    restore: (saved) => {
      Object.assign(state, saved);
      impulseFlash = saved.impulseFlash;
      isDragging = false;
      dragPointerId = null;
    },
  });

  // React to host action button clicks (repeatable impulses and rest reset)
  window.addEventListener("bk:action", (event) => {
    const action = event.detail?.action;
    if (action === "impulse") {
      // Deliver repeatable impulse Δv
      let kickDir = 1;
      if (state.x > 0.6) kickDir = -1;
      else if (state.x < -0.6) kickDir = 1;
      else if (Math.abs(state.v) > 0.05) kickDir = Math.sign(state.v);
      state.v += kickDir * 2.2;
      impulseFlash = 1.0;
    } else if (action === "zero") {
      state.x = 0;
      state.v = 0;
      impulseFlash = 0;
    }
  });

  // Pointer drag interaction for manual displacement
  let layoutOffsetY = 0;
  function initializePointer(canvas) {
    if (pointerInitialized) return;

    canvas.addEventListener("pointerdown", (event) => {
      const pt = window.bkCanvasPoint(event, canvas);
      const cartCenterX = EQUILIBRIUM_X + state.x * METERS_TO_PIXELS;
      const cartCenterY = TRACK_Y;

      if (
        Math.abs(pt.x - cartCenterX) <= CART_WIDTH / 2 + 18 &&
        Math.abs(pt.y - layoutOffsetY - cartCenterY) <= CART_HEIGHT / 2 + 18
      ) {
        isDragging = true;
        dragPointerId = event.pointerId;
        canvas.setPointerCapture(event.pointerId);
        lastDragX = pt.x;
        lastDragTime = performance.now();
        state.v = 0;
      }
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!isDragging || event.pointerId !== dragPointerId) return;
      const pt = window.bkCanvasPoint(event, canvas);
      const now = performance.now();
      const dt = Math.max(0.001, (now - lastDragTime) / 1000);

      const targetX = (pt.x - EQUILIBRIUM_X) / METERS_TO_PIXELS;
      const clampedX = Math.max(-MAX_DISPLACEMENT, Math.min(MAX_DISPLACEMENT, targetX));
      state.v = (clampedX - state.x) / dt;
      state.x = clampedX;
      lastDragX = pt.x;
      lastDragTime = now;
    });

    const endDrag = (event) => {
      if (isDragging && event.pointerId === dragPointerId) {
        isDragging = false;
        dragPointerId = null;
        state.v = Math.max(-6, Math.min(6, state.v));
      }
    };

    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    pointerInitialized = true;
  }

  // Visual language styling matching active bkUi()
  function getUiStyle() {
    const mode = typeof window.bkUi === "function" ? window.bkUi() : "standard";
    switch (mode) {
      case "neo":
        return {
          mode: "neo",
          cartRadius: 0,
          panelRadius: 0,
          lineWidth: 2.0,
          thickLineWidth: 3.0,
          shadowOffset: 3,
          lineCap: "square",
          lineJoin: "miter",
          fontFamily: "'Space Grotesk', system-ui, -apple-system, sans-serif",
        };
      case "playful":
        return {
          mode: "playful",
          cartRadius: 16,
          panelRadius: 14,
          lineWidth: 2.5,
          thickLineWidth: 3.5,
          shadowOffset: 4,
          lineCap: "round",
          lineJoin: "round",
          fontFamily: "'Fredoka', 'Quicksand', system-ui, sans-serif",
        };
      case "standard":
      default:
        return {
          mode: "standard",
          cartRadius: 6,
          panelRadius: 8,
          lineWidth: 1.5,
          thickLineWidth: 2.5,
          shadowOffset: 2,
          lineCap: "round",
          lineJoin: "round",
          fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
        };
    }
  }

  // Draw spring coil connecting anchor wall to cart
  function drawSpring(ctx, startX, startY, endX, endY, ui) {
    const coils = 14;
    const coilHeight = 14;
    const leadLength = 20;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(startX, startY);

    const effectiveStartX = startX + leadLength;
    const effectiveEndX = endX - leadLength;
    ctx.lineTo(effectiveStartX, startY);

    const span = Math.max(10, effectiveEndX - effectiveStartX);
    const step = span / coils;

    for (let i = 0; i < coils; i++) {
      const xMid = effectiveStartX + (i + 0.5) * step;
      const xEnd = effectiveStartX + (i + 1) * step;
      const yOffset = i % 2 === 0 ? -coilHeight : coilHeight;
      ctx.lineTo(xMid, startY + yOffset);
      ctx.lineTo(xEnd, startY);
    }

    ctx.lineTo(endX, endY);
    ctx.strokeStyle = window.bkColor("line-strong");
    ctx.lineWidth = ui.thickLineWidth;
    ctx.lineCap = ui.lineCap;
    ctx.lineJoin = ui.lineJoin;
    ctx.stroke();
    ctx.restore();
  }

  // Draw fluid dashpot (damper cylinder and piston)
  function drawDashpot(ctx, startX, startY, endX, endY, ui, medium) {
    const cylWidth = 110;
    const cylHeight = 22;
    const cylX = startX + 24;
    const cylY = startY - cylHeight / 2;

    ctx.save();

    // Chamber fluid
    ctx.fillStyle = getMediumColor(medium);
    if (ui.mode === "neo") {
      ctx.fillRect(cylX, cylY, cylWidth, cylHeight);
    } else {
      ctx.beginPath();
      ctx.roundRect(cylX, cylY, cylWidth, cylHeight, 3);
      ctx.fill();
    }

    // Cylinder outer wall
    ctx.strokeStyle = window.bkColor("line");
    ctx.lineWidth = ui.lineWidth;
    ctx.beginPath();
    ctx.moveTo(cylX + cylWidth, cylY);
    ctx.lineTo(cylX, cylY);
    ctx.lineTo(cylX, cylY + cylHeight);
    ctx.lineTo(cylX + cylWidth, cylY + cylHeight);
    ctx.stroke();

    // Rod from anchor wall to cylinder base
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(cylX, startY);
    ctx.stroke();

    // Piston rod from cart into cylinder
    const pistonHeadX = Math.max(cylX + 6, Math.min(cylX + cylWidth - 6, endX - 60));
    ctx.strokeStyle = window.bkColor("line-strong");
    ctx.lineWidth = ui.thickLineWidth;
    ctx.beginPath();
    ctx.moveTo(pistonHeadX, endY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Piston head disc
    ctx.strokeStyle = window.bkColor("accent");
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pistonHeadX, cylY + 2);
    ctx.lineTo(pistonHeadX, cylY + cylHeight - 2);
    ctx.stroke();

    ctx.restore();
  }

  // Numerical simulation integration with sub-stepping
  function updatePhysics(dt) {
    if (isDragging || dt <= 0) return;

    const subSteps = 4;
    const dtSub = dt / subSteps;
    const mediumMult = getMediumMultiplier(state.medium);
    const effectiveC = state.damping * mediumMult;
    const m = state.mass;
    const k = state.stiffness;

    for (let s = 0; s < subSteps; s++) {
      // Restoring spring force: F = -k * x
      const F_spring = -k * state.x;

      // Damping force
      let F_damping = 0;
      if (state.dampingMode === "viscous") {
        // Standard viscous damping: F_d = -c * v
        F_damping = -effectiveC * state.v;
      } else if (state.dampingMode === "quadratic") {
        // Aerodynamic quadratic drag: F_d = -c_quad * v * |v|
        const c_quad = effectiveC * 0.5;
        F_damping = -c_quad * state.v * Math.abs(state.v);
      } else if (state.dampingMode === "friction") {
        // Coulomb dry friction
        const N = m * 9.81;
        const mu_k = Math.min(0.8, effectiveC * 0.04 + 0.05);
        const F_k = mu_k * N;
        const F_s = 1.25 * F_k;

        if (Math.abs(state.v) > 0.005) {
          F_damping = -F_k * Math.sign(state.v);
        } else {
          if (Math.abs(F_spring) <= F_s) {
            state.v = 0;
            F_damping = -F_spring;
          } else {
            F_damping = -F_k * Math.sign(F_spring);
          }
        }
      }

      const F_total = F_spring + F_damping;
      const a = F_total / m;

      state.v += a * dtSub;
      state.x += state.v * dtSub;

      // Physical track end stops
      if (state.x < -MAX_DISPLACEMENT) {
        state.x = -MAX_DISPLACEMENT;
        state.v = -state.v * 0.2;
      } else if (state.x > MAX_DISPLACEMENT) {
        state.x = MAX_DISPLACEMENT;
        state.v = -state.v * 0.2;
      }
    }

    state.time += dt;
  }

  // Main canvas draw callback
  function draw(ctx, width, height, frame) {
    const viewX = frame?.originX ?? 0;
    const viewY = frame?.originY ?? 0;
    const viewWidth = frame?.viewportWidth ?? width;
    const viewHeight = frame?.viewportHeight ?? height;
    initializePointer(ctx.canvas);

    const elapsed = sim.deltaTime();
    const dt = window.__bkRestoring ? 0 : Math.min(elapsed, 0.05);

    updatePhysics(dt);

    if (impulseFlash > 0) {
      impulseFlash = Math.max(0, impulseFlash - dt * 2.5);
    }

    const ui = getUiStyle();
    const bg = window.bkColor("bg");
    const paper = window.bkColor("paper");
    const line = window.bkColor("line");
    const lineStrong = window.bkColor("line-strong");
    const text = window.bkColor("text");
    const textLight = window.bkColor("text-light");
    const accent = window.bkColor("accent");
    const accentSoft = window.bkColor("accent-soft");

    // Clear canvas background
    ctx.fillStyle = bg;
    ctx.fillRect(viewX, viewY, viewWidth, viewHeight);
    layoutOffsetY = viewY + Math.max(0, (viewHeight - LOGICAL_HEIGHT) / 2);
    ctx.save();
    ctx.translate(0, layoutOffsetY);

    // Analytical linear oscillator quantities
    const mediumMult = getMediumMultiplier(state.medium);
    const effC = state.damping * mediumMult;
    const omega0 = Math.sqrt(state.stiffness / state.mass);
    const criticalC = 2 * Math.sqrt(state.stiffness * state.mass);
    const zeta = effC / criticalC;

    let regimeBadge = "Underdamped";
    if (state.dampingMode === "viscous") {
      if (effC === 0) {
        regimeBadge = "Undamped";
      } else if (Math.abs(zeta - 1.0) <= 0.02) {
        regimeBadge = "Near critical damping";
      } else if (zeta > 1.02) {
        regimeBadge = "Overdamped";
      } else {
        regimeBadge = "Underdamped";
      }
    } else if (state.dampingMode === "quadratic") {
      regimeBadge = "Quadratic drag";
    } else if (state.dampingMode === "friction") {
      regimeBadge = "Dry friction";
    }

    // ============================================================
    //  TOP-LEFT APPARATUS: WALL, TRACK, SPRING, DASHPOT, CART
    // ============================================================
    const trackStartX = ANCHOR_X;
    const trackEndX = 1200;
    const railY = TRACK_Y + CART_HEIGHT / 2 + 10;

    // Track rails
    ctx.strokeStyle = line;
    ctx.lineWidth = ui.lineWidth;
    ctx.beginPath();
    ctx.moveTo(trackStartX, railY);
    ctx.lineTo(trackEndX, railY);
    ctx.moveTo(trackStartX, railY + 4);
    ctx.lineTo(trackEndX, railY + 4);
    ctx.stroke();

    // Scale tick marks
    ctx.font = `10px ${ui.fontFamily}`;
    ctx.fillStyle = textLight;
    ctx.textAlign = "center";
    [-1.0, -0.5, 0, 0.5, 1.0].forEach((mVal) => {
      const rx = EQUILIBRIUM_X + mVal * METERS_TO_PIXELS;
      ctx.beginPath();
      ctx.moveTo(rx, railY);
      ctx.lineTo(rx, railY + 6);
      ctx.stroke();
      ctx.fillText(`${mVal > 0 ? "+" : ""}${mVal} m`, rx, railY + 18);
    });

    // Equilibrium dashed reference
    ctx.save();
    ctx.strokeStyle = accentSoft;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(EQUILIBRIUM_X, TRACK_Y - 50);
    ctx.lineTo(EQUILIBRIUM_X, TRACK_Y + 65);
    ctx.stroke();
    ctx.restore();

    // Anchor wall
    const wallWidth = 18;
    const wallTop = TRACK_Y - 50;
    const wallHeight = 100;
    ctx.fillStyle = paper;
    ctx.strokeStyle = lineStrong;
    ctx.lineWidth = ui.lineWidth;
    if (ui.mode === "neo") {
      ctx.fillRect(ANCHOR_X - wallWidth, wallTop, wallWidth, wallHeight);
      ctx.strokeRect(ANCHOR_X - wallWidth, wallTop, wallWidth, wallHeight);
    } else {
      ctx.beginPath();
      ctx.roundRect(ANCHOR_X - wallWidth, wallTop, wallWidth, wallHeight, [ui.panelRadius, 0, 0, ui.panelRadius]);
      ctx.fill();
      ctx.stroke();
    }

    // Wall hatch lines
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    for (let hy = wallTop + 6; hy < wallTop + wallHeight; hy += 10) {
      ctx.beginPath();
      ctx.moveTo(ANCHOR_X - wallWidth, hy);
      ctx.lineTo(ANCHOR_X - 4, hy + 6);
      ctx.stroke();
    }

    // Mass cart position
    const cartCenterX = EQUILIBRIUM_X + state.x * METERS_TO_PIXELS;
    const cartLeft = cartCenterX - CART_WIDTH / 2;
    const cartTop = TRACK_Y - CART_HEIGHT / 2;

    // Draw spring & damper
    drawSpring(ctx, ANCHOR_X, TRACK_Y - 14, cartLeft, TRACK_Y - 14, ui);
    drawDashpot(ctx, ANCHOR_X, TRACK_Y + 14, cartLeft, TRACK_Y + 14, ui, state.medium);

    // Cart body
    ctx.save();
    if (ui.mode === "neo") {
      ctx.fillStyle = lineStrong;
      ctx.fillRect(cartLeft + ui.shadowOffset, cartTop + ui.shadowOffset, CART_WIDTH, CART_HEIGHT);
    } else if (ui.mode === "playful") {
      ctx.shadowColor = lineStrong;
      ctx.shadowOffsetY = ui.shadowOffset;
      ctx.shadowBlur = 8;
    } else {
      ctx.shadowColor = "rgba(0, 0, 0, 0.08)";
      ctx.shadowOffsetY = 2;
      ctx.shadowBlur = 4;
    }

    ctx.fillStyle = impulseFlash > 0 ? accentSoft : paper;
    ctx.strokeStyle = isDragging ? accent : lineStrong;
    ctx.lineWidth = isDragging ? ui.thickLineWidth : ui.lineWidth;

    if (ui.cartRadius === 0) {
      ctx.fillRect(cartLeft, cartTop, CART_WIDTH, CART_HEIGHT);
      ctx.strokeRect(cartLeft, cartTop, CART_WIDTH, CART_HEIGHT);
    } else {
      ctx.beginPath();
      ctx.roundRect(cartLeft, cartTop, CART_WIDTH, CART_HEIGHT, ui.cartRadius);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // Cart wheels
    ctx.fillStyle = lineStrong;
    const wheelR = 4.5;
    const wheelY = cartTop + CART_HEIGHT + 3;
    ctx.beginPath();
    ctx.arc(cartLeft + 16, wheelY, wheelR, 0, Math.PI * 2);
    ctx.arc(cartLeft + CART_WIDTH - 16, wheelY, wheelR, 0, Math.PI * 2);
    ctx.fill();

    // Cart text label
    ctx.font = `600 13px ${ui.fontFamily}`;
    ctx.fillStyle = text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${state.mass.toFixed(1)} kg`, cartCenterX, cartTop + 20);

    ctx.font = `10px ${ui.fontFamily}`;
    ctx.fillStyle = textLight;
    ctx.fillText(isDragging ? "DRAGGING" : "DRAG CART", cartCenterX, cartTop + 36);

    // Velocity arrow
    if (Math.abs(state.v) > 0.04) {
      const arrowLen = Math.max(-46, Math.min(46, state.v * 14));
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cartCenterX, cartTop - 10);
      ctx.lineTo(cartCenterX + arrowLen, cartTop - 10);
      ctx.stroke();

      const aDir = Math.sign(arrowLen);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(cartCenterX + arrowLen, cartTop - 10);
      ctx.lineTo(cartCenterX + arrowLen - aDir * 5, cartTop - 13);
      ctx.lineTo(cartCenterX + arrowLen - aDir * 5, cartTop - 7);
      ctx.closePath();
      ctx.fill();
    }

    if (!window.__bkRestoring) window.bkTelemetry({
      regime: regimeBadge,
      displacement: state.x,
      velocity: state.v,
      angularFrequency: omega0,
      dampingRatio: state.dampingMode === "viscous" ? zeta : null
    });

    ctx.restore();
  }

  // Register canvas loop with standard mr-md lifecycle
  window.bkSetup(LOGICAL_WIDTH, LOGICAL_HEIGHT, draw);
})();
