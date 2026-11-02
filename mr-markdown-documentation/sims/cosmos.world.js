// Stellar Dynamics World Simulation
// Explorable space where the creator owns the entire simulation inside mr-md's viewport

(function() {
  const attractors = [
    { x: 0, y: 0, mass: 2600, radius: 24, label: "Sol Prime" },
    { x: -340, y: -200, mass: 1400, radius: 18, label: "Epsilon Centauri" },
    { x: 380, y: 220, mass: 1200, radius: 16, label: "Kepler Relay" }
  ];

  let stars = [];
  function initStars(count) {
    stars = [];
    for (let i = 0; i < count; i++) {
      const parent = attractors[i % attractors.length];
      const dist = 50 + Math.random() * 340;
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.sqrt((parent.mass * 0.75) / dist) * (0.8 + Math.random() * 0.4);
      stars.push({
        x: parent.x + Math.cos(angle) * dist,
        y: parent.y + Math.sin(angle) * dist,
        vx: -Math.sin(angle) * speed,
        vy: Math.cos(angle) * speed,
        size: 1.2 + Math.random() * 2.2,
        trail: []
      });
    }
  }

  initStars(280);

  // Spawn a burst of orbiting stars near click in world coordinates
  window.addEventListener("pointerdown", function(e) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (!window.bkWorld) return;
    const pt = window.bkWorld.toWorld(e.clientX, e.clientY);
    for (let k = 0; k < 6; k++) {
      const angle = Math.random() * Math.PI * 2;
      const sp = 20 + Math.random() * 40;
      stars.push({
        x: pt.x + Math.cos(angle) * 8,
        y: pt.y + Math.sin(angle) * 8,
        vx: -Math.sin(angle) * sp,
        vy: Math.cos(angle) * sp,
        size: 1.5 + Math.random() * 2.0,
        trail: []
      });
    }
  });

  let lastTime = performance.now();

  window.bkSetupWorld(function(ctx, world) {
    const now = performance.now();
    const dt = Math.min(0.04, (now - lastTime) / 1000);
    lastTime = now;

    const bgCol = window.bkColor("bg") || "#0a0d14";
    const accentCol = window.bkColor("accent") || "#38bdf8";
    const accentSoftCol = window.bkColor("accent-soft") || "rgba(56, 189, 248, 0.2)";
    const textCol = window.bkColor("text") || "#f1f5f9";
    const lineCol = window.bkColor("line") || "rgba(255, 255, 255, 0.12)";
    const uiMode = (window.bkUi && window.bkUi()) || "standard";

    // Clear edge-to-edge spatial canvas
    ctx.fillStyle = bgCol;
    ctx.fillRect(-6000, -6000, 12000, 12000);

    // Coordinate grid
    ctx.strokeStyle = lineCol;
    ctx.lineWidth = 0.5;
    const gridSize = 160;
    const gridBound = 1600;
    ctx.beginPath();
    for (let x = -gridBound; x <= gridBound; x += gridSize) {
      ctx.moveTo(x, -gridBound);
      ctx.lineTo(x, gridBound);
    }
    for (let y = -gridBound; y <= gridBound; y += gridSize) {
      ctx.moveTo(-gridBound, y);
      ctx.lineTo(gridBound, y);
    }
    ctx.stroke();

    // Attractor gravity wells
    attractors.forEach((att) => {
      ctx.beginPath();
      ctx.arc(att.x, att.y, att.radius * 5.5, 0, Math.PI * 2);
      ctx.fillStyle = accentSoftCol;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(att.x, att.y, att.radius * 3, 0, Math.PI * 2);
      ctx.strokeStyle = accentCol;
      ctx.lineWidth = uiMode === "neo" ? 2 : 1;
      if (uiMode === "neo") ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      if (uiMode === "neo") {
        ctx.rect(att.x - att.radius, att.y - att.radius, att.radius * 2, att.radius * 2);
      } else {
        ctx.arc(att.x, att.y, att.radius, 0, Math.PI * 2);
      }
      ctx.fillStyle = accentCol;
      ctx.fill();
      ctx.strokeStyle = textCol;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = textCol;
      ctx.font = uiMode === "neo" ? "bold 11px monospace" : "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(att.label, att.x, att.y + att.radius + 16);
    });

    // Update & draw stars
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];

      let fx = 0;
      let fy = 0;
      for (let j = 0; j < attractors.length; j++) {
        const att = attractors[j];
        const dx = att.x - s.x;
        const dy = att.y - s.y;
        const d2 = dx * dx + dy * dy + 600;
        const dist = Math.sqrt(d2);
        const force = (att.mass * 1.8) / d2;
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      }

      s.vx += fx * dt;
      s.vy += fy * dt;
      s.x += s.vx * dt * 60;
      s.y += s.vy * dt * 60;

      s.trail.push({ x: s.x, y: s.y });
      if (s.trail.length > (uiMode === "playful" ? 10 : 5)) {
        s.trail.shift();
      }

      if (s.trail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(s.trail[0].x, s.trail[0].y);
        for (let t = 1; t < s.trail.length; t++) {
          ctx.lineTo(s.trail[t].x, s.trail[t].y);
        }
        ctx.strokeStyle = accentSoftCol;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.beginPath();
      if (uiMode === "neo") {
        ctx.rect(s.x - s.size, s.y - s.size, s.size * 2, s.size * 2);
      } else {
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      }
      ctx.fillStyle = textCol;
      ctx.fill();
    }
  });
})();
