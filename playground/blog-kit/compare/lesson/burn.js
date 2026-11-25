window.bkSetup((ctx, width, height) => {
  const speed = Number(window.__simProps.speed ?? 0.85);
  const eccentricity = 2 * speed ** 2 - 1;
  const radius = width * 0.11;
  const planetX = width * 0.46;
  const planetY = height * 0.54;

  ctx.fillStyle = window.bkColor("bg");
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(width * 0.08, height * 0.25, width * 0.84, height * 0.64);
  ctx.clip();

  ctx.beginPath();
  for (let angle = 0; angle <= Math.PI * 2; angle += 0.015) {
    const denominator = 1 + eccentricity * Math.cos(angle);
    if (denominator <= 0.025) break;
    const distance = radius * (1 + eccentricity) / denominator;
    const x = planetX + Math.cos(angle) * distance;
    const y = planetY - Math.sin(angle) * distance;
    if (angle === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = window.bkColor("accent");
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(planetX, planetY, radius * 0.55, 0, 2 * Math.PI);
  ctx.fillStyle = window.bkColor("line-strong");
  ctx.fill();
  ctx.beginPath();
  ctx.arc(planetX + radius, planetY, 6, 0, 2 * Math.PI);
  ctx.fillStyle = window.bkColor("text");
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = window.bkColor("text");
  ctx.font = "24px sans-serif";
  ctx.fillText(`${speed.toFixed(2)}×   ${speed < 1 ? "Bound orbit" : "Escape trajectory"}`, width * 0.08, height * 0.16);
}, { width: 800, height: 400 });
