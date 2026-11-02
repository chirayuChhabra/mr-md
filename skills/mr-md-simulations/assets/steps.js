// Replace this model and wording with the target lesson's concept and units.
let x = 0, done = false, previous = performance.now();
function reset() { x = 0; done = false; previous = performance.now(); }
window.bkOnStep(reset);
window.bkOnReset(reset);
window.bkSetup(800, 450, (ctx, width, height) => {
  const now = performance.now();
  const dt = Math.min(0.05, Math.max(0, (now - previous) / 1000));
  previous = now;
  const { speed = 40, target = 200 } = window.__simProps;
  if (window.__loop && !done) {
    x = Math.min(Number(target), x + Number(speed) * dt);
    if (x >= Number(target)) {
      done = true;
      window.bkCompleteStep("The marker reached the target distance.");
    }
  }
  ctx.fillStyle = window.bkColor("bg"); ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = window.bkColor("text");
  ctx.beginPath(); ctx.moveTo(100 + Number(target), 170); ctx.lineTo(100 + Number(target), 280); ctx.stroke();
  ctx.fillStyle = window.bkColor("accent");
  ctx.beginPath(); ctx.arc(100 + x, 225, 14, 0, Math.PI * 2); ctx.fill();
});
