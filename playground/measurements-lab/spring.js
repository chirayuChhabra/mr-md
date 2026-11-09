const sim = window.defineSimulation({ props: { mass: 1, stiffness: 8, damping: 0.12 } });
let x = 0.65, v = 0, time = 0, dragging = false;
window.bkRegisterSnapshot({
  capture: () => ({ x, v, time }),
  restore: state => {
    if (![state?.x, state?.v, state?.time].every(Number.isFinite)) throw new Error('Invalid spring snapshot');
    ({ x, v, time } = state);
    dragging = false;
  }
});
const visible = new Set();
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
sim.onReset(() => { x = 0.65; v = 0; time = 0; dragging = false; });
window.addEventListener('message', (event) => {
  if (event.source !== window.parent || event.data?.type !== 'bk:measurement-visibility' || !Array.isArray(event.data.measurements)) return;
  visible.clear();
  for (const item of event.data.measurements) if (typeof item?.scene === 'string') visible.add(item.scene);
  window.__renderFrame?.();
});
window.bkSetup(1280, 720, (ctx, width, height) => {
  const { mass, stiffness, damping } = sim.props;
  const isRestoring = Boolean(window.__bkRestoring);
  const dt = isRestoring ? 0 : Math.min(0.05, Math.max(0, sim.deltaTime()));
  if (!dragging && dt > 0) {
    const steps = Math.max(1, Math.ceil(dt / 0.005)), h = dt / steps;
    for (let i = 0; i < steps; i++) { v += (-stiffness * x - damping * v) / mass * h; x += v * h; }
  }
  if (dt > 0) time += dt;
  const force = -stiffness * x - damping * v;
  const energy = 0.5 * stiffness * x * x + 0.5 * mass * v * v;
  if (!isRestoring) {
    sim.publishTelemetry({ time, displacement: x, velocity: v, force, energy });
  }
  const color = window.bkColor, ui = window.bkUi();
  const equilibrium = 700, scale = 280, body = equilibrium + x * scale, y = 360;
  ctx.fillStyle = color('bg'); ctx.fillRect(0, 0, width, height);
  ctx.font = '18px system-ui'; ctx.fillStyle = color('text-light');
  ctx.fillText('Drag the mass or use ← and → to move it', 100, 115);
  ctx.strokeStyle = color('line'); ctx.lineWidth = 2; ctx.setLineDash([6, 7]);
  ctx.beginPath(); ctx.moveTo(equilibrium, 205); ctx.lineTo(equilibrium, 540); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillText('Equilibrium', equilibrium - 50, 190);
  ctx.strokeStyle = color('line-strong'); ctx.beginPath(); ctx.moveTo(155, 435); ctx.lineTo(1120, 435); ctx.moveTo(200, 280); ctx.lineTo(200, 435); ctx.stroke();
  ctx.strokeStyle = color('accent'); ctx.lineWidth = ui === 'neo' ? 4 : 3; ctx.lineJoin = ui === 'playful' ? 'round' : 'miter';
  ctx.beginPath(); ctx.moveTo(200, y); ctx.lineTo(225, y);
  const end = body - 60, start = 225, segments = 16;
  for (let i = 1; i < segments; i++) ctx.lineTo(start + (end - start) * i / segments, y + (i % 2 ? -24 : 24));
  ctx.lineTo(end, y); ctx.stroke();
  ctx.fillStyle = color('paper'); ctx.strokeStyle = color('text'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(body - 60, y - 60, 120, 120, ui === 'neo' ? 0 : ui === 'playful' ? 24 : 10); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color('text'); ctx.font = '600 20px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`${mass.toFixed(1)} kg`, body, y + 7); ctx.textAlign = 'left';
  const arrow = (startX, endX, arrowY, label) => {
    const end = clamp(endX, 110, 1150);
    ctx.strokeStyle = color('accent'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(startX, arrowY); ctx.lineTo(end, arrowY);
    const direction = end >= startX ? 1 : -1;
    if (Math.abs(end - startX) > 2) { ctx.moveTo(end - direction * 9, arrowY - 5); ctx.lineTo(end, arrowY); ctx.lineTo(end - direction * 9, arrowY + 5); }
    ctx.stroke();
    ctx.fillStyle = color('text'); ctx.font = '16px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(label, clamp((startX + end) / 2, 235, 1075), arrowY - 16);
    ctx.textAlign = 'left';
  };
  if (visible.has('velocity')) arrow(body, body + clamp(v * 65, -180, 180), 250, `Velocity ${v.toFixed(2)} m/s`);
  if (visible.has('force')) arrow(body, body + clamp(force * 16, -220, 220), 490, `Net force ${force.toFixed(2)} N`);
  if (visible.has('displacement')) {
    ctx.strokeStyle = color('accent'); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(equilibrium, 565); ctx.lineTo(body, 565);
    ctx.moveTo(equilibrium, 556); ctx.lineTo(equilibrium, 574);
    ctx.moveTo(body, 556); ctx.lineTo(body, 574); ctx.stroke();
    ctx.fillStyle = color('text'); ctx.font = '16px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(`Displacement ${x.toFixed(2)} m`, (equilibrium + body) / 2, 604); ctx.textAlign = 'left';
  }
  if (visible.has('energy')) {
    const kinetic = 0.5 * mass * v * v;
    const potential = 0.5 * stiffness * x * x;
    const fraction = energy > 0 ? kinetic / energy : 0;
    ctx.fillStyle = color('text'); ctx.font = '500 17px system-ui';
    ctx.fillText(`Mechanical energy ${energy.toFixed(2)} J`, 890, 112);
    ctx.fillStyle = color('accent-soft'); ctx.fillRect(890, 132, 270, 8);
    ctx.fillStyle = color('accent'); ctx.fillRect(890, 132, 270 * fraction, 8);
    ctx.fillStyle = color('text-light'); ctx.font = '14px system-ui';
    ctx.fillText(`Kinetic ${kinetic.toFixed(2)} J`, 890, 166);
    ctx.textAlign = 'right'; ctx.fillText(`Spring ${potential.toFixed(2)} J`, 1160, 166); ctx.textAlign = 'left';
  }

});
const canvas = document.getElementById('c');
canvas.tabIndex = 0; canvas.style.touchAction = 'none';
canvas.setAttribute('aria-label', 'Spring mass. Drag the mass or use left and right arrows to move it.');
function move(event) { const p = window.bkCanvasPoint(event, canvas); x = clamp((p.x - 700) / 280, -1.2, 1.2); v = 0; window.__renderFrame?.(); }
canvas.addEventListener('pointerdown', event => {
  if (window.parent && window.parent !== window) {
    try { window.parent.postMessage({ type: 'bk:scene-interaction' }, '*'); } catch (_) {}
  }
  const p = window.bkCanvasPoint(event, canvas); if (Math.abs(p.x - (700 + x * 280)) > 75 || Math.abs(p.y - 360) > 75) return; dragging = true; canvas.focus({ preventScroll: true }); canvas.style.cursor = 'grabbing'; canvas.setPointerCapture(event.pointerId); move(event); event.preventDefault();
});
canvas.addEventListener('pointermove', event => { if (dragging) move(event); else { const p = window.bkCanvasPoint(event, canvas); canvas.style.cursor = Math.abs(p.x - (700 + x * 280)) < 75 && Math.abs(p.y - 360) < 75 ? 'grab' : 'default'; } });
canvas.addEventListener('pointerup', () => { dragging = false; canvas.style.cursor = 'grab'; });
canvas.addEventListener('pointercancel', () => { dragging = false; });
canvas.addEventListener('keydown', event => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  if (window.parent && window.parent !== window) {
    try { window.parent.postMessage({ type: 'bk:scene-interaction' }, '*'); } catch (_) {}
  }
  x = clamp(x + (event.key === 'ArrowRight' ? 0.05 : -0.05), -1.2, 1.2); v = 0; window.__renderFrame?.(); event.preventDefault();
});
