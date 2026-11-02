// ============================================================
//  Quantum Chromodynamics (QCD) Simulation - CLEAN VECTOR V3
//  Proton structure, color confinement, and string breaking
// ============================================================

let showColorCharge = true;
let strongForce = 1.0;

if (window.__simProps) {
  if (window.__simProps.showColorCharge !== undefined) showColorCharge = window.__simProps.showColorCharge;
  if (window.__simProps.strongForce !== undefined) strongForce = window.__simProps.strongForce;
}

window.addEventListener("bk:props", (e) => {
  const p = e.detail;
  if (p.showColorCharge !== undefined) showColorCharge = p.showColorCharge;
  if (p.strongForce !== undefined) strongForce = p.strongForce;
});

const QUARK_RADIUS = 24;
// Clean, flat vector palette
const COLORS = {
  red: "#f44336",
  green: "#4caf50",
  blue: "#2196f3",
  anti_red: "#00bcd4",
  anti_green: "#e91e63",
  anti_blue: "#ffeb3b",
  neutral: "#9e9e9e"
};

class Quark {
  constructor(x, y, flavor, color, phaseOffset) {
    this.x = x;
    this.y = y;
    this.baseX = x;
    this.baseY = y;
    this.anchorX = x;
    this.anchorY = y;
    this.flavor = flavor;
    this.color = color;
    this.isDragging = false;
    this.hover = false;
    this.mouseX = x;
    this.mouseY = y;
    this.phase = phaseOffset;
  }
}

class Gluon {
  constructor(source, target) {
    this.source = source;
    this.target = target;
    this.progress = 0;
    this.c1 = source.color;
  }
}

class Shockwave {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 0;
    this.life = 1.0;
  }
  update(dt) {
    this.radius += 500 * dt;
    this.life -= 1.5 * dt;
  }
  draw(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.lineWidth = 4 * this.life;
    ctx.strokeStyle = `rgba(255, 255, 255, ${this.life})`;
    ctx.stroke();
    ctx.restore();
  }
}

let proton = [];
let mesons = [];
let gluons = [];
let shockwaves = [];
let centerPoint = { x: 0, y: 0 };
let initialized = false;
let draggingQuark = null;
let lastTime = 0;

// The perfect color states that the proton rotates through
const colorStates = [
  ["red", "green", "blue"],
  ["red", "blue", "green"],
  ["green", "red", "blue"],
  ["green", "blue", "red"],
  ["blue", "red", "green"],
  ["blue", "green", "red"]
];
let currentStateIndex = 0;
let nextStateIndex = 1;
let colorTransitionProgress = 0;

function resetProton(cx, cy) {
  centerPoint = { x: cx, y: cy };
  proton = [
    new Quark(cx, cy - 45, "u", "red", 0),
    new Quark(cx - 40, cy + 25, "u", "green", 2),
    new Quark(cx + 40, cy + 25, "d", "blue", 4)
  ];
}

function breakString(quark, cx, cy) {
  const antiColors = { "red": "anti_red", "green": "anti_green", "blue": "anti_blue" };
  // Meson formed from pulled quark + newly minted antiquark
  const mesonAntiQuark = new Quark(quark.x - 30, quark.y, quark.flavor === "u" ? "ū" : "d̄", antiColors[quark.color], 0);
  
  mesons.push({
    q1: quark,
    q2: mesonAntiQuark,
    vx: (quark.x - centerPoint.x) * 0.05,
    vy: (quark.y - centerPoint.y) * 0.05,
    life: 3.0 // Stays on screen longer!
  });
  
  // Proton replaces the quark
  const newQuark = new Quark(quark.baseX, quark.baseY, quark.flavor, quark.color, quark.phase);
  const index = proton.indexOf(quark);
  if (index > -1) proton[index] = newQuark;
  
  // Flash!
  const breakX = (centerPoint.x + quark.x) / 2;
  const breakY = (centerPoint.y + quark.y) / 2;
  shockwaves.push(new Shockwave(breakX, breakY));
  
  draggingQuark = null;
}

// To communicate tension to the user
let currentTensionPercent = 0;
let isTensionActive = false;

function getBezierPoint(t, p0x, p0y, p1x, p1y, p2x, p2y) {
  const x = Math.pow(1 - t, 2) * p0x + 2 * (1 - t) * t * p1x + Math.pow(t, 2) * p2x;
  const y = Math.pow(1 - t, 2) * p0y + 2 * (1 - t) * t * p1y + Math.pow(t, 2) * p2y;
  return { x, y };
}

function drawFluxTube(ctx, x1, y1, x2, y2, tension, time, isMeson = false) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  
  // High energy wavy string - significantly reduced amplitude for a more "normal" straight-ish look
  const wiggleAmp = Math.max(0, (1 - tension) * 8); 
  const nx = -(y2 - y1) / dist;
  const ny = (x2 - x1) / dist;
  
  // Wiggle fast
  const phase = (x1 + y1) * 0.05;
  const wiggle = Math.sin(time * 20 + phase) * wiggleAmp;
  
  const cx = midX + nx * wiggle;
  const cy = midY + ny * wiggle;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cx, cy, x2, y2);
  ctx.lineCap = "round";
  
  if (isMeson) {
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(150, 150, 150, 0.4)";
    ctx.stroke();
  } else {
    // Rubber band visuals
    const width = Math.max(2, 14 - tension * 12);
    ctx.lineWidth = width;
    ctx.strokeStyle = `rgba(150, 150, 150, ${1.0 - tension * 0.5})`;
    
    // Draw intense energy core if super tense
    if (tension > 0.8) {
      const redIntensity = (tension - 0.8) * 5; // 0 to 1
      ctx.strokeStyle = `rgba(255, 50, 50, ${redIntensity})`;
      ctx.lineWidth = width + 4;
      ctx.stroke();
      
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = Math.max(1, width * 0.4);
    }
    
    ctx.stroke();
  }
  ctx.restore();
  
  return { cx, cy };
}

function draw(ctx, logicalW, logicalH) {
  const canvas = ctx.canvas;
  
  if (!initialized) {
    canvas.style.touchAction = "none";
    resetProton(logicalW / 2, logicalH / 2);
    
    function getMouse(e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = logicalW / rect.width;
      const scaleY = logicalH / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }
    
    canvas.addEventListener("pointerdown", (e) => {
      const m = getMouse(e);
      for (const q of proton) {
        if (Math.hypot(q.x - m.x, q.y - m.y) < QUARK_RADIUS * 2) {
          draggingQuark = q;
          q.isDragging = true;
          q.mouseX = m.x;
          q.mouseY = m.y;
          canvas.setPointerCapture(e.pointerId);
          break;
        }
      }
    });
    
    canvas.addEventListener("pointermove", (e) => {
      const m = getMouse(e);
      let hovering = false;
      for (const q of proton) {
        q.hover = Math.hypot(q.x - m.x, q.y - m.y) < QUARK_RADIUS * 1.5;
        if (q.hover) hovering = true;
      }
      if (draggingQuark) {
        draggingQuark.mouseX = m.x;
        draggingQuark.mouseY = m.y;
        canvas.style.cursor = "grabbing";
      } else {
        canvas.style.cursor = hovering ? "grab" : "default";
      }
    });
    
    canvas.addEventListener("pointerup", () => {
      if (draggingQuark) {
        draggingQuark.isDragging = false;
        draggingQuark = null;
        canvas.style.cursor = "default";
      }
    });
    
    lastTime = performance.now();
    initialized = true;
  }
  
  const now = performance.now();
  let dt = (now - lastTime) / 1000;
  if (dt > 0.1) dt = 0.1;
  lastTime = now;

  // String breaking physics (Logarithmic tension)
  isTensionActive = false;
  
  // Make the proton ALIVE!
  // Calculate dynamic wandering anchors for the unpulled quarks using Lissajous curves
  const aliveTime = now / 1000;
  for (const q of proton) {
    // Quantum jitter / breathing motion
    q.anchorX = q.baseX + Math.sin(aliveTime * 2.5 + q.phase) * 12 + Math.cos(aliveTime * 4.1 + q.phase*2) * 5;
    q.anchorY = q.baseY + Math.cos(aliveTime * 3.2 + q.phase) * 12 + Math.sin(aliveTime * 5.3 + q.phase*3) * 5;
  }
  
  for (const q of proton) {
    if (q === draggingQuark) {
      // The cursor distance
      const dx = q.mouseX - centerPoint.x;
      const dy = q.mouseY - centerPoint.y;
      const mouseDist = Math.hypot(dx, dy);
      
      // Map the 0.1 - 10 ratio to the visual distances
      const threshold = 180 + (strongForce * 125);
      const breakDistance = threshold * 3.0; // Snap point is now 3x the base threshold
      
      // Update UI Tension Bar
      isTensionActive = true;
      currentTensionPercent = Math.min(1.0, mouseDist / breakDistance);
      
      // Asymptotic freedom magic (Exponential Asymptote!)
      // The quark refuses to visually stretch past 90% of the threshold.
      // We scale the exponent so that it starts 1-to-1 with the mouse, but bends towards maxVisualStretch.
      const maxVisualStretch = threshold * 0.9;
      const mappedDist = maxVisualStretch * (1.0 - Math.exp(-mouseDist / maxVisualStretch)); 
      
      let targetX = q.mouseX;
      let targetY = q.mouseY;
      
      if (mouseDist > 0) {
        targetX = centerPoint.x + (dx / mouseDist) * mappedDist;
        targetY = centerPoint.y + (dy / mouseDist) * mappedDist;
      }
      
      q.x += (targetX - q.x) * 0.4;
      q.y += (targetY - q.y) * 0.4;
      
      // String breaking relies on the actual cursor distance getting insanely far
      if (mouseDist > breakDistance) {
        breakString(q, centerPoint.x, centerPoint.y);
        isTensionActive = false;
      }
    } else {
      // Unpulled quarks stay strictly anchored
      q.x += (q.anchorX - q.x) * 0.2;
      q.y += (q.anchorY - q.y) * 0.2;
    }
  }

  // Guaranteed Color Balance via state transition
  colorTransitionProgress += 30.0 * dt; // INSANELY FAST
  if (colorTransitionProgress >= 1.0) {
    colorTransitionProgress = 0;
    currentStateIndex = nextStateIndex;
    
    // Pick a new state that is one swap away
    nextStateIndex = Math.floor(Math.random() * colorStates.length);
    
    // Fire gluons to visualize the swap!
    if (proton.length === 3) {
      const currentColors = colorStates[currentStateIndex];
      const nextColors = colorStates[nextStateIndex];
      
      for(let i=0; i<3; i++) {
        proton[i].color = currentColors[i]; // strict assignment guarantees balance
      }
      
      // Visual gluons (lots of them!)
      gluons.push(new Gluon(proton[0], proton[1]));
      gluons.push(new Gluon(proton[1], proton[2]));
      gluons.push(new Gluon(proton[2], proton[0]));
    }
  }
  
  // Gluon visual update
  for (let i = gluons.length - 1; i >= 0; i--) {
    const g = gluons[i];
    g.progress += 25.0 * dt; // VERY FAST
    if (g.progress >= 1.0) {
      gluons.splice(i, 1);
    }
  }
  
  // Mesons update (Friction so they stay on screen!)
  for (let i = mesons.length - 1; i >= 0; i--) {
    const m = mesons[i];
    
    // Friction
    m.vx *= 0.95;
    m.vy *= 0.95;
    
    m.q1.x += m.vx; m.q1.y += m.vy;
    m.q2.x += m.vx; m.q2.y += m.vy;
    
    // Meson quarks rotate around each other
    const mx = (m.q1.x + m.q2.x)/2;
    const my = (m.q1.y + m.q2.y)/2;
    
    // Rotate
    const angle = 2.0 * dt;
    const r1x = m.q1.x - mx, r1y = m.q1.y - my;
    m.q1.x = mx + r1x * Math.cos(angle) - r1y * Math.sin(angle);
    m.q1.y = my + r1x * Math.sin(angle) + r1y * Math.cos(angle);
    
    const r2x = m.q2.x - mx, r2y = m.q2.y - my;
    m.q2.x = mx + r2x * Math.cos(angle) - r2y * Math.sin(angle);
    m.q2.y = my + r2x * Math.sin(angle) + r2y * Math.cos(angle);
    
    m.life -= 0.5 * dt; 
    if (m.life <= 0) mesons.splice(i, 1);
  }
  
  // Shockwaves
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    shockwaves[i].update(dt);
    if (shockwaves[i].life <= 0) shockwaves.splice(i, 1);
  }

  // DRAWING PHASE
  // Premium Modern Dark Mode Background (Replaced with theme bg)
  ctx.fillStyle = bkColor('bg');
  ctx.fillRect(0, 0, logicalW, logicalH);
  
  // Subtle modern grid
  ctx.strokeStyle = bkColor('line');
  ctx.lineWidth = 1;
  for(let x=0; x<logicalW; x+=40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,logicalH); ctx.stroke(); }
  for(let y=0; y<logicalH; y+=40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(logicalW,y); ctx.stroke(); }
  
  function getDrawColor(colorCode) {
    if (!showColorCharge) return COLORS.neutral;
    return COLORS[colorCode] || COLORS.neutral;
  }

  // Draw Proton Shell
  ctx.save();
  const shellRadius = 130;
  ctx.fillStyle = bkThemeMode() === "dark" ? "rgba(244, 67, 54, 0.05)" : "rgba(244, 67, 54, 0.1)"; // Red bag
  ctx.beginPath();
  if (bkUi() === "neo") {
    for(let i=0; i<8; i++) {
      const a = (Math.PI * 2 / 8) * i;
      const px = centerPoint.x + Math.cos(a) * shellRadius;
      const py = centerPoint.y + Math.sin(a) * shellRadius;
      if (i===0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else {
    ctx.arc(centerPoint.x, centerPoint.y, shellRadius, 0, Math.PI * 2);
  }
  ctx.fill();
  
  ctx.strokeStyle = "rgba(244, 67, 54, 0.4)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.stroke();
  
  // Label for proton
  ctx.fillStyle = bkThemeMode() === "dark" ? "#ffffff" : "#1a1a1a";
  ctx.font = "bold 20px 'Inter', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Proton (+1e)", centerPoint.x, centerPoint.y - shellRadius - 15);
  ctx.restore();

  // Draw Central String Junction
  if (proton.length === 3) {
    ctx.fillStyle = "#888";
    ctx.beginPath();
    ctx.arc(centerPoint.x, centerPoint.y, 8, 0, Math.PI*2);
    ctx.fill();
    
    // Core glow
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(centerPoint.x, centerPoint.y, 3, 0, Math.PI*2);
    ctx.fill();
  }

  // Draw Proton Flux Tubes and save control points for gluons
  const cpMap = new Map();
  for (const q of proton) {
    // Dist is the actual visual distance on screen
    let dist = Math.hypot(q.x - centerPoint.x, q.y - centerPoint.y);
    const maxStretch = 180 + (strongForce * 125);
    
    // Visual tension approaches 1.0 as the quark reaches its maximum visual stretch
    const tension = Math.min(1.0, dist / (maxStretch * 0.9));
    const cp = drawFluxTube(ctx, centerPoint.x, centerPoint.y, q.x, q.y, tension, lastTime/1000, false);
    cpMap.set(q, cp);
  }
  
  // Draw Meson Flux Tubes
  for (const m of mesons) {
    ctx.globalAlpha = Math.min(1.0, m.life);
    drawFluxTube(ctx, m.q1.x, m.q1.y, m.q2.x, m.q2.y, 0, lastTime/1000, true);
    ctx.globalAlpha = 1.0;
  }

  // Draw Gluons (Realistic energetic streaks along the bezier curve)
  for (const g of gluons) {
    const cpSource = cpMap.get(g.source) || centerPoint;
    const cpTarget = cpMap.get(g.target) || centerPoint;
    
    ctx.save();
    ctx.globalCompositeOperation = bkThemeMode() === "dark" ? "screen" : "source-over";
    ctx.beginPath();
    
    // Draw a streak instead of a circle
    const trailLength = 0.3; // % of string
    const startP = Math.max(0, g.progress - trailLength);
    const endP = g.progress;
    
    // Sample points along the path
    for(let p = startP; p <= endP; p += 0.05) {
      let pos;
      if (p < 0.5) {
        const t = p * 2;
        // From source to center
        pos = getBezierPoint(1-t, centerPoint.x, centerPoint.y, cpSource.cx, cpSource.cy, g.source.x, g.source.y);
      } else {
        const t = (p - 0.5) * 2;
        // From center to target
        pos = getBezierPoint(t, centerPoint.x, centerPoint.y, cpTarget.cx, cpTarget.cy, g.target.x, g.target.y);
      }
      
      if (p === startP) ctx.moveTo(pos.x, pos.y);
      else ctx.lineTo(pos.x, pos.y);
    }
    
    ctx.lineCap = "round";
    ctx.lineWidth = 14;
    ctx.strokeStyle = getDrawColor(g.c1);
    ctx.stroke();
    
    // Core of the streak
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    
    ctx.restore();
  }

  // Draw Shockwaves
  for (const sw of shockwaves) sw.draw(ctx);

  // Clean Vector Quarks
  function drawQuark(q, alpha = 1.0) {
    ctx.save();
    ctx.globalAlpha = alpha;
    
    const colorStr = getDrawColor(q.color);
    
    const scale = q.isDragging ? 1.15 : (q.hover ? 1.05 : 1.0);
    const radius = QUARK_RADIUS * scale;
    const ui = bkUi();
    
    // Shadow
    if (ui === "neo") {
      ctx.fillStyle = bkThemeMode() === "dark" ? "#ffffff" : "#1a1a1a";
      ctx.beginPath();
      ctx.arc(q.x + 4, q.y + 4, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.shadowColor = bkThemeMode() === "dark" ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.2)";
      ctx.shadowBlur = 15;
      ctx.shadowOffsetY = 6;
    }
    
    // Core (Clean Vector in Dark Mode)
    ctx.beginPath();
    ctx.arc(q.x, q.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = colorStr;
    ctx.fill();
    
    if (ui === "neo") {
      ctx.lineWidth = 2;
      ctx.strokeStyle = bkThemeMode() === "dark" ? "#ffffff" : "#1a1a1a";
      ctx.stroke();
    } else {
      // Subtle inner highlight
      ctx.beginPath();
      ctx.arc(q.x, q.y, radius - 2, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    
    // Remove shadow for text
    ctx.shadowColor = "transparent";
    
    // Text
    ctx.fillStyle = "#ffffff"; 
    ctx.font = "bold 20px 'Inter', 'Helvetica Neue', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(q.flavor, q.x, q.y + 2);
    
    ctx.restore();
  }

  for (const q of proton) drawQuark(q);
  for (const m of mesons) {
    drawQuark(m.q1, Math.min(1.0, m.life));
    drawQuark(m.q2, Math.min(1.0, m.life));
  }

  // Modern UI Overlay
  ctx.save();
  
  ctx.fillStyle = bkThemeMode() === "dark" ? "#cccccc" : "#666666";
  ctx.font = "500 16px 'Inter', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Drag a quark to stretch the strong force. A new meson will form if the string breaks.", logicalW / 2, logicalH - 30);
  
  // Draw Tension Meter if dragging!
  if (isTensionActive) {
    const meterWidth = 400;
    const meterHeight = 12;
    const meterX = logicalW / 2 - meterWidth / 2;
    const meterY = logicalH - 80;
    
    // Background bar
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.beginPath();
    ctx.roundRect(meterX, meterY, meterWidth, meterHeight, 6);
    ctx.fill();
    
    // Fill bar
    ctx.beginPath();
    ctx.roundRect(meterX, meterY, meterWidth * currentTensionPercent, meterHeight, 6);
    
    if (currentTensionPercent < 0.7) ctx.fillStyle = "#4caf50";
    else if (currentTensionPercent < 0.95) ctx.fillStyle = "#ff9800";
    else {
      ctx.fillStyle = "#f44336"; // Red! Danger!
      ctx.shadowColor = "#f44336";
      ctx.shadowBlur = 10;
    }
    ctx.fill();
    ctx.shadowBlur = 0; // reset
    
    // Text label
    ctx.fillStyle = bkThemeMode() === "dark" ? "#ffffff" : "#1a1a1a";
    ctx.font = "bold 14px 'Inter', sans-serif";
    if (currentTensionPercent >= 1.0) {
      ctx.fillText("STRING BROKEN!", logicalW / 2, meterY - 15);
    } else if (currentTensionPercent > 0.95) {
      ctx.fillText("SNAP IMMINENT!", logicalW / 2, meterY - 15);
    } else {
      ctx.fillText(`String Tension: ${Math.floor(currentTensionPercent * 100)}% (Keep pulling!)`, logicalW / 2, meterY - 15);
    }
  }
  
  ctx.restore();
}

window.bkSetup(1200, 800, draw);
