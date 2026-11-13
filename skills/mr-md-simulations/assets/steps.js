// Replace this model and wording with the target lesson's concept and units.
const sim = window.defineSimulation({ props: { speed: 40, target: 200 } });
let x = 0, done = false;
function reset() { x = 0; done = false; }
window.bkOnStep(reset);
sim.onReset(reset);
window.bkSetup((ctx, width, height) => {
  const dt = sim.deltaTime();
  const { speed, target } = sim.props;
  if (dt > 0 && !done) {
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
