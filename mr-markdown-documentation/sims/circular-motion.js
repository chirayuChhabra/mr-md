(() => {
  const sim = window.defineSimulation({ props: {} });
  let angle = 0;
  sim.onReset(() => { angle = 0; });

  window.bkSetup((ctx) => {
    angle = (angle + sim.deltaTime() * 0.65) % (Math.PI * 2);
    const playful = window.bkUi() === "playful";
    const neo = window.bkUi() === "neo";
    const x = 400 + 145 * Math.cos(angle);
    const y = 225 + 145 * Math.sin(angle);
    ctx.fillStyle = window.bkColor("bg");
    ctx.fillRect(0, 0, 800, 450);
    ctx.strokeStyle = window.bkColor("line-strong");
    ctx.lineWidth = neo ? 3 : 2;
    ctx.beginPath();
    ctx.arc(400, 225, 145, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = window.bkColor("line-strong");
    ctx.beginPath();
    ctx.moveTo(400, 225);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = window.bkColor("text");
    ctx.beginPath();
    ctx.arc(400, 225, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = window.bkColor("accent");
    ctx.beginPath();
    ctx.arc(x, y, playful ? 16 : 12, 0, Math.PI * 2);
    ctx.fill();
  });
})();
