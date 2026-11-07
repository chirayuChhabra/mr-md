// Keplerian Orbital Dynamics simulation with abstract host telemetry
(function() {
  const PI = Math.PI;
  const TWO_PI = Math.PI * 2;
  const AU_TO_KM_S = 4.74047; // 1 AU/yr in km/s
  const MU = 4 * PI * PI; // AU^3/yr^2 (where a=1, T=1)

  const sim = window.defineSimulation({ props: { eccentricity: 0.45, simulationSpeed: 1, showVelocityVector: true, showApsides: true } });

  let semiMajorAxis = 1.0; // AU
  let eccentricity = Number(window.__simProps?.eccentricity ?? 0.45);
  let simSpeed = Number(window.__simProps?.simulationSpeed ?? 1.0);
  let showVelocity = window.__simProps?.showVelocityVector !== false;
  let showApsides = window.__simProps?.showApsides !== false;

  let meanAnomaly = 0.0; // radians
  let isDragging = false;

  // React to host controls updates
  sim.onPropsChange((props) => {
    if (typeof props.eccentricity === "number") {
      eccentricity = Math.max(0, Math.min(0.95, props.eccentricity));
    }
    if (typeof props.simulationSpeed === "number") {
      simSpeed = Math.max(0.05, Math.min(5, props.simulationSpeed));
    }
    if (typeof props.showVelocityVector === "boolean") {
      showVelocity = props.showVelocityVector;
    }
    if (typeof props.showApsides === "boolean") {
      showApsides = props.showApsides;
    }
  });

  sim.onReset(() => {
    meanAnomaly = 0;
    isDragging = false;
  });

  // Solve Kepler's equation M = E - e * sin(E) for Eccentric Anomaly E
  function solveKepler(M, e) {
    let E = M;
    for (let i = 0; i < 6; i++) {
      const f = E - e * Math.sin(E) - M;
      const fPrime = 1 - e * Math.cos(E);
      const delta = f / fPrime;
      E -= delta;
      if (Math.abs(delta) < 1e-6) break;
    }
    return E;
  }

  // Pointer interaction
  function getLogicalPointer(e, canvas) {
    if (typeof window.bkCanvasPoint === "function") {
      return window.bkCanvasPoint(e, canvas);
    }
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    return {
      x: (clientX - rect.left) * (1280 / (rect.width || 1)),
      y: (clientY - rect.top) * (720 / (rect.height || 1))
    };
  }

  let satPos = { x: 0, y: 0 };
  const SUN_POS = { x: 600, y: 360 };
  const SCALE_PIXELS_PER_AU = 260;

  window.addEventListener("pointerdown", (e) => {
    const canvas = document.getElementById("c");
    if (!canvas) return;
    const pt = getLogicalPointer(e, canvas);
    const distToSat = Math.hypot(pt.x - satPos.x, pt.y - satPos.y);
    if (distToSat < 35) {
      isDragging = true;
    }
  });

  window.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const canvas = document.getElementById("c");
    if (!canvas) return;
    const pt = getLogicalPointer(e, canvas);
    const dx = (pt.x - SUN_POS.x) / SCALE_PIXELS_PER_AU;
    const dy = (pt.y - SUN_POS.y) / SCALE_PIXELS_PER_AU;
    const theta = Math.atan2(dy, dx);
    const cosTheta = Math.cos(theta);
    const cosE = (eccentricity + cosTheta) / (1 + eccentricity * cosTheta);
    let E = Math.acos(Math.max(-1, Math.min(1, cosE)));
    if (theta < 0) E = TWO_PI - E;
    meanAnomaly = E - eccentricity * Math.sin(E);
  });

  const stopDrag = () => { isDragging = false; };
  window.addEventListener("pointerup", stopDrag);
  window.addEventListener("pointercancel", stopDrag);

  // Initialize loop with bkSetup
  window.bkSetup(1280, 720, (ctx, width, height, frame) => {
    const dt = sim.deltaTime();

    // Advance orbital mean anomaly if not paused or dragging
    const periodYr = Math.pow(semiMajorAxis, 1.5);
    const meanMotion = (TWO_PI / periodYr); // rad/yr
    const simTimeScale = 0.25 * simSpeed; // yr per real second

    if (!isDragging) {
      meanAnomaly = (meanAnomaly + meanMotion * dt * simTimeScale) % TWO_PI;
      if (meanAnomaly < 0) meanAnomaly += TWO_PI;
    }

    // Solve orbital position
    const E = solveKepler(meanAnomaly, eccentricity);
    const r = semiMajorAxis * (1 - eccentricity * Math.cos(E)); // AU
    const xRelAU = semiMajorAxis * (Math.cos(E) - eccentricity);
    const bAU = semiMajorAxis * Math.sqrt(Math.max(0, 1 - eccentricity * eccentricity));
    const yRelAU = bAU * Math.sin(E);

    satPos.x = SUN_POS.x + xRelAU * SCALE_PIXELS_PER_AU;
    satPos.y = SUN_POS.y + yRelAU * SCALE_PIXELS_PER_AU;

    // Physical calculations for telemetry
    const h = Math.sqrt(MU * semiMajorAxis * Math.max(0, 1 - eccentricity * eccentricity)); // AU^2/yr
    const vAU = Math.sqrt(Math.max(0, MU * (2 / Math.max(0.01, r) - 1 / semiMajorAxis))); // AU/yr
    const vKmS = vAU * AU_TO_KM_S;

    const periapsisAU = semiMajorAxis * (1 - eccentricity);
    const apoapsisAU = semiMajorAxis * (1 + eccentricity);
    const vPeriapsisKmS = Math.sqrt(MU * (1 + eccentricity) / (semiMajorAxis * (1 - eccentricity))) * AU_TO_KM_S;
    const vApoapsisKmS = Math.sqrt(MU * (1 - eccentricity) / (semiMajorAxis * (1 + eccentricity))) * AU_TO_KM_S;

    const vCircKmS = 2 * PI * AU_TO_KM_S; // ~29.78 km/s
    const specificEnergyMJKg = -0.5 * Math.pow(vCircKmS, 2) / semiMajorAxis; // -443.4 MJ/kg

    const orbitStatus = eccentricity < 0.02
      ? "Circular Orbit"
      : eccentricity < 0.9
        ? "Elliptical Orbit"
        : "Highly Eccentric";

    // Publish telemetry to host
    {
      sim.publishTelemetry({
        status: orbitStatus,
        eccentricity: eccentricity,
        semiMajorAxis: semiMajorAxis,
        period: periodYr,
        periapsis: periapsisAU,
        apoapsis: apoapsisAU,
        specificEnergy: specificEnergyMJKg,
        angularMomentum: h,
        currentSpeed: vKmS,
        periapsisSpeed: vPeriapsisKmS,
        apoapsisSpeed: vApoapsisKmS
      });
    }

    // Colors from theme
    const bg = window.bkColor("bg");
    const line = window.bkColor("line");
    const lineStrong = window.bkColor("line-strong");
    const accent = window.bkColor("accent");
    const accentSoft = window.bkColor("accent-soft");
    const text = window.bkColor("text");
    const textLight = window.bkColor("text-light");

    // Clear background across visible scene bounds
    const bgX = frame ? frame.originX : 0;
    const bgY = frame ? frame.originY : 0;
    const bgW = frame ? frame.viewportWidth : width;
    const bgH = frame ? frame.viewportHeight : height;
    ctx.fillStyle = bg;
    ctx.fillRect(bgX, bgY, bgW, bgH);

    // Subtle background grid across full viewport
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const minGridX = frame ? Math.floor(frame.originX / 160) * 160 : 80;
    const maxGridX = frame ? frame.originX + frame.viewportWidth : width;
    const minGridY = frame ? Math.floor(frame.originY / 160) * 160 : 0;
    const maxGridY = frame ? frame.originY + frame.viewportHeight : height;

    for (let x = minGridX; x <= maxGridX + 160; x += 160) {
      ctx.moveTo(x, minGridY);
      ctx.lineTo(x, maxGridY);
    }
    for (let y = minGridY; y <= maxGridY + 160; y += 160) {
      ctx.moveTo(minGridX, y);
      ctx.lineTo(maxGridX, y);
    }
    ctx.stroke();

    // Major axis & center line
    ctx.strokeStyle = lineStrong;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(SUN_POS.x - apoapsisAU * SCALE_PIXELS_PER_AU - 40, SUN_POS.y);
    ctx.lineTo(SUN_POS.x + periapsisAU * SCALE_PIXELS_PER_AU + 40, SUN_POS.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw orbital ellipse
    const centerAU = -semiMajorAxis * eccentricity;
    const centerX = SUN_POS.x + centerAU * SCALE_PIXELS_PER_AU;
    const centerY = SUN_POS.y;
    const radiusX = semiMajorAxis * SCALE_PIXELS_PER_AU;
    const radiusY = bAU * SCALE_PIXELS_PER_AU;

    ctx.strokeStyle = accentSoft;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, TWO_PI);
    ctx.stroke();

    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, TWO_PI);
    ctx.stroke();

    // Apsides markers (Periapsis P and Apoapsis A)
    if (showApsides) {
      const pX = SUN_POS.x + periapsisAU * SCALE_PIXELS_PER_AU;
      const aX = SUN_POS.x - apoapsisAU * SCALE_PIXELS_PER_AU;

      // Periapsis marker
      ctx.fillStyle = textLight;
      ctx.beginPath();
      ctx.arc(pX, SUN_POS.y, 4, 0, TWO_PI);
      ctx.fill();
      ctx.font = "600 13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Periapsis (r_p)", pX, SUN_POS.y + 24);

      // Apoapsis marker
      ctx.beginPath();
      ctx.arc(aX, SUN_POS.y, 4, 0, TWO_PI);
      ctx.fill();
      ctx.fillText("Apoapsis (r_a)", aX, SUN_POS.y + 24);
    }

    // Radius vector from Sun to Satellite
    ctx.strokeStyle = lineStrong;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(SUN_POS.x, SUN_POS.y);
    ctx.lineTo(satPos.x, satPos.y);
    ctx.stroke();

    // Central Sun / Star
    const sunGrad = ctx.createRadialGradient(SUN_POS.x, SUN_POS.y, 4, SUN_POS.x, SUN_POS.y, 28);
    sunGrad.addColorStop(0, "#fbbf24");
    sunGrad.addColorStop(0.4, "#f59e0b");
    sunGrad.addColorStop(1, "rgba(245, 158, 11, 0)");

    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(SUN_POS.x, SUN_POS.y, 28, 0, TWO_PI);
    ctx.fill();

    ctx.fillStyle = "#fef08a";
    ctx.beginPath();
    ctx.arc(SUN_POS.x, SUN_POS.y, 10, 0, TWO_PI);
    ctx.fill();

    // Velocity vector arrow
    if (showVelocity) {
      // Calculate velocity vector direction
      const vxAU = -Math.sin(E) * (semiMajorAxis * (TWO_PI / periodYr)) / (1 - eccentricity * Math.cos(E));
      const vyAU = Math.cos(E) * (bAU * (TWO_PI / periodYr)) / (1 - eccentricity * Math.cos(E));
      const vLen = Math.hypot(vxAU, vyAU);
      const vScale = 7.5; // pixel vector scale
      const vEndX = satPos.x + vxAU * vScale;
      const vEndY = satPos.y + vyAU * vScale;

      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(satPos.x, satPos.y);
      ctx.lineTo(vEndX, vEndY);
      ctx.stroke();

      // Arrowhead
      const arrowAngle = Math.atan2(vyAU, vxAU);
      const arrowSize = 8;
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.moveTo(vEndX, vEndY);
      ctx.lineTo(
        vEndX - arrowSize * Math.cos(arrowAngle - Math.PI / 6),
        vEndY - arrowSize * Math.sin(arrowAngle - Math.PI / 6)
      );
      ctx.lineTo(
        vEndX - arrowSize * Math.cos(arrowAngle + Math.PI / 6),
        vEndY - arrowSize * Math.sin(arrowAngle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("v", vEndX + 6, vEndY - 4);
    }

    // Orbiting Body (Satellite)
    ctx.fillStyle = isDragging ? "#60a5fa" : text;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(satPos.x, satPos.y, isDragging ? 9 : 7, 0, TWO_PI);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Subtle drag indicator ring
    ctx.strokeStyle = isDragging ? accent : lineStrong;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(satPos.x, satPos.y, 14, 0, TWO_PI);
    ctx.stroke();
  }, { framing: "bleed" });
})();
