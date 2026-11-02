// Minimalist Explorable World Simulation
(function() {
  const particles = [];
  const PARTICLE_COUNT = 180;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = 30 + Math.random() * 320;
    particles.push({
      r,
      angle,
      speed: (0.9 + Math.random() * 0.8) / Math.sqrt(Math.max(10, r) / 40),
      size: 1.5 + Math.random() * 2.5,
      alpha: 0.35 + Math.random() * 0.55
    });
  }

  let lastTime = performance.now();

  window.bkSetupWorld(function(ctx, world) {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    const accent = window.bkColor ? window.bkColor("accent") : "#38bdf8";

    // Clear background across infinite canvas
    ctx.fillStyle = window.bkColor ? window.bkColor("bg") : "#030611";
    ctx.fillRect(-4000, -4000, 8000, 8000);

    // Subtle orbital guide rings
    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    ctx.lineWidth = 1;
    for (let r = 80; r <= 320; r += 80) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Glowing core star
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 24;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Inner bright core
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    // Orbiting particles
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.angle += p.speed * dt * 0.9;
      const px = Math.cos(p.angle) * p.r;
      const py = Math.sin(p.angle) * p.r;

      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.globalAlpha = p.alpha;
      ctx.fill();
    }
  });
})();
