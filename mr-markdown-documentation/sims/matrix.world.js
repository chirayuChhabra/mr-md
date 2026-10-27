// Quantum Voxel Matrix World Simulation
// An explorable 3D isometric cybernetic voxel city in mr-md

(function() {
  const GRID_W = 28;
  const GRID_H = 28;
  const TILE_SIZE = 32;

  // Generate procedural voxel towers
  const towers = [];
  for (let x = -GRID_W / 2; x < GRID_W / 2; x++) {
    for (let y = -GRID_H / 2; y < GRID_H / 2; y++) {
      const dist = Math.hypot(x, y);
      const isRoad = Math.abs(x) % 5 === 0 || Math.abs(y) % 5 === 0;
      let height = 0;
      let type = "ground";

      if (!isRoad && dist < 12) {
        height = Math.floor(Math.sin(x * 0.4) * Math.cos(y * 0.4) * 8 + 9);
        type = Math.random() > 0.85 ? "monolith" : "tower";
      }

      towers.push({
        x,
        y,
        height,
        targetHeight: height,
        type,
        pulseOffset: Math.random() * Math.PI * 2,
        active: false,
      });
    }
  }

  // Moving data packets along cyber roads
  const packets = [];
  for (let p = 0; p < 45; p++) {
    const isHorizontal = Math.random() > 0.5;
    packets.push({
      x: isHorizontal ? (Math.random() - 0.5) * GRID_W : Math.round((Math.random() - 0.5) * 5) * 5,
      y: isHorizontal ? Math.round((Math.random() - 0.5) * 5) * 5 : (Math.random() - 0.5) * GRID_H,
      vx: isHorizontal ? (Math.random() > 0.5 ? 0.08 : -0.08) : 0,
      vy: isHorizontal ? 0 : (Math.random() > 0.5 ? 0.08 : -0.08),
      size: 4 + Math.random() * 4,
    });
  }

  // Ripple tower heights on click in world coordinates
  window.addEventListener("pointerdown", function(e) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (!window.bkWorld) return;
    const pt = window.bkWorld.toWorld(e.clientX, e.clientY);
    const cos30 = 0.866;
    const sin30 = 0.5;
    const clickGridX = Math.round((pt.x / cos30 + pt.y / sin30) / (TILE_SIZE * 2));
    const clickGridY = Math.round((pt.y / sin30 - pt.x / cos30) / (TILE_SIZE * 2));

    towers.forEach((t) => {
      const d = Math.hypot(t.x - clickGridX, t.y - clickGridY);
      if (d < 6) {
        t.targetHeight = Math.max(1, Math.min(22, t.targetHeight + (6 - d) * 2));
        setTimeout(() => { t.targetHeight = t.height; }, 1200);
      }
    });
  });

  function drawIsometricCube(ctx, sx, sy, size, heightVal, accentColor, isMonolith) {
    const cos30 = 0.866;
    const sin30 = 0.5;
    const h = heightVal * 8;
    const topY = sy - h;

    const dx = size * cos30 * 0.5;
    const dy = size * sin30 * 0.5;

    // Top Face
    ctx.beginPath();
    ctx.moveTo(sx, topY - dy);
    ctx.lineTo(sx + dx, topY);
    ctx.lineTo(sx, topY + dy);
    ctx.lineTo(sx - dx, topY);
    ctx.closePath();
    ctx.fillStyle = isMonolith ? "#ffffff" : `color-mix(in srgb, ${accentColor} 80%, #ffffff)`;
    ctx.fill();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    if (heightVal > 0) {
      // Left Face
      ctx.beginPath();
      ctx.moveTo(sx - dx, topY);
      ctx.lineTo(sx, topY + dy);
      ctx.lineTo(sx, sy + dy);
      ctx.lineTo(sx - dx, sy);
      ctx.closePath();
      ctx.fillStyle = `color-mix(in srgb, ${accentColor} 50%, #050811)`;
      ctx.fill();
      ctx.stroke();

      // Right Face
      ctx.beginPath();
      ctx.moveTo(sx, topY + dy);
      ctx.lineTo(sx + dx, topY);
      ctx.lineTo(sx + dx, sy);
      ctx.lineTo(sx, sy + dy);
      ctx.closePath();
      ctx.fillStyle = `color-mix(in srgb, ${accentColor} 30%, #000000)`;
      ctx.fill();
      ctx.stroke();
    }
  }

  // Simulation Render Loop via standard mr-md world registration
  window.bkSetupWorld(function(ctx, world) {
    const accent = (window.bkColor && window.bkColor("accent")) || "#10b981";

    // Clear Deep Obsidian Void
    ctx.fillStyle = "#03060c";
    ctx.fillRect(-6000, -6000, 12000, 12000);

    // Update and sort towers by isometric depth (x + y)
    const cos30 = 0.866;
    const sin30 = 0.5;

    towers.forEach((t) => {
      t.height += (t.targetHeight - t.height) * 0.1;
    });

    const sortedTowers = [...towers].sort((a, b) => (a.x + a.y) - (b.x + b.y));

    sortedTowers.forEach((t) => {
      const sx = (t.x - t.y) * TILE_SIZE * cos30;
      const sy = (t.x + t.y) * TILE_SIZE * sin30;
      drawIsometricCube(ctx, sx, sy, TILE_SIZE, t.height, accent, t.type === "monolith");
    });

    // Update and render data packets
    packets.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      if (Math.abs(p.x) > GRID_W / 2) p.vx *= -1;
      if (Math.abs(p.y) > GRID_H / 2) p.vy *= -1;

      const px = (p.x - p.y) * TILE_SIZE * cos30;
      const py = (p.x + p.y) * TILE_SIZE * sin30;

      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = accent;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  });
})();
