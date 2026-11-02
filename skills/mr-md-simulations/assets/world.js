// The host already applies the camera transform. Objects use world coordinates.
window.bkSetupWorld((ctx) => {
  ctx.strokeStyle = window.bkColor("line");
  ctx.lineWidth = 1 / window.bkWorld.camera.zoom;
  for (let x = -1000; x <= 1000; x += 100) {
    ctx.beginPath(); ctx.moveTo(x, -1000); ctx.lineTo(x, 1000); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-1000, x); ctx.lineTo(1000, x); ctx.stroke();
  }
  ctx.fillStyle = window.bkColor("accent");
  ctx.beginPath(); ctx.arc(0, 0, 30, 0, 2 * Math.PI); ctx.fill();
});
