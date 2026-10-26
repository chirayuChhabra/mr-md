// ============================================================
//  Orbital Slingshot Maneuver - Step-by-Step Simulation Lab
//  Aspect Ratio: 16:9 (800x450 logical canvas)
//  Fully theme-integrated via window.bkColor, window.bkThemeMode, & window.bkUi
// ============================================================

let currentStep = 0;
if (window.__simProps && window.__simProps.step !== undefined) {
  currentStep = window.__simProps.step;
}

// Global physics & state
let simTime = 0;
let probe = null;
let trail = [];
let particles = [];
let solved = false;
let isDragging = false;
let stationAngle = 0;
let isHoveringAim = false;
let restartTimer = null;

// ─── Procedural Web Audio Engine (Continuous Dynamic Gravity, Thrusters & Explosions) ───
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.masterGain = null;

    // Continuous dynamic gravity resonance nodes (low, warm cosmic warp hum)
    this.gravityOsc = null;
    this.gravityFilter = null;
    this.gravityGain = null;

    // Continuous dynamic atmospheric friction nodes (Martian aerobraking noise)
    this.atmoNoise = null;
    this.atmoFilter = null;
    this.atmoGain = null;

    this.lastTickTime = 0;
    this.lastTickAngle = 0;
    this.lastTickSpeed = 0;
    this.nodesStarted = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    if (typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.24, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
      this.setupContinuousNodes();
    } catch (e) {
      console.warn("AudioContext init error:", e);
    }
  }

  setupContinuousNodes() {
    if (!this.ctx || this.nodesStarted) return;
    try {
      const now = this.ctx.currentTime;

      // 1. Dynamic Gravitational Slingshot Resonance Synthesizer
      // Smooth, warm sine oscillator through a lowpass filter (low cosmic warp hum, NO high-pitch screech!)
      this.gravityOsc = this.ctx.createOscillator();
      this.gravityOsc.type = "sine";
      this.gravityOsc.frequency.setValueAtTime(60, now);

      this.gravityFilter = this.ctx.createBiquadFilter();
      this.gravityFilter.type = "lowpass";
      this.gravityFilter.frequency.setValueAtTime(140, now);
      this.gravityFilter.Q.setValueAtTime(1.0, now);

      this.gravityGain = this.ctx.createGain();
      this.gravityGain.gain.setValueAtTime(0.0001, now);

      this.gravityOsc.connect(this.gravityFilter);
      this.gravityFilter.connect(this.gravityGain);
      this.gravityGain.connect(this.masterGain);
      this.gravityOsc.start(now);

      // 2. Dynamic Atmospheric Aerobraking Friction Synthesizer
      // Smooth aerothermal hiss as probe enters Martian atmosphere
      const sampleRate = this.ctx.sampleRate;
      const bufferSize = sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      this.atmoNoise = this.ctx.createBufferSource();
      this.atmoNoise.buffer = noiseBuffer;
      this.atmoNoise.loop = true;

      this.atmoFilter = this.ctx.createBiquadFilter();
      this.atmoFilter.type = "bandpass";
      this.atmoFilter.frequency.setValueAtTime(420, now);
      this.atmoFilter.Q.setValueAtTime(1.6, now);

      this.atmoGain = this.ctx.createGain();
      this.atmoGain.gain.setValueAtTime(0.0001, now);

      this.atmoNoise.connect(this.atmoFilter);
      this.atmoFilter.connect(this.atmoGain);
      this.atmoGain.connect(this.masterGain);
      this.atmoNoise.start(now);

      this.nodesStarted = true;
    } catch (err) {
      console.warn("Continuous audio init error:", err);
    }
  }

  setEnabled(val) {
    this.enabled = !!val;
    if (!this.enabled) {
      this.silenceContinuous();
    }
  }

  playSlingshot() {
    // Handled continuously by updateFlightAudio
  }

  silenceContinuous() {
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      if (this.gravityGain) {
        this.gravityGain.gain.cancelScheduledValues(now);
        this.gravityGain.gain.setValueAtTime(0.0001, now);
      }
      if (this.atmoGain) {
        this.atmoGain.gain.cancelScheduledValues(now);
        this.atmoGain.gain.setValueAtTime(0.0001, now);
      }
    } catch (e) {}
  }

  // Real-time modulation called every animation frame during active flight
  updateFlightAudio(probe, bodies) {
    if (!this.enabled) {
      this.silenceContinuous();
      return;
    }
    if (!this.ctx || this.ctx.state !== "running" || !this.nodesStarted) return;

    // Safety silence: if probe not actively launched or in terminal state, kill audio
    if (!probe || !probe.hasLaunched || probe.crashed || probe.docked || probe.orbitingMars || probe.escaped || probe.flightTime < 0.1) {
      this.silenceContinuous();
      return;
    }

    const now = this.ctx.currentTime;
    const probeSpeed = Math.hypot(probe.vx, probe.vy);

    // Calculate maximum gravitational proximity across celestial bodies
    let maxProximity = 0;
    let closestBody = null;
    let atmoDepth = 0;

    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const dist = Math.hypot(b.x - probe.x, b.y - probe.y);
      const surfaceDist = Math.max(0, dist - b.r);
      const influenceZone = b.r * 3.5;
      const proximity = Math.max(0, Math.min(1, 1 - (surfaceDist / influenceZone)));

      if (proximity > maxProximity) {
        maxProximity = proximity;
        closestBody = b;
      }

      if (b.atmR && dist < b.atmR && dist > b.r) {
        atmoDepth = Math.max(0, Math.min(1, (b.atmR - dist) / (b.atmR - b.r)));
      }
    }

    // 1. Modulate Gravitational Slingshot Resonance:
    // Warm low sine tone (55Hz to 140Hz max) with auto-decay dead man's switch.
    // If the simulation is paused or frame loop stops, it decays to 0.0001 in 80ms!
    if (this.gravityGain && this.gravityOsc && this.gravityFilter) {
      const targetGain = maxProximity > 0.05
        ? Math.min(0.22, Math.pow(maxProximity, 1.8) * 0.20 + (probeSpeed / 30) * 0.04)
        : 0.0001;

      const targetFreq = 55 + maxProximity * 85 + (probeSpeed / 25) * 15;
      const targetFilter = 120 + maxProximity * 220 + (probeSpeed / 25) * 40;

      this.gravityGain.gain.cancelScheduledValues(now);
      this.gravityGain.gain.setValueAtTime(this.gravityGain.gain.value, now);
      this.gravityGain.gain.linearRampToValueAtTime(targetGain, now + 0.03);
      this.gravityGain.gain.linearRampToValueAtTime(0.0001, now + 0.08);

      this.gravityOsc.frequency.setTargetAtTime(targetFreq, now, 0.03);
      this.gravityFilter.frequency.setTargetAtTime(targetFilter, now, 0.03);
    }

    // 2. Modulate Atmospheric Drag Friction:
    if (this.atmoGain && this.atmoFilter) {
      if (atmoDepth > 0) {
        const targetAtmoGain = Math.min(0.30, Math.pow(atmoDepth, 1.4) * 0.26 + 0.04);
        const targetAtmoFilter = 320 + atmoDepth * 1100;
        this.atmoGain.gain.cancelScheduledValues(now);
        this.atmoGain.gain.setValueAtTime(this.atmoGain.gain.value, now);
        this.atmoGain.gain.linearRampToValueAtTime(targetAtmoGain, now + 0.03);
        this.atmoGain.gain.linearRampToValueAtTime(0.0001, now + 0.08);
        this.atmoFilter.frequency.setTargetAtTime(targetAtmoFilter, now, 0.03);
      } else {
        this.atmoGain.gain.cancelScheduledValues(now);
        this.atmoGain.gain.setValueAtTime(0.0001, now);
      }
    }
  }

  // 1. Rocket Thruster Ignition (Subtle, sleek RCS / cold-gas thruster burst)
  playLaunch() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || this.ctx.state !== "running") return;
    try {
      const now = this.ctx.currentTime;

      // Soft low-frequency propellant puff (gentle sine wave, NOT loud sawtooth)
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(80, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.18);

      oscGain.gain.setValueAtTime(0.09, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.20);

      osc.connect(oscGain);
      oscGain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.22);

      // Subtle aerodynamic exhaust hiss (soft pink/white noise puff)
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.22);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const nFilter = this.ctx.createBiquadFilter();
      nFilter.type = "lowpass";
      nFilter.frequency.setValueAtTime(450, now);
      nFilter.frequency.exponentialRampToValueAtTime(100, now + 0.22);

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.08, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      noise.connect(nFilter);
      nFilter.connect(nGain);
      nGain.connect(this.masterGain);
      noise.start(now);
    } catch (err) {}
  }

  // 2. Visceral Surface Crash / Collision Impact (Sharp crunch + heavy seismic explosion)
  playCrash(speed = 10) {
    if (!this.enabled) return;
    this.silenceContinuous();
    this.init();
    if (!this.ctx || this.ctx.state !== "running") return;

    try {
      const now = this.ctx.currentTime;
      const intensity = Math.min(1.6, Math.max(0.7, speed / 11));

      // A. High-frequency metal crunch / structural fracture transient
      const crunchOsc = this.ctx.createOscillator();
      const crunchGain = this.ctx.createGain();
      crunchOsc.type = "square";
      crunchOsc.frequency.setValueAtTime(1800, now);
      crunchOsc.frequency.exponentialRampToValueAtTime(70, now + 0.14);
      crunchGain.gain.setValueAtTime(0.55 * intensity, now);
      crunchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      crunchOsc.connect(crunchGain);
      crunchGain.connect(this.masterGain);
      crunchOsc.start(now);
      crunchOsc.stop(now + 0.16);

      // B. Heavy seismic explosion detonation sub-drop
      const thudOsc = this.ctx.createOscillator();
      const thudGain = this.ctx.createGain();
      thudOsc.type = "sine";
      thudOsc.frequency.setValueAtTime(170, now);
      thudOsc.frequency.exponentialRampToValueAtTime(22, now + 0.8);
      thudGain.gain.setValueAtTime(0.6 * intensity, now);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
      thudOsc.connect(thudGain);
      thudGain.connect(this.masterGain);
      thudOsc.start(now);
      thudOsc.stop(now + 0.9);

      // C. Dispersing fireball & shattering debris noise boom
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.95);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

      const debris = this.ctx.createBufferSource();
      debris.buffer = buffer;
      const dFilter = this.ctx.createBiquadFilter();
      dFilter.type = "lowpass";
      dFilter.frequency.setValueAtTime(500, now);
      dFilter.frequency.exponentialRampToValueAtTime(55, now + 0.95);

      const dGain = this.ctx.createGain();
      dGain.gain.setValueAtTime(0.55 * intensity, now);
      dGain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);

      debris.connect(dFilter);
      dFilter.connect(dGain);
      dGain.connect(this.masterGain);
      debris.start(now);
    } catch (err) {}
  }

  // 3. Subtle Mechanical Docking Clamp Latch (Clean & understated, NO musical fanfare)
  playDock() {
    if (!this.enabled) return;
    this.silenceContinuous();
    this.init();
    if (!this.ctx || this.ctx.state !== "running") return;

    try {
      const now = this.ctx.currentTime;
      // Soft mechanical latch click
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(75, now + 0.06);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.08);
    } catch (err) {}
  }

  // 4. Stable Orbit Telemetry Lock (Silent & clean, NO musical fanfare)
  playOrbitCapture() {
    if (!this.enabled) return;
    this.silenceContinuous();
  }

  // 5. Tactile Gear Ratchet Shift (Crisp mechanical gear teeth clicks on tiny movements)
  playAimTick(angle, speed) {
    if (!this.enabled) return;
    const now = Date.now();
    if (now - this.lastTickTime < 28) return;

    const dAngle = Math.abs(angle - this.lastTickAngle);
    const dSpeed = Math.abs(speed - this.lastTickSpeed);
    if (dAngle < 0.045 && dSpeed < 0.28) return;

    this.lastTickTime = now;
    this.lastTickAngle = angle;
    this.lastTickSpeed = speed;

    this.init();
    if (!this.ctx || this.ctx.state !== "running") return;
    try {
      const t = this.ctx.currentTime;

      // 1. Crisp gear tooth escapement click (sharp mechanical cog transient)
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(1450 + Math.min(500, speed * 25), t);
      osc1.frequency.exponentialRampToValueAtTime(320, t + 0.014);

      gain1.gain.setValueAtTime(0.08, t);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.016);

      osc1.connect(gain1);
      gain1.connect(this.masterGain);
      osc1.start(t);
      osc1.stop(t + 0.018);

      // 2. Secondary metallic gear spring catch (6ms later, produces the "gear shift" ratchet feel)
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(780 + Math.min(300, speed * 18), t + 0.006);
      osc2.frequency.exponentialRampToValueAtTime(240, t + 0.022);

      gain2.gain.setValueAtTime(0.05, t + 0.006);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.024);

      osc2.connect(gain2);
      gain2.connect(this.masterGain);
      osc2.start(t + 0.006);
      osc2.stop(t + 0.026);
    } catch (err) {}
  }
}

const sfx = new SoundEngine();

// Synchronize audio state with mr-md host simulation controls
let soundEnabled = window.__simProps?.sound ?? true;
sfx.setEnabled(soundEnabled);

window.addEventListener("bk:props", (e) => {
  if (e.detail && typeof e.detail.sound === "boolean") {
    soundEnabled = e.detail.sound;
    sfx.setEnabled(soundEnabled);
  }
});

// Immediately silence audio whenever parent posts pause or step switch messages
window.addEventListener("message", (e) => {
  if (!e.data) return;
  const t = e.data.type;
  if (t === "bk:pause" || t === "bk:steps-set-step" || t === "bk:steps-reset-step") {
    sfx.silenceContinuous();
  }
  if (t === "bk:pause" && sfx.ctx && sfx.ctx.state === "running") {
    sfx.ctx.suspend().catch(() => {});
  } else if (t === "bk:play" && sfx.ctx && sfx.ctx.state === "suspended") {
    sfx.ctx.resume().catch(() => {});
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    sfx.silenceContinuous();
    if (sfx.ctx && sfx.ctx.state === "running") {
      sfx.ctx.suspend().catch(() => {});
    }
  }
});

window.addEventListener("blur", () => {
  sfx.silenceContinuous();
});

// Starfield generation (for Dark Mode only)
const STARS_COUNT = 75;
const STARS = [];
for (let i = 0; i < STARS_COUNT; i++) {
  STARS.push({
    x: (i * 137.508) % 800,
    y: (i * 219.341) % 450,
    r: (i % 5 === 0) ? 1.6 : (i % 2 === 0 ? 1.1 : 0.8),
    phase: (i * 1.7) % (Math.PI * 2),
    speed: 1.5 + (i % 4) * 0.7
  });
}

function getStepData(stepIdx) {
  if (stepIdx === 0) {
    // Step 1: Sub-Orbital Insertion to Station Alpha
    return {
      name: "Orbital Insertion",
      bodies: [
        { name: "Earth", x: 190, y: 240, r: 38, gm: 3400, color: "#38bdf8", glow: "rgba(56, 189, 248, 0.28)" }
      ],
      target: { name: "Station Alpha", x: 490, y: 230, r: 36, isStation: true },
      launch: { x: 190, y: 196, onBody: true },
      v0: { x: 10.5, y: -5.5 },
      arrowScale: 8,
      minSpeed: 4.0,
      maxSpeed: 20.0,
      feedback: "Orbital insertion achieved! Earth's gravitational acceleration curved the spacecraft's trajectory into an elliptical transfer arc, successfully docking with Station Alpha."
    };
  } else if (stepIdx === 1) {
    // Step 2: Jupiter Gravity Assist Slingshot
    return {
      name: "Planetary Slingshot",
      bodies: [
        { name: "Earth", x: 100, y: 300, r: 24, gm: 1500, color: "#38bdf8", glow: "rgba(56, 189, 248, 0.22)" },
        { name: "Jupiter", x: 360, y: 240, r: 42, gm: 6000, color: "#fb923c", glow: "rgba(251, 146, 60, 0.32)", isJupiter: true }
      ],
      target: { name: "Outpost Gamma", x: 640, y: 150, r: 35, isStation: true },
      launch: { x: 100, y: 272, onBody: true },
      v0: { x: 13.0, y: -1.2 },
      arrowScale: 7.0,
      minSpeed: 6.0,
      maxSpeed: 24.0,
      feedback: "Slingshot confirmed! By diving through Jupiter's deep gravitational well, the spacecraft extracted orbital momentum to accelerate to escape velocity and safely rendezvous with Outpost Gamma."
    };
  } else {
    // Step 3: Mars Atmospheric Aerobraking
    return {
      name: "Atmospheric Aerobraking",
      bodies: [
        {
          name: "Mars", x: 480, y: 230, r: 40, gm: 6400,
          color: "#f87171", glow: "rgba(248, 113, 113, 0.25)",
          atmR: 96, dragCoeff: 0.10
        }
      ],
      target: {
        name: "Low Mars Orbit", x: 480, y: 230, minR: 50, maxR: 86,
        r: 68, color: "#34d399", isRing: true
      },
      launch: { x: 80, y: 80, onBody: false },
      v0: { x: 11.5, y: -0.8 },
      arrowScale: 8,
      minSpeed: 5.0,
      maxSpeed: 22.0,
      feedback: "Aerobraking successful! Upper atmospheric friction safely dissipated hyper-orbital kinetic energy into heat, permanently capturing the spacecraft into a stable Martian orbit."
    };
  }
}

let stepData = getStepData(currentStep);
let currentV0 = { ...stepData.v0 };

function createFreshProbe() {
  return {
    x: stepData.launch.x,
    y: stepData.launch.y,
    vx: currentV0.x,
    vy: currentV0.y,
    hasLaunched: false,
    crashed: false,
    escaped: false,
    captured: false,
    docked: false,
    dockOffsetAngle: 0,
    dockRadius: 16,
    orbitingMars: false,
    orbitR: 68,
    orbitAngle: 0,
    orbitOmega: 0.016,
    flightTime: 0,
    minMarsD: 9999,
    hasPassedAtmosphere: false,
    crashSpeed: 0,
    playedFlyby: false,
    playedAtmo: false
  };
}

function resetProbe(autoLaunch = false) {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  sfx.silenceContinuous();
  probe = createFreshProbe();
  probe.hasLaunched = autoLaunch;
  trail = [];
  particles = [];
  simTime = 0;
  solved = false;
}

function initStep(stepIdx) {
  currentStep = stepIdx;
  stepData = getStepData(currentStep);
  currentV0 = { ...stepData.v0 };
  resetProbe(false);
}

initStep(currentStep);

// Handle step transitions & resets from parent mr-md card
if (typeof window.bkOnStep === "function") {
  window.bkOnStep((stepIndex) => {
    initStep(stepIndex);
  });
}
if (typeof window.bkOnReset === "function") {
  window.bkOnReset(() => {
    initStep(currentStep);
  });
}

// ─── Render Spacecraft (Detailed, Sleek, Futuristic) ───
function drawSpacecraft(ctx, x, y, angle, options = {}) {
  const { isThrusting = true, scale = 1.0, isDocked = false, isCapture = false, isDark = true } = options;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);

  // 1. Thruster Plume (Dynamic animated plasma)
  if (isThrusting && !isDocked) {
    const flameLen = 14 + Math.sin(simTime * 28) * 4;
    const flameW = 4.5 + Math.cos(simTime * 24) * 1.5;

    const plumeGrad = ctx.createLinearGradient(0, 0, -flameLen, 0);
    plumeGrad.addColorStop(0, "rgba(56, 189, 248, 0.9)");
    plumeGrad.addColorStop(0.5, "rgba(99, 102, 241, 0.6)");
    plumeGrad.addColorStop(1, "rgba(236, 72, 153, 0)");

    ctx.fillStyle = plumeGrad;
    ctx.beginPath();
    ctx.moveTo(-9, 0);
    ctx.quadraticCurveTo(-9 - flameLen * 0.5, -flameW, -9 - flameLen, 0);
    ctx.quadraticCurveTo(-9 - flameLen * 0.5, flameW, -9, 0);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(-9, -2);
    ctx.lineTo(-9 - flameLen * 0.45, 0);
    ctx.lineTo(-9, 2);
    ctx.closePath();
    ctx.fill();
  }

  // 2. Solar Arrays (Twin blue wings with photovoltaic grid)
  const panelColor = isDark ? "#0284c7" : "#0369a1";
  const panelHighlight = isDark ? "#7dd3fc" : "#bae6fd";
  const strutColor = isDark ? "#64748b" : "#475569";

  ctx.strokeStyle = strutColor;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -5); ctx.lineTo(0, -18);
  ctx.moveTo(0, 5);  ctx.lineTo(0, 18);
  ctx.stroke();

  // Port Solar Wing
  ctx.fillStyle = panelColor;
  ctx.fillRect(-6, -18, 12, 10);
  ctx.strokeStyle = panelHighlight;
  ctx.lineWidth = 0.8;
  ctx.strokeRect(-6, -18, 12, 10);
  ctx.beginPath();
  ctx.moveTo(0, -18); ctx.lineTo(0, -8);
  ctx.moveTo(-6, -13); ctx.lineTo(6, -13);
  ctx.stroke();

  // Starboard Solar Wing
  ctx.fillStyle = panelColor;
  ctx.fillRect(-6, 8, 12, 10);
  ctx.strokeStyle = panelHighlight;
  ctx.strokeRect(-6, 8, 12, 10);
  ctx.beginPath();
  ctx.moveTo(0, 8); ctx.lineTo(0, 18);
  ctx.moveTo(-6, 13); ctx.lineTo(6, 13);
  ctx.stroke();

  // 3. Engine Nozzle / Bell (Titanium)
  ctx.fillStyle = isDark ? "#334155" : "#1e293b";
  ctx.beginPath();
  ctx.moveTo(-7, -3.5);
  ctx.lineTo(-10, -5);
  ctx.lineTo(-10, 5);
  ctx.lineTo(-7, 3.5);
  ctx.closePath();
  ctx.fill();

  // 4. Main Fuselage / Capsule Body
  const hullGrad = ctx.createLinearGradient(0, -5, 0, 5);
  if (isCapture || isDocked) {
    hullGrad.addColorStop(0, "#34d399");
    hullGrad.addColorStop(0.5, "#10b981");
    hullGrad.addColorStop(1, "#047857");
  } else {
    hullGrad.addColorStop(0, isDark ? "#f8fafc" : "#e2e8f0");
    hullGrad.addColorStop(0.5, isDark ? "#cbd5e1" : "#94a3b8");
    hullGrad.addColorStop(1, isDark ? "#64748b" : "#475569");
  }

  ctx.fillStyle = hullGrad;
  ctx.beginPath();
  ctx.moveTo(11, 0);
  ctx.lineTo(6, -4.5);
  ctx.lineTo(-7, -4.5);
  ctx.lineTo(-7, 4.5);
  ctx.lineTo(6, 4.5);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = isCapture || isDocked ? "#10b981" : (isDark ? "#38bdf8" : "#0284c7");
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // 5. Avionics Visor / Viewport Glow
  ctx.fillStyle = isCapture || isDocked ? "#6ee7b7" : "#38bdf8";
  ctx.beginPath();
  ctx.ellipse(4, 0, 2.5, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // 6. Forward Docking Adapter Ring
  ctx.fillStyle = isDark ? "#f1f5f9" : "#0f172a";
  ctx.fillRect(10, -1.5, 2.5, 3);

  // 7. Nav Beacon Lights (Blinking)
  const navBlink = (Math.floor(simTime * 4) % 2 === 0);
  if (navBlink) {
    ctx.fillStyle = "#ef4444";
    ctx.beginPath(); ctx.arc(-4, -5.5, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#22c55e";
    ctx.beginPath(); ctx.arc(-4, 5.5, 1.2, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();
}

// ─── Render Space Stations (Alpha & Outpost Gamma) ───
function drawSpaceStation(ctx, target, isSolved, isDark, accent) {
  ctx.save();
  ctx.translate(target.x, target.y);

  const pulse = Math.sin(simTime * 4) * 2.5;
  ctx.strokeStyle = isSolved
    ? (isDark ? "rgba(16, 185, 129, 0.7)" : "rgba(5, 150, 105, 0.75)")
    : (isDark ? "rgba(52, 211, 153, 0.45)" : "rgba(4, 120, 87, 0.5)");
  ctx.lineWidth = isSolved ? 2 : 1.5;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(0, 0, target.r + (isSolved ? 0 : pulse), 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.rotate(stationAngle);

  // Solar Wing Trusses
  ctx.fillStyle = isDark ? "#0284c7" : "#0369a1";
  ctx.fillRect(-34, -4, 20, 8);
  ctx.fillRect(14, -4, 20, 8);

  ctx.strokeStyle = isDark ? "#38bdf8" : "#bae6fd";
  ctx.lineWidth = 1;
  ctx.strokeRect(-34, -4, 20, 8);
  ctx.strokeRect(14, -4, 20, 8);

  // Connecting truss backbone
  ctx.strokeStyle = isDark ? "#94a3b8" : "#64748b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-36, 0); ctx.lineTo(36, 0);
  ctx.stroke();

  // Central Pressurized Habitat Module
  const habGrad = ctx.createRadialGradient(-2, -2, 2, 0, 0, 12);
  habGrad.addColorStop(0, isSolved ? "#d1fae5" : (isDark ? "#f8fafc" : "#e2e8f0"));
  habGrad.addColorStop(0.7, isSolved ? "#10b981" : (isDark ? "#475569" : "#334155"));
  habGrad.addColorStop(1, isSolved ? "#047857" : "#0f172a");

  ctx.fillStyle = habGrad;
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = isSolved ? "#10b981" : accent;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Docking Ring Collar
  ctx.strokeStyle = isSolved ? "#34d399" : (isDark ? "#38bdf8" : "#0284c7");
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, 15, -Math.PI * 0.35, Math.PI * 0.35);
  ctx.stroke();

  // Docking Beacon Lights
  const beaconBlink = Math.sin(simTime * 6) > 0;
  ctx.fillStyle = isSolved ? "#10b981" : (beaconBlink ? "#f59e0b" : "#64748b");
  ctx.beginPath();
  ctx.arc(15, -6, 1.8, 0, Math.PI * 2);
  ctx.arc(15, 6, 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Station Label
  ctx.fillStyle = isSolved ? (isDark ? "#34d399" : "#047857") : (isDark ? "#f8fafc" : "#0f172a");
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(target.name.toUpperCase(), target.x, target.y + target.r + 15);
}

// ─── Trajectory Prediction Corridor (~40-50% arc for intuitive aiming) ───
function computePredictionPath(v0) {
  const points = [];
  let px = stepData.launch.x;
  let py = stepData.launch.y;
  let pvx = v0.x;
  let pvy = v0.y;
  const subSteps = 6;
  const dt = 0.05;
  const maxSteps = 100; // ~40-50% of trajectory transfer corridor

  points.push({ x: px, y: py });

  for (let s = 0; s < maxSteps; s++) {
    for (let sub = 0; sub < subSteps; sub++) {
      let ax = 0;
      let ay = 0;
      for (const b of stepData.bodies) {
        const dx = b.x - px;
        const dy = b.y - py;
        const dist = Math.max(8, Math.hypot(dx, dy));

        // Stop early if colliding with celestial body
        if (dist < b.r + 3 && s > 2) {
          return points;
        }

        const f = b.gm / (dist * dist * dist);
        ax += dx * f;
        ay += dy * f;

        if (b.atmR && dist < b.atmR && dist > b.r) {
          const penetration = (b.atmR - dist) / (b.atmR - b.r);
          const dragFactor = b.dragCoeff * penetration;
          ax -= pvx * dragFactor;
          ay -= pvy * dragFactor;
        }
      }

      pvx += ax * dt;
      pvy += ay * dt;
      px += pvx * dt;
      py += pvy * dt;
    }

    // Never pass through or cut into destination space station
    if (stepData.target && stepData.target.isStation) {
      const dTarget = Math.hypot(px - stepData.target.x, py - stepData.target.y);
      if (dTarget < stepData.target.r + 15) {
        break;
      }
    }

    // Stop before inner Mars ring boundary
    if (stepData.target && stepData.target.isRing) {
      const mars = stepData.bodies[0];
      const dMars = Math.hypot(px - mars.x, py - mars.y);
      if (dMars < stepData.target.minR + 6) {
        break;
      }
    }

    points.push({ x: px, y: py });

    if (px < -40 || px > 840 || py < -40 || py > 490) {
      break;
    }
  }

  return points;
}

function drawPredictionArc(ctx, points, isDark, accent) {
  if (points.length < 2) return;

  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.8;

  // Draw arc segments with progressive alpha fade-out towards the 40-50% tip
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const progress = i / (points.length - 1);
    // Smooth fade: from 0.75 near ship down to 0.06 at tip
    const alpha = (1 - progress * 0.9) * (isDark ? 0.75 : 0.65);

    ctx.strokeStyle = isDark
      ? `rgba(56, 189, 248, ${alpha})`
      : `rgba(2, 132, 199, ${alpha})`;

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  // Draw subtle directional tip marker at the 40-50% preview tip
  const lastPt = points[points.length - 1];
  const prevPt = points[Math.max(0, points.length - 4)];
  const tipAngle = Math.atan2(lastPt.y - prevPt.y, lastPt.x - prevPt.x);

  ctx.setLineDash([]);
  ctx.fillStyle = isDark ? "rgba(56, 189, 248, 0.45)" : "rgba(2, 132, 199, 0.45)";
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.2;

  ctx.save();
  ctx.translate(lastPt.x, lastPt.y);
  ctx.rotate(tipAngle);

  // Precision forward chevron pip
  ctx.beginPath();
  ctx.moveTo(3, 0);
  ctx.lineTo(-4, -3);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-4, 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
  ctx.restore();
}

// ─── Main Canvas Render Loop ───
window.bkSetup(800, 450, (ctx, W, H) => {
  simTime += 0.025;
  stationAngle += 0.012;

  const isDark = window.bkThemeMode() === "dark";
  const bg = isDark ? (window.bkColor("bg") || "#070b14") : "#f1f5f9";
  const text = isDark ? (window.bkColor("text") || "#f8fafc") : "#09090b";
  const textLight = isDark ? (window.bkColor("text-light") || "#94a3b8") : "#475569";
  const accent = isDark ? "#38bdf8" : "#0284c7";
  const targetColor = solved ? "#10b981" : (isDark ? "#34d399" : "#047857");

  // 1. Atmosphere / Space Canvas Background
  if (isDark) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Deep space stars only in Dark Mode
    for (let i = 0; i < STARS.length; i++) {
      const s = STARS[i];
      const twinkle = 0.5 + 0.5 * Math.sin(simTime * s.speed + s.phase);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.18 + twinkle * 0.35})`;
      ctx.fill();
    }
  } else {
    // Elegant daylight aerospace terminal background (no stars, soft technical gradient)
    const lightBg = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, 450);
    lightBg.addColorStop(0, "#f8fafc");
    lightBg.addColorStop(0.7, "#f1f5f9");
    lightBg.addColorStop(1, "#e2e8f0");
    ctx.fillStyle = lightBg;
    ctx.fillRect(0, 0, W, H);
  }

  // Subtle telemetry range rings centered on the primary planet
  const primaryBody = stepData.bodies[0];
  if (primaryBody) {
    ctx.save();
    const ringStroke = isDark ? "rgba(56, 189, 248, 0.09)" : "rgba(71, 85, 105, 0.12)";
    ctx.strokeStyle = ringStroke;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(primaryBody.x, primaryBody.y, primaryBody.r * 2.2, 0, Math.PI * 2);
    ctx.arc(primaryBody.x, primaryBody.y, primaryBody.r * 3.8, 0, Math.PI * 2);
    ctx.arc(primaryBody.x, primaryBody.y, primaryBody.r * 5.5, 0, Math.PI * 2);
    ctx.stroke();

    // Cardinal coordinate crosshairs through primary body
    ctx.beginPath();
    ctx.moveTo(primaryBody.x - primaryBody.r * 5.8, primaryBody.y);
    ctx.lineTo(primaryBody.x + primaryBody.r * 5.8, primaryBody.y);
    ctx.moveTo(primaryBody.x, primaryBody.y - primaryBody.r * 5.8);
    ctx.lineTo(primaryBody.x, primaryBody.y + primaryBody.r * 5.8);
    ctx.stroke();

    // Small range markers
    ctx.fillStyle = isDark ? "rgba(148, 163, 184, 0.35)" : "rgba(100, 116, 139, 0.45)";
    ctx.font = "8px monospace";
    ctx.textAlign = "left";
    ctx.fillText("10,000 KM", primaryBody.x + primaryBody.r * 2.2 + 4, primaryBody.y - 3);
    ctx.fillText("25,000 KM", primaryBody.x + primaryBody.r * 3.8 + 4, primaryBody.y - 3);
    ctx.restore();
  }

  // 4 Corner registration marks for high-tech aerospace HUD feel
  ctx.save();
  ctx.strokeStyle = isDark ? "rgba(56, 189, 248, 0.22)" : "rgba(71, 85, 105, 0.25)";
  ctx.lineWidth = 1;
  const cLen = 8;
  // Top-left
  ctx.beginPath(); ctx.moveTo(14, 14 + cLen); ctx.lineTo(14, 14); ctx.lineTo(14 + cLen, 14); ctx.stroke();
  // Top-right
  ctx.beginPath(); ctx.moveTo(W - 14 - cLen, 14); ctx.lineTo(W - 14, 14); ctx.lineTo(W - 14, 14 + cLen); ctx.stroke();
  // Bottom-left
  ctx.beginPath(); ctx.moveTo(14, H - 14 - cLen); ctx.lineTo(14, H - 14); ctx.lineTo(14 + cLen, H - 14); ctx.stroke();
  // Bottom-right
  ctx.beginPath(); ctx.moveTo(W - 14 - cLen, H - 14); ctx.lineTo(W - 14, H - 14); ctx.lineTo(W - 14, H - 14 - cLen); ctx.stroke();
  ctx.restore();

  // 2. Draw Celestial Bodies (Planets)
  for (const b of stepData.bodies) {
    ctx.save();
    const auraRadius = (b.atmR || b.r) * 1.5;
    const grad = ctx.createRadialGradient(b.x, b.y, b.r * 0.8, b.x, b.y, auraRadius);
    grad.addColorStop(0, isDark ? b.glow : (b.color + "2e"));
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(b.x, b.y, auraRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Upper atmosphere boundary for Mars
    if (b.atmR) {
      ctx.save();
      ctx.strokeStyle = isDark ? "rgba(248, 113, 113, 0.5)" : "rgba(220, 38, 38, 0.5)";
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.atmR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = isDark ? "rgba(248, 113, 113, 0.07)" : "rgba(220, 38, 38, 0.05)";
      ctx.fill();
      ctx.restore();
    }

    // Planet sphere body with realistic spherical gradient
    ctx.save();
    const planetGrad = ctx.createRadialGradient(b.x - b.r * 0.38, b.y - b.r * 0.38, b.r * 0.08, b.x, b.y, b.r);
    planetGrad.addColorStop(0, isDark ? "#ffffff" : "#f8fafc");
    planetGrad.addColorStop(0.25, b.color);
    planetGrad.addColorStop(0.85, isDark ? "#0f172a" : "#1e293b");
    planetGrad.addColorStop(1, "#020617");

    ctx.fillStyle = planetGrad;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();

    // Earth continent silhouettes
    if (b.name === "Earth") {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = isDark ? "rgba(34, 197, 94, 0.38)" : "rgba(22, 163, 74, 0.45)";
      ctx.beginPath();
      ctx.ellipse(b.x - 8, b.y - 6, b.r * 0.5, b.r * 0.35, 0.4, 0, Math.PI * 2);
      ctx.ellipse(b.x + 12, b.y + 10, b.r * 0.4, b.r * 0.3, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Mars Polar Ice Cap
    if (b.name === "Mars") {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(b.x, b.y - b.r + 5, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Jupiter atmospheric banding & Great Red Spot
    if (b.isJupiter) {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = isDark ? "rgba(234, 88, 12, 0.35)" : "rgba(194, 65, 12, 0.45)";
      ctx.fillRect(b.x - b.r, b.y - 14, b.r * 2, 7);
      ctx.fillRect(b.x - b.r, b.y + 4, b.r * 2, 8);
      ctx.fillStyle = "#c2410c";
      ctx.beginPath();
      ctx.ellipse(b.x + 14, b.y + 8, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();

    // Planet label
    ctx.fillStyle = text;
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(b.name.toUpperCase(), b.x, b.y + b.r + 15);
  }

  // 3. Draw Target Objective
  const target = stepData.target;
  if (target.isStation) {
    drawSpaceStation(ctx, target, solved, isDark, accent);
  } else if (target.isRing) {
    // Mars Low Orbit Target Corridor Ring
    ctx.save();
    const midR = (target.minR + target.maxR) / 2;
    const ringW = target.maxR - target.minR;

    ctx.strokeStyle = solved
      ? "rgba(16, 185, 129, 0.35)"
      : (isDark ? "rgba(52, 211, 153, 0.18)" : "rgba(4, 120, 87, 0.16)");
    ctx.lineWidth = ringW;
    ctx.beginPath();
    ctx.arc(target.x, target.y, midR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = solved ? "#10b981" : targetColor;
    ctx.beginPath();
    ctx.arc(target.x, target.y, target.minR, 0, Math.PI * 2);
    ctx.arc(target.x, target.y, target.maxR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 4. Launch Pad & Spacecraft at Launch Pad
  const launchPad = stepData.launch;
  const launchAngle = Math.atan2(currentV0.y, currentV0.x);

  if (launchPad.onBody) {
    ctx.save();
    ctx.translate(launchPad.x, launchPad.y);
    ctx.fillStyle = isDark ? "#475569" : "#64748b";
    ctx.fillRect(-6, 0, 12, 3);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(-6, 0, 12, 3);
    ctx.restore();
  }

  // Draw poised spacecraft at launch pad (hidden once solved or actively flying)
  if (!solved && probe && (!probe.hasLaunched || isDragging)) {
    drawSpacecraft(ctx, launchPad.x, launchPad.y, launchAngle, {
      isThrusting: isDragging,
      scale: 1.15,
      isDark
    });
  }

  // 5. Interactive Aiming Vector & Reticle (Only visible while aiming; HIDDEN once solved!)
  const arrowScale = stepData.arrowScale || 8;
  const handleX = launchPad.x + currentV0.x * arrowScale;
  const handleY = launchPad.y + currentV0.y * arrowScale;

  if (!solved) {
    // Vector Line from ship to handle
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(launchPad.x, launchPad.y);
    ctx.lineTo(handleX, handleY);
    ctx.stroke();

    // Gravitational trajectory prediction arc (~40-50% preview to aid aiming without spoiling)
    const isPoised = !probe || !probe.hasLaunched || isDragging;
    if (isPoised) {
      const predPoints = computePredictionPath(currentV0);
      drawPredictionArc(ctx, predPoints, isDark, accent);
    }

    const handlePulse = isDragging ? 3 : Math.sin(simTime * 6) * 2;
    const reticleRadius = 14 + (isDragging ? 3 : (isHoveringAim ? 2 : 0));

    // Outer reticle gimbal circle
    ctx.beginPath();
    ctx.arc(handleX, handleY, reticleRadius + handlePulse, 0, Math.PI * 2);
    ctx.strokeStyle = isDark ? "rgba(56, 189, 248, 0.4)" : "rgba(2, 132, 199, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Inner solid knob
    ctx.beginPath();
    ctx.arc(handleX, handleY, reticleRadius, 0, Math.PI * 2);
    ctx.fillStyle = isDark ? "#0f172a" : "#ffffff";
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Crosshairs
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(handleX - 6, handleY); ctx.lineTo(handleX + 6, handleY);
    ctx.moveTo(handleX, handleY - 6); ctx.lineTo(handleX, handleY + 6);
    ctx.stroke();

    // Center target pip
    ctx.beginPath();
    ctx.arc(handleX, handleY, 3, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.restore();

    // Telemetry readout above handle
    const currentSpeed = Math.hypot(currentV0.x, currentV0.y).toFixed(1);
    const currentAngleDeg = ((-Math.atan2(currentV0.y, currentV0.x) * 180) / Math.PI).toFixed(0);

    ctx.save();
    ctx.fillStyle = accent;
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`v₀ = ${currentSpeed} km/s  •  θ = ${currentAngleDeg}°`, handleX, handleY - reticleRadius - 10);
    ctx.restore();
  }

  // 6. Physics Simulation Step of Spacecraft
  if (probe && probe.hasLaunched && !isDragging) {
    if (probe.docked) {
      // ─── Case A: Securely Docked at Space Station ───
      const target = stepData.target;
      probe.x = target.x + probe.dockRadius * Math.cos(stationAngle + probe.dockOffsetAngle);
      probe.y = target.y + probe.dockRadius * Math.sin(stationAngle + probe.dockOffsetAngle);
      probe.vx = 0;
      probe.vy = 0;
    } else if (probe.orbitingMars) {
      // ─── Case B: In Stable Low Mars Orbit ───
      const mars = stepData.bodies[0];
      probe.orbitAngle += probe.orbitOmega;
      probe.x = mars.x + probe.orbitR * Math.cos(probe.orbitAngle);
      probe.y = mars.y + probe.orbitR * Math.sin(probe.orbitAngle);
      probe.vx = -probe.orbitOmega * probe.orbitR * Math.sin(probe.orbitAngle);
      probe.vy = probe.orbitOmega * probe.orbitR * Math.cos(probe.orbitAngle);

      trail.push({ x: probe.x, y: probe.y });
      if (trail.length > 130) trail.shift();
    } else if (!probe.crashed && !probe.escaped) {
      // ─── Case C: In Free-Flight Gravitational Trajectory ───
      const subSteps = 6;
      const dt = 0.05;

      for (let s = 0; s < subSteps; s++) {
        let ax = 0;
        let ay = 0;

        for (const b of stepData.bodies) {
          const dx = b.x - probe.x;
          const dy = b.y - probe.y;
          const dist = Math.max(8, Math.hypot(dx, dy));

          // Planet surface collision
          if (dist < b.r + 3 && probe.flightTime > 0.8) {
            probe.crashed = true;
            probe.crashSpeed = Math.hypot(probe.vx, probe.vy);
            sfx.silenceContinuous();
            sfx.playCrash(probe.crashSpeed);
            for (let p = 0; p < 26; p++) {
              particles.push({
                x: probe.x, y: probe.y,
                vx: (Math.random() - 0.5) * 6,
                vy: (Math.random() - 0.5) * 6,
                life: 1.2, color: "#f87171"
              });
            }
            break;
          }

          // Gravitational force: F = GM / r^2
          const f = b.gm / (dist * dist * dist);
          ax += dx * f;
          ay += dy * f;

          // Aerobraking drag in Martian upper atmosphere
          if (b.atmR && dist < b.atmR && dist > b.r) {
            probe.hasPassedAtmosphere = true;
            const penetration = (b.atmR - dist) / (b.atmR - b.r);
            const dragFactor = b.dragCoeff * penetration;
            ax -= probe.vx * dragFactor;
            ay -= probe.vy * dragFactor;

            // Fiery aerothermal plasma sparks
            if (Math.random() < 0.6) {
              particles.push({
                x: probe.x, y: probe.y,
                vx: -probe.vx * 0.25 + (Math.random() - 0.5) * 3,
                vy: -probe.vy * 0.25 + (Math.random() - 0.5) * 3,
                life: 0.8, color: "#f97316"
              });
            }
          }
        }

        if (probe.crashed) break;

        probe.vx += ax * dt;
        probe.vy += ay * dt;
        probe.x += probe.vx * dt;
        probe.y += probe.vy * dt;
        probe.flightTime += dt;

        // ─── Goal Interception & Rendezvous Detection ───
        if (!solved) {
          if (target.isStation) {
            const distTarget = Math.hypot(probe.x - target.x, probe.y - target.y);
            if (distTarget < target.r) {
              solved = true;
              sfx.playDock();
              if (restartTimer) {
                clearTimeout(restartTimer);
                restartTimer = null;
              }
              probe.captured = true;
              probe.docked = true;
              probe.dockOffsetAngle = Math.atan2(probe.y - target.y, probe.x - target.x) - stationAngle;
              probe.dockRadius = 16;
              probe.vx = 0;
              probe.vy = 0;

              for (let k = 0; k < 30; k++) {
                const ang = (k / 30) * Math.PI * 2;
                const spd = 2 + Math.random() * 3.5;
                particles.push({
                  x: target.x, y: target.y,
                  vx: Math.cos(ang) * spd,
                  vy: Math.sin(ang) * spd,
                  life: 1.3, color: "#10b981"
                });
              }
              if (typeof window.bkCompleteStep === "function") {
                window.bkCompleteStep(currentStep, stepData.feedback);
              }
              break;
            }
          } else if (target.isRing) {
            const mars = stepData.bodies[0];
            const distMars = Math.hypot(probe.x - mars.x, probe.y - mars.y);
            probe.minMarsD = Math.min(probe.minMarsD, distMars);

            // Genuine Mars Aerobraking Capture:
            // Must have entered atmosphere, passed periapsis safely above crash zone, and decelerated
            if (
              probe.hasPassedAtmosphere &&
              !probe.crashed &&
              probe.minMarsD >= mars.r + 14 &&
              probe.minMarsD <= target.maxR - 2 &&
              distMars > probe.minMarsD + 1.5
            ) {
              const currentSpd = Math.hypot(probe.vx, probe.vy);
              const vEscape = Math.sqrt((2 * mars.gm) / distMars);

              if (currentSpd < vEscape * 0.98) {
                solved = true;
                sfx.playOrbitCapture();
                if (restartTimer) {
                  clearTimeout(restartTimer);
                  restartTimer = null;
                }
                probe.captured = true;
                probe.orbitingMars = true;
                probe.orbitR = target.r;
                probe.orbitAngle = Math.atan2(probe.y - mars.y, probe.x - mars.x);
                const dir = (probe.x - mars.x) * probe.vy - (probe.y - mars.y) * probe.vx > 0 ? 1 : -1;
                probe.orbitOmega = 0.016 * dir;

                for (let k = 0; k < 30; k++) {
                  const ang = (k / 30) * Math.PI * 2;
                  const spd = 2 + Math.random() * 3;
                  particles.push({
                    x: probe.x, y: probe.y,
                    vx: Math.cos(ang) * spd,
                    vy: Math.sin(ang) * spd,
                    life: 1.3, color: "#10b981"
                  });
                }
                if (typeof window.bkCompleteStep === "function") {
                  window.bkCompleteStep(currentStep, stepData.feedback);
                }
                break;
              }
            }
          }
        }

        // Check bounds
        if (probe.x < -80 || probe.x > 880 || probe.y < -80 || probe.y > 530) {
          probe.escaped = true;
          sfx.silenceContinuous();
          break;
        }
      }

      trail.push({ x: probe.x, y: probe.y });
      if (trail.length > 90) trail.shift();

      if (Math.random() < 0.5 && !probe.docked && !probe.orbitingMars) {
        particles.push({
          x: probe.x, y: probe.y,
          vx: -probe.vx * 0.18 + (Math.random() - 0.5) * 1.5,
          vy: -probe.vy * 0.18 + (Math.random() - 0.5) * 1.5,
          life: 0.65, color: accent
        });
      }

      if ((probe.crashed || probe.escaped) && !solved) {
        if (!restartTimer) {
          restartTimer = setTimeout(() => {
            restartTimer = null;
            if (!solved) resetProbe(false);
          }, 1200);
        }
      }
    }
  }

  // 7. Draw Spacecraft Trail & Particles
  for (let i = 0; i < trail.length; i++) {
    const pt = trail[i];
    const alpha = (i / trail.length) * 0.65;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = solved
      ? (isDark ? `rgba(16, 185, 129, ${alpha})` : `rgba(4, 120, 87, ${alpha})`)
      : (isDark ? `rgba(56, 189, 248, ${alpha})` : `rgba(2, 132, 199, ${alpha})`);
    ctx.fill();
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.025;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }

  // 8. Draw Flying / Orbiting / Docked Spacecraft
  if (probe && probe.hasLaunched && !probe.crashed && probe.flightTime >= 0.1 && !isDragging) {
    const flightAngle = probe.orbitingMars
      ? probe.orbitAngle + (probe.orbitOmega > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (probe.docked ? stationAngle + probe.dockOffsetAngle : Math.atan2(probe.vy, probe.vx));

    drawSpacecraft(ctx, probe.x, probe.y, flightAngle, {
      isThrusting: !probe.docked,
      scale: 1.15,
      isDocked: probe.docked,
      isCapture: probe.orbitingMars || probe.docked,
      isDark
    });
  }

  // 9. Real-time Mission Control Telemetry HUD (Replaces spoiler predictions!)
  ctx.save();
  let statusBadge = "";
  let statusDetail = "";
  let hudType = "cyan"; // "cyan", "amber", "red", "emerald"

  const probeSpeed = probe ? Math.hypot(probe.vx, probe.vy).toFixed(1) : "0.0";
  const distToTarget = target.isStation && probe
    ? Math.round(Math.hypot(probe.x - target.x, probe.y - target.y)) * 10
    : 0;

  if (solved) {
    hudType = "emerald";
    if (probe && probe.docked) {
      statusBadge = `✔ DOCKED WITH ${target.name.toUpperCase()}`;
      statusDetail = "RENDEZVOUS COMPLETE • RELATIVE VELOCITY: 0.0 km/s";
    } else if (probe && probe.orbitingMars) {
      statusBadge = "✔ LOW MARS ORBIT ESTABLISHED";
      statusDetail = `STABLE CIRCULAR ORBIT • ORBITAL ALTITUDE: 180 km • SPEED: ${probeSpeed} km/s`;
    } else {
      statusBadge = "✔ MISSION OBJECTIVE ACHIEVED";
      statusDetail = "ORBITAL PARAMETERS CONFIRMED";
    }
  } else if (probe && probe.crashed) {
    hudType = "red";
    statusBadge = "💥 COLLISION DETECTED";
    statusDetail = `IMPACT AT ${probe.crashSpeed ? probe.crashSpeed.toFixed(1) : probeSpeed} km/s • RESETTING TRIAL...`;
  } else if (probe && probe.escaped) {
    hudType = "amber";
    statusBadge = "⚠ TRAJECTORY ESCAPED";
    statusDetail = "SPACECRAFT EXITED MISSION THEATER • RESETTING TRIAL...";
  } else if (isDragging) {
    hudType = "amber";
    statusBadge = "CALCULATING LAUNCH VECTOR";
    const curSpd = Math.hypot(currentV0.x, currentV0.y).toFixed(1);
    const curAng = ((-Math.atan2(currentV0.y, currentV0.x) * 180) / Math.PI).toFixed(0);
    statusDetail = `INITIAL VELOCITY: ${curSpd} km/s • PITCH: ${curAng}° • RELEASE TO FIRE`;
  } else if (probe && probe.hasLaunched && probe.flightTime >= 0.1) {
    // Actively in flight
    hudType = "cyan";
    if (currentStep === 0) {
      statusBadge = "IN FLIGHT: ORBITAL TRANSFER ARC";
      statusDetail = `SPEED: ${probeSpeed} km/s • RANGE TO STATION: ${distToTarget} km`;
    } else if (currentStep === 1) {
      const jupiter = stepData.bodies[1];
      const distJup = Math.hypot(probe.x - jupiter.x, probe.y - jupiter.y);
      if (distJup < 110) {
        hudType = "emerald";
        statusBadge = "GRAVITY ASSIST: JUPITER SLINGSHOT";
        statusDetail = `MAX GRAVITATIONAL ACCELERATION • SPEED: ${probeSpeed} km/s`;
      } else {
        statusBadge = "IN FLIGHT: INTERPLANETARY TRANSIT";
        statusDetail = `SPEED: ${probeSpeed} km/s • RANGE TO OUTPOST: ${distToTarget} km`;
      }
    } else {
      // Step 3 Mars
      const mars = stepData.bodies[0];
      const distMars = Math.hypot(probe.x - mars.x, probe.y - mars.y);
      if (distMars <= mars.atmR && distMars > mars.r) {
        hudType = "amber";
        statusBadge = "AEROBRAKING ENTRY: MARTIAN ATMOSPHERE";
        statusDetail = `DYNAMIC PRESSURE ACTIVE • SPEED: ${probeSpeed} km/s • ALTITUDE: ${(distMars - mars.r) * 10} km`;
      } else {
        statusBadge = "HYPERBOLIC MARS APPROACH";
        statusDetail = `APPROACH SPEED: ${probeSpeed} km/s • RANGE: ${(distMars - mars.r) * 10} km`;
      }
    }
  } else {
    // Poised on launch pad
    hudType = "cyan";
    const initSpd = Math.hypot(currentV0.x, currentV0.y).toFixed(1);
    statusBadge = "STANDBY: READY FOR LAUNCH";
    statusDetail = `INITIAL VECTOR: ${initSpd} km/s • DRAG CROSSHAIR TO AIM & FIRE`;
  }

  // Draw telemetry bar pill
  let pillBg, pillBorder, pillText;
  if (isDark) {
    pillBg = "rgba(15, 23, 42, 0.94)";
    if (hudType === "emerald") {
      pillBorder = "#10b981";
      pillText = "#34d399";
    } else if (hudType === "red") {
      pillBorder = "#ef4444";
      pillText = "#f87171";
    } else if (hudType === "amber") {
      pillBorder = "#f59e0b";
      pillText = "#fcd34d";
    } else {
      pillBorder = "#38bdf8";
      pillText = "#7dd3fc";
    }
  } else {
    if (hudType === "emerald") {
      pillBg = "#d1fae5";
      pillBorder = "#10b981";
      pillText = "#065f46";
    } else if (hudType === "red") {
      pillBg = "#fee2e2";
      pillBorder = "#ef4444";
      pillText = "#991b1b";
    } else if (hudType === "amber") {
      pillBg = "#fef3c7";
      pillBorder = "#d97706";
      pillText = "#92400e";
    } else {
      pillBg = "#e0f2fe";
      pillBorder = "#0284c7";
      pillText = "#0369a1";
    }
  }

  const uiStyle = window.bkUi ? window.bkUi() : "standard";
  const pillRadius = uiStyle === "neo" ? 2 : (uiStyle === "playful" ? 12 : 6);

  ctx.fillStyle = pillBg;
  ctx.strokeStyle = pillBorder;
  ctx.lineWidth = uiStyle === "neo" ? 2 : 1.5;
  ctx.beginPath();
  ctx.roundRect(18, H - 34, W - 36, 24, pillRadius);
  ctx.fill();
  ctx.stroke();

  // Left side: status badge
  ctx.fillStyle = pillText;
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(statusBadge, 30, H - 18);

  // Right side: live telemetry readout
  ctx.font = "10px monospace, system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(statusDetail, W - 30, H - 18);

  ctx.restore();

  // 10. Modulate continuous dynamic gravity and atmospheric audio in real time
  sfx.updateFlightAudio(probe, stepData.bodies);
});

// ─── Intuitive Interactive Aiming (Pointer & Touch Events) ───
const canvas = document.getElementById("c");

function getHandlePos() {
  const arrowScale = stepData.arrowScale || 8;
  return {
    x: stepData.launch.x + currentV0.x * arrowScale,
    y: stepData.launch.y + currentV0.y * arrowScale
  };
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

function updateVelocityFromPoint(px, py) {
  const arrowScale = stepData.arrowScale || 8;
  const dx = px - stepData.launch.x;
  const dy = py - stepData.launch.y;
  const rawDist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);

  const minSpd = stepData.minSpeed || 3.0;
  const maxSpd = stepData.maxSpeed || 24.0;
  const speed = Math.max(minSpd, Math.min(maxSpd, rawDist / arrowScale));

  currentV0.x = Math.cos(angle) * speed;
  currentV0.y = Math.sin(angle) * speed;

  if (isDragging) {
    sfx.playAimTick(angle, speed);
  }

  probe = createFreshProbe();
}

function onPointerDown(e) {
  const pt = window.bkCanvasPoint(e, canvas);
  sfx.init();

  if (solved) return;

  const hp = getHandlePos();
  const launchPad = stepData.launch;

  const distHandle = Math.hypot(pt.x - hp.x, pt.y - hp.y);
  const distShip = Math.hypot(pt.x - launchPad.x, pt.y - launchPad.y);
  const distShaft = distToSegment(pt.x, pt.y, launchPad.x, launchPad.y, hp.x, hp.y);

  if (distHandle < 36 || distShip < 38 || distShaft < 24) {
    isDragging = true;
    canvas.style.cursor = "grabbing";
    updateVelocityFromPoint(pt.x, pt.y);
  }
}

function onPointerMove(e) {
  const pt = window.bkCanvasPoint(e, canvas);

  if (solved) {
    canvas.style.cursor = "default";
    return;
  }

  if (isDragging) {
    updateVelocityFromPoint(pt.x, pt.y);
  } else {
    const hp = getHandlePos();
    const launchPad = stepData.launch;
    const distHandle = Math.hypot(pt.x - hp.x, pt.y - hp.y);
    const distShip = Math.hypot(pt.x - launchPad.x, pt.y - launchPad.y);
    const distShaft = distToSegment(pt.x, pt.y, launchPad.x, launchPad.y, hp.x, hp.y);

    const isNearAim = distHandle < 36 || distShip < 38 || distShaft < 24;
    isHoveringAim = isNearAim;
    canvas.style.cursor = isNearAim ? "grab" : "default";
  }
}

function onPointerUp() {
  if (isDragging) {
    isDragging = false;
    canvas.style.cursor = "grab";
    resetProbe(true);
    sfx.playLaunch();
  }
}

canvas.addEventListener("mousedown", onPointerDown);
window.addEventListener("mousemove", onPointerMove);
window.addEventListener("mouseup", onPointerUp);

canvas.addEventListener("touchstart", onPointerDown, { passive: true });
window.addEventListener("touchmove", onPointerMove, { passive: true });
window.addEventListener("touchend", onPointerUp);

// Reset / Fire hotkey (R), NO arrow keys to avoid scroll hijacking!
window.addEventListener("keydown", (e) => {
  if (e.key === "r" || e.key === "R") {
    sfx.init();
    resetProbe(true);
    sfx.playLaunch();
    e.preventDefault();
  }
});
