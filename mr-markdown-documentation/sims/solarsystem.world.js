// Solar System 3D Master Astrophotography & Spaceflight Engine
// Implements:
// 1. True Astronomical Distance Scaling (Proportional AU distances from Mercury to Neptune & Kuiper Belt)
// 2. True Astronomical Object Size Scaling (Proportional planetary radii: Jupiter 10.97×, Saturn 9.14×, Uranus 3.98×, Earth 1.0×, etc.)
// 3. Dual Scale Engine: Instant seamless toggles for Distance Scale and Object Size Scale
// 4. Photometric Incandescent Sun with Dynamic Human Pupil / Eye Exposure Adaptation
// 5. Deep-Space Astrophotography (24k Milky Way galactic band + 16k sub-pixel stars + named stars warp)
// 6. Dedicated Geological Dissection Laboratory Mode (isolates planet with studio lighting, museum-quality 3D cutaway & strata)
// 7. Sub-Pixel Debris: Asteroid Belt (2.2 - 3.2 AU) + Kuiper Belt (30 - 50 AU) + Halley's Comet (0.59 to 35.1 AU)
// 8. Minimalist Spaceflight HUD with screen-space proximity targeting + floating flight dock

(function () {
  "use strict";

  window.bkSetupCalled = true;

  function loadThree(callback) {
    if (typeof window.THREE !== "undefined") {
      callback();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    script.onload = () => callback();
    script.onerror = () => console.error("Failed to load Three.js");
    document.head.appendChild(script);
  }

  loadThree(initDeepSpaceSolarSystem);

  function initDeepSpaceSolarSystem() {
    const THREE = window.THREE;

    // --- 1. WEB AUDIO SYNTHESIZER ---
    let audioCtx = null;
    let soundEnabled = true;

    function initAudio() {
      if (!audioCtx) {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (AudioCtor) audioCtx = new AudioCtor();
      }
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    }

    function playTone(freq, duration, type, gainVal) {
      if (!soundEnabled) return;
      initAudio();
      if (!audioCtx) return;
      try {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type || "sine";
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(gainVal || 0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + duration);
      } catch (e) {}
    }

    function playWarpSound() {
      if (!soundEnabled) return;
      initAudio();
      if (!audioCtx) return;
      try {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.exponentialRampToValueAtTime(750, now + 0.6);
        osc.frequency.exponentialRampToValueAtTime(110, now + 1.2);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 1.2);
      } catch (e) {}
    }

    function playLabSound() {
      if (!soundEnabled) return;
      playTone(330, 0.35, "triangle", 0.08);
      setTimeout(function () { playTone(440, 0.5, "sine", 0.06); }, 120);
    }

    // --- 2. RENDERER, CANVAS & SCENE ---
    const canvas = document.getElementById("c");
    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010206);
    scene.fog = new THREE.FogExp2(0x010206, 0.000004);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 140000);
    camera.position.set(0, 3600, 6800);

    // Texture Loaders
    const TEXTURE_LOCAL = "assets/textures/";
    const TEXTURE_CDN = "https://cdn.jsdelivr.net/gh/sanderblue/solar-system-threejs@gh-pages/src/assets/textures/";
    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin("anonymous");

    function loadTexture(name) {
      return textureLoader.load(
        TEXTURE_LOCAL + name,
        undefined,
        undefined,
        function () { return textureLoader.load(TEXTURE_CDN + name); }
      );
    }

    // Soft Gaussian particle for ethereal comet & dust
    function createSoftParticleTexture() {
      const c = document.createElement("canvas");
      c.width = 64; c.height = 64;
      const ctx = c.getContext("2d");
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,255,255,1.0)");
      grad.addColorStop(0.3, "rgba(255,255,255,0.7)");
      grad.addColorStop(0.65, "rgba(255,255,255,0.18)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    }

    function createGlowTexture(innerColor, outerColor) {
      const c = document.createElement("canvas");
      c.width = 256; c.height = 256;
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, 256, 256);
      const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 126);
      grad.addColorStop(0, innerColor);
      grad.addColorStop(0.22, innerColor);
      grad.addColorStop(0.65, outerColor);
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);
      const tex = new THREE.CanvasTexture(c);
      tex.needsUpdate = true;
      return tex;
    }

    // High-res Geological Strata Cross-Section Texture for Dissection Studio
    function createGeologicalCrossSectionTexture(layers) {
      const c = document.createElement("canvas");
      c.width = 512; c.height = 512;
      const ctx = c.getContext("2d");
      const cx = 256; const cy = 256; const maxR = 252;

      ctx.fillStyle = "#02040a";
      ctx.fillRect(0, 0, 512, 512);

      const num = layers.length;
      for (let i = num - 1; i >= 0; i--) {
        const l = layers[i];
        const r = maxR * (l.r || 1.0);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        const colHex = "#" + (l.color || 0x38bdf8).toString(16).padStart(6, "0");
        ctx.fillStyle = colHex;
        ctx.fill();

        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      for (let i = 20; i < maxR; i += 18) {
        ctx.beginPath();
        ctx.arc(cx, cy, i, 0, Math.PI * 2);
        ctx.stroke();
      }

      return new THREE.CanvasTexture(c);
    }

    // --- 3. MILKY WAY GALACTIC BAND & SUB-PIXEL STARFIELD ---
    const mwCount = 24000;
    const mwGeo = new THREE.BufferGeometry();
    const mwPositions = new Float32Array(mwCount * 3);
    const mwColors = new Float32Array(mwCount * 3);
    const mwMatrix = new THREE.Matrix4().makeRotationAxis(
      new THREE.Vector3(1, 0, 0.38).normalize(),
      THREE.MathUtils.degToRad(62.8)
    );

    for (let i = 0; i < mwCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const r = 28000 + Math.pow(Math.random(), 0.6) * 18000;
      const zOffset = (Math.random() - 0.5) * (2200 + Math.random() * 2600);

      const p = new THREE.Vector3(Math.cos(theta) * r, zOffset, Math.sin(theta) * r).applyMatrix4(mwMatrix);
      mwPositions[i * 3] = p.x;
      mwPositions[i * 3 + 1] = p.y;
      mwPositions[i * 3 + 2] = p.z;

      const isCore = Math.random() < 0.25;
      if (isCore) {
        mwColors[i * 3] = 0.95; mwColors[i * 3 + 1] = 0.88; mwColors[i * 3 + 2] = 0.75;
      } else {
        const bluish = Math.random();
        mwColors[i * 3] = 0.72 + bluish * 0.22;
        mwColors[i * 3 + 1] = 0.8 + bluish * 0.15;
        mwColors[i * 3 + 2] = 0.98;
      }
    }
    mwGeo.setAttribute("position", new THREE.BufferAttribute(mwPositions, 3));
    mwGeo.setAttribute("color", new THREE.BufferAttribute(mwColors, 3));
    const mwMat = new THREE.PointsMaterial({
      size: 1.2, vertexColors: true, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false
    });
    scene.add(new THREE.Points(mwGeo, mwMat));

    const starCount = 16000;
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 55000 + Math.random() * 15000;

      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);

      const rnd = Math.random();
      if (rnd < 0.68) {
        const b = 0.35 + Math.random() * 0.45;
        starColors[i * 3] = b; starColors[i * 3 + 1] = b; starColors[i * 3 + 2] = b * 1.05;
      } else if (rnd < 0.82) {
        starColors[i * 3] = 0.6; starColors[i * 3 + 1] = 0.75; starColors[i * 3 + 2] = 1.0;
      } else if (rnd < 0.93) {
        starColors[i * 3] = 1.0; starColors[i * 3 + 1] = 0.88; starColors[i * 3 + 2] = 0.55;
      } else {
        starColors[i * 3] = 1.0; starColors[i * 3 + 1] = 0.45; starColors[i * 3 + 2] = 0.35;
      }
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({ size: 0.9, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false });
    scene.add(new THREE.Points(starGeo, starMat));

    // --- 4. NAMED INTERSTELLAR STAR SYSTEMS ---
    const FAMOUS_STARS = [
      {
        id: "sirius", name: "Sirius (Dog Star)", designation: "Alpha Canis Majoris",
        pos: new THREE.Vector3(-18000, -5200, 22000), colorHex: 0xc8e6ff, colorCss: "#c8e6ff",
        spec: "A1V Blue-White", temp: "9,940 K", dist: "8.6 ly", mag: "-1.46",
        desc: "Brightest star in Earth's night sky; luminous binary system."
      },
      {
        id: "betelgeuse", name: "Betelgeuse", designation: "Alpha Orionis",
        pos: new THREE.Vector3(22000, 11500, -28000), colorHex: 0xff6b4a, colorCss: "#ff6b4a",
        spec: "M1-2 Ia Red Supergiant", temp: "3,600 K", dist: "642 ly", mag: "+0.50",
        desc: "Pulsating red supergiant with convective granulation; candidate supernova."
      },
      {
        id: "rigel", name: "Rigel", designation: "Beta Orionis",
        pos: new THREE.Vector3(24000, -9500, -24000), colorHex: 0x93c5fd, colorCss: "#93c5fd",
        spec: "B8Ia Blue Supergiant", temp: "12,100 K", dist: "860 ly", mag: "+0.13",
        desc: "Roaring blue-white supergiant at Orion's foot; 120,000× more luminous than Sol."
      },
      {
        id: "polaris", name: "Polaris", designation: "Alpha Ursae Minoris",
        pos: new THREE.Vector3(0, 30000, -6000), colorHex: 0xfef08a, colorCss: "#fef08a",
        spec: "F7Ib Yellow Supergiant", temp: "6,015 K", dist: "433 ly", mag: "+1.98",
        desc: "Northern pole star; classical Cepheid variable."
      },
      {
        id: "vega", name: "Vega", designation: "Alpha Lyrae",
        pos: new THREE.Vector3(-15000, 20000, -16000), colorHex: 0xdbeafe, colorCss: "#dbeafe",
        spec: "A0V Sapphire White", temp: "9,602 K", dist: "25.0 ly", mag: "+0.03",
        desc: "Rapidly rotating flattened standard calibration star with a circumstellar debris disk."
      },
      {
        id: "aldebaran", name: "Aldebaran", designation: "Alpha Tauri",
        pos: new THREE.Vector3(19000, 4200, -18000), colorHex: 0xfb923c, colorCss: "#fb923c",
        spec: "K5III Orange Giant", temp: "3,910 K", dist: "65.3 ly", mag: "+0.85",
        desc: "The fiery Eye of Taurus; exhausted hydrogen core expanding into giant phase."
      }
    ];

    FAMOUS_STARS.forEach(function (st) {
      const starGroup = new THREE.Group();
      starGroup.position.copy(st.pos);

      const core = new THREE.Mesh(new THREE.SphereGeometry(22, 24, 24), new THREE.MeshBasicMaterial({ color: st.colorHex }));
      starGroup.add(core);

      const glowTex = createGlowTexture(st.colorCss, "rgba(255,255,255,0)");
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: st.colorHex, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.8, depthWrite: false
      }));
      glow.scale.set(200, 200, 1);
      starGroup.add(glow);

      scene.add(starGroup);
    });

    // --- 5. PLANETARY ASTROPHYSICAL DATA: TRUE DISTANCES & SCALED RADII ---
    // Distances: 1 AU = 175 units.
    // Sizes:
    //   scaleRadius: Accurate physical radius scaled relative to Earth = 2.40 units
    //     (Jupiter: 10.97×, Saturn: 9.14×, Uranus: 3.98×, Neptune: 3.86×, Mars: 0.53×, Mercury: 0.38×, Moon: 0.27×)
    //   compactRadius: Legacy compressed orrery sizes
    const PLANET_CONFIGS = [
      {
        id: "sun", name: "Sun (Sol)", symbol: "☉", type: "G-Type Main-Sequence Star",
        scaleRadius: 38.0, compactRadius: 32.0, radius: 38.0,
        realDist: 0, compactDist: 0, dist: 0, speed: 0, realSpeed: 0, texFile: "sun.jpg",
        stats: {
          "Spectral Type": "Yellow Dwarf (G2V)", "Equatorial Radius": "696,340 km (109.3 R⊕)",
          "Volume vs Earth": "1,304,000× Earth", "Surface Temp": "5,778 K (Incandescent)",
          "Core Temp": "15,700,000 K", "Mass": "1.989 × 10³⁰ kg", "Core Pressure": "260 Billion atm"
        },
        layers: [
          { name: "Thermonuclear Fusion Core", r: 0.25, color: 0xffffff, temp: "15,700,000 K", depth: "0 - 175,000 km", press: "260 Gbar", desc: "Proton-proton fusion converting 600M tons of H to He per second." },
          { name: "Radiative Zone", r: 0.70, color: 0xfef08a, temp: "7M - 2M K", depth: "175,000 - 490,000 km", press: "10 Gbar", desc: "Photons scatter over 100,000 years to reach convective boundary." },
          { name: "Convective Zone", r: 0.92, color: 0xf97316, temp: "2M - 5,800 K", depth: "490,000 - 696,000 km", press: "0.2 Mbar", desc: "Giant boiling plasma cells convecting heat to surface." },
          { name: "Photosphere", r: 1.0, color: 0xffffff, temp: "5,778 K", depth: "Surface Layer (~500 km)", press: "0.01 atm", desc: "Incandescent optical surface radiating blinding white solar flux." }
        ],
        moons: []
      },
      {
        id: "mercury", name: "Mercury", symbol: "☿", type: "Terrestrial Planet",
        scaleRadius: 0.92, compactRadius: 3.2, radius: 0.92,
        realDist: 67.74, compactDist: 80, dist: 67.74, speed: 1.60, realSpeed: 4.15, texFile: "mercury.jpg",
        stats: {
          "Distance from Sun": "0.387 AU (57.9M km)", "Equatorial Radius": "2,439.7 km (0.383 R⊕)",
          "Volume vs Earth": "0.056× Earth", "Orbital Period": "87.97 Days", "Orbital Velocity": "47.36 km/s",
          "Mean Temp": "167 °C", "Atmosphere": "Trace (Exosphere)"
        },
        layers: [
          { name: "Solid Inner Core", r: 0.42, color: 0xffffff, temp: "1,800 °C", depth: "0 - 1,000 km", press: "40 GPa", desc: "Crystalline iron-nickel core." },
          { name: "Molten Outer Core", r: 0.85, color: 0xf59e0b, temp: "1,500 °C", depth: "1,000 - 2,050 km", press: "25 GPa", desc: "Enormous metallic iron core occupying 85% of planet radius." },
          { name: "Silicate Mantle & Crust", r: 1.0, color: 0x94a3b8, temp: "430 °C to -180 °C", depth: "2,050 - 2,440 km", press: "1 atm", desc: "Thin cratered silicate rocky shell." }
        ],
        moons: []
      },
      {
        id: "venus", name: "Venus", symbol: "♀", type: "Terrestrial Planet (Supercritical Greenhouse)",
        scaleRadius: 2.28, compactRadius: 7.8, radius: 2.28,
        realDist: 126.58, compactDist: 125, dist: 126.58, speed: 1.17, realSpeed: 1.62, texFile: "venus.jpg",
        stats: {
          "Distance from Sun": "0.723 AU (108.2M km)", "Equatorial Radius": "6,051.8 km (0.949 R⊕)",
          "Volume vs Earth": "0.857× Earth", "Orbital Period": "224.7 Days", "Orbital Velocity": "35.02 km/s",
          "Mean Temp": "464 °C (Runaway Greenhouse)", "Atmosphere": "96.5% CO₂, 3.5% N₂ (92 bar)"
        },
        layers: [
          { name: "Metallic Core", r: 0.50, color: 0xfef08a, temp: "3,000 °C", depth: "0 - 3,000 km", press: "130 GPa", desc: "Iron-nickel core with sluggish dynamo." },
          { name: "Rocky Mantle", r: 0.94, color: 0xd97706, temp: "1,200 °C", depth: "3,000 - 5,750 km", press: "50 GPa", desc: "Silicate mantle under intense convective overturn." },
          { name: "Basaltic Crust & Atmosphere", r: 1.0, color: 0xfcd34d, temp: "464 °C", depth: "5,750 - 6,052 km", press: "92 atm", desc: "Volcanic basalt crust insulated by crushing CO₂ atmosphere." }
        ],
        moons: []
      },
      {
        id: "earth", name: "Earth (Terra)", symbol: "⊕", type: "Terrestrial Planet (Habitable Biosphere)",
        scaleRadius: 2.40, compactRadius: 8.2, radius: 2.40,
        realDist: 175.00, compactDist: 175, dist: 175.00, speed: 1.00, realSpeed: 1.00, texFile: "earth.jpg", cloudsFile: "earth_clouds.jpg",
        stats: {
          "Distance from Sun": "1.000 AU (149.6M km)", "Equatorial Radius": "6,371.0 km (1.000 R⊕)",
          "Volume vs Earth": "1.000× Earth (1.083 × 10¹² km³)", "Orbital Period": "365.25 Days", "Orbital Velocity": "29.78 km/s",
          "Mean Temp": "15 °C", "Atmosphere": "78% N₂, 21% O₂, 0.9% Ar", "Moons": "1 (Luna)"
        },
        layers: [
          { name: "Solid Inner Core", r: 0.20, color: 0xffffff, temp: "5,400 °C", depth: "5,150 - 6,371 km", press: "3.6 Mbar", desc: "Solid crystalline iron-nickel sphere glowing white-hot under extreme pressure." },
          { name: "Liquid Outer Core", r: 0.55, color: 0xf59e0b, temp: "4,000 °C", depth: "2,890 - 5,150 km", press: "1.3 - 3.3 Mbar", desc: "Turbulent churning molten iron generating Earth's geomagnetic shield." },
          { name: "Lower Mantle (Mesosphere)", r: 0.82, color: 0xd97706, temp: "2,500 °C", depth: "660 - 2,890 km", press: "24 - 136 GPa", desc: "Dense silicate perovskite (bridgmanite) rock undergoing solid-state creep." },
          { name: "Upper Mantle (Asthenosphere)", r: 0.94, color: 0xb45309, temp: "1,200 °C", depth: "35 - 660 km", press: "1 - 24 GPa", desc: "Plastic flowing peridotite driving continental plate tectonics." },
          { name: "Silicate Oceanic/Continental Crust", r: 1.0, color: 0x38bdf8, temp: "15 °C", depth: "0 - 35 km", press: "1 atm", desc: "Brittle granite and basalt supporting oceans and life." }
        ],
        moons: [{ id: "moon", name: "The Moon (Luna)", scaleRadius: 0.655, compactRadius: 2.2, radius: 0.655, dist: 14, speed: 3.5, texFile: "moon.jpg" }]
      },
      {
        id: "mars", name: "Mars", symbol: "♂", type: "Terrestrial Planet (Oxidized Desert)",
        scaleRadius: 1.28, compactRadius: 4.4, radius: 1.28,
        realDist: 266.64, compactDist: 235, dist: 266.64, speed: 0.80, realSpeed: 0.53, texFile: "mars.jpg",
        stats: {
          "Distance from Sun": "1.524 AU (227.9M km)", "Equatorial Radius": "3,389.5 km (0.532 R⊕)",
          "Volume vs Earth": "0.151× Earth", "Orbital Period": "687 Days", "Orbital Velocity": "24.13 km/s",
          "Mean Temp": "-63 °C", "Atmosphere": "95% CO₂, 2.6% N₂"
        },
        layers: [
          { name: "Sulfur-Rich Iron Core", r: 0.50, color: 0xfbbf24, temp: "1,700 °C", depth: "0 - 1,800 km", press: "40 GPa", desc: "Partially liquid iron-nickel-sulfur core." },
          { name: "Silicate Mantle", r: 0.92, color: 0xc2410c, temp: "1,100 °C", depth: "1,800 - 3,340 km", press: "15 GPa", desc: "Thick mantle with stagnant-lid tectonics." },
          { name: "Iron-Oxide Rich Crust", r: 1.0, color: 0xea580c, temp: "-63 °C", depth: "3,340 - 3,390 km", press: "0.006 atm", desc: "Basaltic crust stained red by hematite iron oxide dust." }
        ],
        moons: []
      },
      {
        id: "jupiter", name: "Jupiter", symbol: "♃", type: "Gas Giant",
        scaleRadius: 26.34, compactRadius: 17.5, radius: 26.34,
        realDist: 910.77, compactDist: 350, dist: 910.77, speed: 0.43, realSpeed: 0.084, texFile: "jupiter.jpg",
        stats: {
          "Distance from Sun": "5.204 AU (778.5M km)", "Equatorial Radius": "69,911 km (10.973 R⊕)",
          "Volume vs Earth": "1,321× Earth", "Orbital Period": "11.86 Earth Years", "Orbital Velocity": "13.07 km/s",
          "Mean Temp": "-110 °C (Cloud tops)", "Moons": "95 Known"
        },
        layers: [
          { name: "Dense Rock & Ice Core", r: 0.18, color: 0xffffff, temp: "20,000 °C", depth: "0 - 14,000 km", press: "40 - 100 Mbar", desc: "Dense silicate and heavy element seed 15× Earth mass." },
          { name: "Liquid Metallic Hydrogen", r: 0.78, color: 0x38bdf8, temp: "10,000 °C", depth: "14,000 - 55,000 km", press: "2 - 40 Mbar", desc: "Electrically conductive liquid metallic hydrogen generating titanic magnetic field." },
          { name: "Liquid Molecular Hydrogen & Helium", r: 0.95, color: 0xfbbf24, temp: "2,000 °C", depth: "55,000 - 68,000 km", press: "1,000 atm", desc: "Supercritical fluid transitioning smoothly from gas to liquid." },
          { name: "Ammonia & Water Cloud Belts", r: 1.0, color: 0xd97706, temp: "-110 °C", depth: "Upper 1,000 km", press: "1 atm", desc: "Zonal atmospheric jet streams and Great Red Spot anticyclone." }
        ],
        moons: []
      },
      {
        id: "saturn", name: "Saturn", symbol: "♄", type: "Ringed Gas Giant",
        scaleRadius: 21.94, compactRadius: 14.5, radius: 21.94,
        realDist: 1676.96, compactDist: 460, dist: 1676.96, speed: 0.32, realSpeed: 0.034, texFile: "saturn.jpg",
        stats: {
          "Distance from Sun": "9.583 AU (1.434B km)", "Equatorial Radius": "58,232 km (9.140 R⊕)",
          "Volume vs Earth": "764× Earth", "Orbital Period": "29.45 Earth Years", "Orbital Velocity": "9.69 km/s",
          "Ring Span": "282,000 km (4.84 Saturn Radii)", "Moons": "146 Known"
        },
        layers: [
          { name: "Silicate & Ice Core", r: 0.22, color: 0xffffff, temp: "11,700 °C", depth: "0 - 12,000 km", press: "30 Mbar", desc: "Dense core wrapped in high-pressure ice polymorphs." },
          { name: "Liquid Metallic Hydrogen", r: 0.60, color: 0x38bdf8, temp: "6,000 °C", depth: "12,000 - 36,000 km", press: "1 - 30 Mbar", desc: "Conductive mantle subject to liquid helium droplet rain." },
          { name: "Molecular Hydrogen Atmosphere", r: 1.0, color: 0xfde047, temp: "-140 °C", depth: "36,000 - 58,232 km", press: "1 atm", desc: "Golden ammonia haze and North Polar hexagonal jet stream." }
        ],
        hasRings: true,
        moons: []
      },
      {
        id: "uranus", name: "Uranus", symbol: "♅", type: "Ice Giant",
        scaleRadius: 9.55, compactRadius: 9.8, radius: 9.55,
        realDist: 3363.22, compactDist: 570, dist: 3363.22, speed: 0.22, realSpeed: 0.0119, texFile: "uranus.jpg",
        stats: {
          "Distance from Sun": "19.218 AU (2.875B km)", "Equatorial Radius": "25,362 km (3.981 R⊕)",
          "Volume vs Earth": "63.1× Earth", "Orbital Period": "84.0 Earth Years", "Orbital Velocity": "6.81 km/s",
          "Axial Tilt": "97.8° (Retrograde)", "Mean Temp": "-195 °C"
        },
        layers: [
          { name: "Rocky Core", r: 0.25, color: 0xffffff, temp: "4,700 °C", depth: "0 - 6,000 km", press: "8 Mbar", desc: "Iron and silicate mineral core." },
          { name: "Supercritical Water-Ammonia Mantle", r: 0.85, color: 0x22d3ee, temp: "2,000 °C", depth: "6,000 - 21,000 km", press: "2 Mbar", desc: "Superionic hot dense water and ammonia slush ('ice ocean')." },
          { name: "Hydrogen-Helium-Methane Atmosphere", r: 1.0, color: 0x67e8f9, temp: "-195 °C", depth: "21,000 - 25,362 km", press: "1 atm", desc: "Methane gas absorbing red light, giving pale cyan hue." }
        ],
        moons: []
      },
      {
        id: "neptune", name: "Neptune", symbol: "♆", type: "Ice Giant",
        scaleRadius: 9.28, compactRadius: 9.4, radius: 9.28,
        realDist: 5262.25, compactDist: 680, dist: 5262.25, speed: 0.18, realSpeed: 0.00607, texFile: "neptune.jpg",
        stats: {
          "Distance from Sun": "30.070 AU (4.498B km)", "Equatorial Radius": "24,622 km (3.865 R⊕)",
          "Volume vs Earth": "57.7× Earth", "Orbital Period": "164.8 Earth Years", "Orbital Velocity": "5.43 km/s",
          "Winds": "Up to 2,100 km/h", "Mean Temp": "-201 °C"
        },
        layers: [
          { name: "Rock & Iron Core", r: 0.28, color: 0xffffff, temp: "5,100 °C", depth: "0 - 7,000 km", press: "7 Mbar", desc: "Solid iron-nickel and silicate core roughly 1.2 M⊕." },
          { name: "Ionic Ice Water Mantle", r: 0.86, color: 0x3b82f6, temp: "2,500 °C", depth: "7,000 - 21,500 km", press: "2 Mbar", desc: "Highly conductive fluid of water, ammonia, and methane." },
          { name: "Methane Cloud Deck", r: 1.0, color: 0x1d4ed8, temp: "-201 °C", depth: "21,500 - 24,622 km", press: "1 atm", desc: "Deep azure blue with supersonic winds and dark anticyclonic storms." }
        ],
        moons: []
      }
    ];

    // --- 6. SUN & BLINDING PHOTOMETRIC ENGINE ---
    const sunCfg = PLANET_CONFIGS[0];
    const sunGroup = new THREE.Group();
    sunGroup.position.set(0, 0, 0);

    const sunMeshMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(sunCfg.scaleRadius, 48, 48), sunMeshMat);
    sunGroup.add(sunMesh);

    const sunGlowTex = createGlowTexture("rgba(255,255,255,1.0)", "rgba(255,255,255,0)");
    const sunCoreGlare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunGlowTex, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.95, depthWrite: false
    }));
    sunCoreGlare.scale.set(sunCfg.scaleRadius * 2.2, sunCfg.scaleRadius * 2.2, 1);
    sunGroup.add(sunCoreGlare);

    const sunOuterGlowTex = createGlowTexture("rgba(255,250,240,0.85)", "rgba(255,220,140,0)");
    const sunOuterCorona = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunOuterGlowTex, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.65, depthWrite: false
    }));
    sunOuterCorona.scale.set(sunCfg.scaleRadius * 4.8, sunCfg.scaleRadius * 4.8, 1);
    sunGroup.add(sunOuterCorona);

    scene.add(sunGroup);

    const sunLight = new THREE.PointLight(0xffffff, 3.2, 0, 0.25);
    sunLight.position.set(0, 0, 0);
    scene.add(sunLight);

    const ambientLight = new THREE.AmbientLight(0x0f172a, 0.42);
    scene.add(ambientLight);

    // --- 7. PLANETARY MESHES & SCALABLE ORBIT TRACKS ---
    const celestialMeshes = [];
    const orbitLinesGroup = new THREE.Group();
    scene.add(orbitLinesGroup);

    function createUnitOrbitTrack() {
      const segments = 240;
      const pts = [];
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta)));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.28 });
      return new THREE.Line(geo, mat);
    }

    for (let pIdx = 1; pIdx < PLANET_CONFIGS.length; pIdx++) {
      const cfg = PLANET_CONFIGS[pIdx];
      const orbitLine = createUnitOrbitTrack();
      orbitLine.scale.set(cfg.realDist, 1, cfg.realDist);
      orbitLinesGroup.add(orbitLine);

      const planetGroup = new THREE.Group();
      const bodyGroup = new THREE.Group(); // Subgroup that scales with object size mode

      const pTex = loadTexture(cfg.texFile);
      const pMat = new THREE.MeshStandardMaterial({
        map: pTex,
        roughness: cfg.id === "earth" ? 0.38 : 0.85,
        metalness: 0.05
      });
      const pMesh = new THREE.Mesh(new THREE.SphereGeometry(cfg.scaleRadius, 40, 40), pMat);
      bodyGroup.add(pMesh);

      let earthClouds = null;
      if (cfg.id === "earth") {
        const cTex = loadTexture(cfg.cloudsFile);
        const cMat = new THREE.MeshStandardMaterial({
          map: cTex, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending
        });
        earthClouds = new THREE.Mesh(new THREE.SphereGeometry(cfg.scaleRadius * 1.018, 40, 40), cMat);
        bodyGroup.add(earthClouds);
      }

      let ringsMesh = null;
      if (cfg.hasRings) {
        const rGeo = new THREE.RingGeometry(cfg.scaleRadius * 1.25, cfg.scaleRadius * 2.35, 64);
        const pos = rGeo.attributes.position;
        const uvs = rGeo.attributes.uv;
        for (let i = 0; i < pos.count; i++) {
          const vx = pos.getX(i);
          const vy = pos.getY(i);
          const dist = Math.sqrt(vx * vx + vy * vy);
          const u = (dist - cfg.scaleRadius * 1.25) / (cfg.scaleRadius * 2.35 - cfg.scaleRadius * 1.25);
          uvs.setXY(i, u, 0.5);
        }
        const rTex = loadTexture("saturn_rings.png");
        const rMat = new THREE.MeshStandardMaterial({
          map: rTex, side: THREE.DoubleSide, transparent: true, opacity: 0.88, roughness: 0.8
        });
        ringsMesh = new THREE.Mesh(rGeo, rMat);
        ringsMesh.rotation.x = Math.PI / 2 + 0.42;
        bodyGroup.add(ringsMesh);
      }

      planetGroup.add(bodyGroup);

      const moonMeshes = [];
      (cfg.moons || []).forEach(function (mCfg) {
        const mMesh = new THREE.Mesh(
          new THREE.SphereGeometry(mCfg.scaleRadius, 24, 24),
          new THREE.MeshStandardMaterial({ map: loadTexture(mCfg.texFile), roughness: 0.9 })
        );
        planetGroup.add(mMesh);
        moonMeshes.push({ config: mCfg, mesh: mMesh, angle: Math.random() * Math.PI * 2 });
      });

      scene.add(planetGroup);

      celestialMeshes.push({
        config: cfg,
        group: planetGroup,
        bodyGroup: bodyGroup,
        mesh: pMesh,
        earthClouds: earthClouds,
        ringsMesh: ringsMesh,
        moonMeshes: moonMeshes,
        angle: Math.random() * Math.PI * 2,
        orbitLine: orbitLine,
        currentDist: cfg.realDist,
        targetDist: cfg.realDist,
        speedMult: cfg.realSpeed,
        currentSizeScale: 1.0,
        targetSizeScale: 1.0
      });
    }

    // --- 8. SUB-PIXEL DEBRIS: REAL-SCALE ASTEROID & KUIPER BELTS ---
    const astCount = 2800;
    const astGeo = new THREE.BufferGeometry();
    const astPositions = new Float32Array(astCount * 3);
    const astColors = new Float32Array(astCount * 3);

    for (let i = 0; i < astCount; i++) {
      const dist = 385 + Math.random() * 175;
      const angle = Math.random() * Math.PI * 2;
      const yOffset = (Math.random() - 0.5) * 16;

      astPositions[i * 3] = Math.cos(angle) * dist;
      astPositions[i * 3 + 1] = yOffset;
      astPositions[i * 3 + 2] = Math.sin(angle) * dist;

      const lum = 0.4 + Math.random() * 0.35;
      astColors[i * 3] = lum;
      astColors[i * 3 + 1] = lum * 0.96;
      astColors[i * 3 + 2] = lum * 0.92;
    }
    astGeo.setAttribute("position", new THREE.BufferAttribute(astPositions, 3));
    astGeo.setAttribute("color", new THREE.BufferAttribute(astColors, 3));
    const astMat = new THREE.PointsMaterial({
      size: 0.85, vertexColors: true, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const astPoints = new THREE.Points(astGeo, astMat);
    scene.add(astPoints);

    const kbCount = 3500;
    const kbGeo = new THREE.BufferGeometry();
    const kbPositions = new Float32Array(kbCount * 3);
    const kbColors = new Float32Array(kbCount * 3);

    for (let i = 0; i < kbCount; i++) {
      const dist = 5250 + Math.random() * 3500;
      const angle = Math.random() * Math.PI * 2;
      const yOffset = (Math.random() - 0.5) * 90;

      kbPositions[i * 3] = Math.cos(angle) * dist;
      kbPositions[i * 3 + 1] = yOffset;
      kbPositions[i * 3 + 2] = Math.sin(angle) * dist;

      kbColors[i * 3] = 0.55;
      kbColors[i * 3 + 1] = 0.72;
      kbColors[i * 3 + 2] = 0.95;
    }
    kbGeo.setAttribute("position", new THREE.BufferAttribute(kbPositions, 3));
    kbGeo.setAttribute("color", new THREE.BufferAttribute(kbColors, 3));
    const kbMat = new THREE.PointsMaterial({
      size: 1.0, vertexColors: true, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const kbPoints = new THREE.Points(kbGeo, kbMat);
    scene.add(kbPoints);

    let currentAstScale = 1.0;
    let astTargetScale = 1.0;
    let currentKbScale = 1.0;
    let kbTargetScale = 1.0;

    // --- 9. HALLEY'S COMET (1P/HALLEY) ---
    const softParticleTex = createSoftParticleTexture();
    const cometGroup = new THREE.Group();
    const cometNucleus = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.4, 1),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.98 })
    );
    cometGroup.add(cometNucleus);

    const comaTex = createGlowTexture("rgba(186,230,253,0.7)", "rgba(56,189,248,0)");
    const comaSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: comaTex, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.6, depthWrite: false
    }));
    comaSprite.scale.set(3.0, 3.0, 1);
    cometGroup.add(comaSprite);

    const ionCount = 350;
    const ionPositions = new Float32Array(ionCount * 3);
    for (let i = 0; i < ionCount; i++) {
      const z = (i / ionCount) * 45;
      const spread = (z / 45) * 1.8;
      ionPositions[i * 3] = (Math.random() - 0.5) * spread;
      ionPositions[i * 3 + 1] = (Math.random() - 0.5) * spread;
      ionPositions[i * 3 + 2] = z;
    }
    const ionGeo = new THREE.BufferGeometry();
    ionGeo.setAttribute("position", new THREE.BufferAttribute(ionPositions, 3));
    const ionPoints = new THREE.Points(ionGeo, new THREE.PointsMaterial({
      map: softParticleTex, size: 2.2, color: 0x38bdf8, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    cometGroup.add(ionPoints);

    const dustCount = 300;
    const dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const frac = i / dustCount;
      const z = frac * 38;
      const curveX = Math.pow(frac, 1.6) * 7.5;
      dustPositions[i * 3] = curveX + (Math.random() - 0.5) * (frac * 3.2);
      dustPositions[i * 3 + 1] = (Math.random() - 0.5) * (frac * 2.8);
      dustPositions[i * 3 + 2] = z;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
    const dustPoints = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      map: softParticleTex, size: 2.4, color: 0xfef08a, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    cometGroup.add(dustPoints);

    scene.add(cometGroup);

    let currentCometA = 3121.0;
    let cometTargetA = 3121.0;

    const cometOrbitPts = [];
    for (let i = 0; i <= 240; i++) {
      const nu = (i / 240) * Math.PI * 2;
      const r = (1 - 0.967 * 0.967) / (1 + 0.967 * Math.cos(nu));
      cometOrbitPts.push(new THREE.Vector3(Math.cos(nu) * r, Math.sin(nu) * 0.005, Math.sin(nu) * r));
    }
    const cometOrbitLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(cometOrbitPts),
      new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.30 })
    );
    cometOrbitLine.scale.set(currentCometA, 1, currentCometA);
    orbitLinesGroup.add(cometOrbitLine);

    // --- 10. GEOLOGICAL INTERIOR DISSECTION LABORATORY SCENE ---
    const labGroup = new THREE.Group();
    labGroup.visible = false;
    scene.add(labGroup);

    const labKeyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    labKeyLight.position.set(40, 50, 70);
    labGroup.add(labKeyLight);

    const labFillLight = new THREE.DirectionalLight(0x94a3b8, 1.1);
    labFillLight.position.set(-50, -20, -40);
    labGroup.add(labFillLight);

    let labTargetPlanet = PLANET_CONFIGS[3]; // Default Earth
    let labShells = [];
    let labSelectedLayerIdx = null;

    function buildLabDissection(cfg) {
      while (labShells.length > 0) {
        const s = labShells.pop();
        labGroup.remove(s.group);
      }

      labTargetPlanet = cfg;
      const baseR = 18;
      const layerData = cfg.layers || [];
      const numLayers = layerData.length;

      const shellGeo = new THREE.SphereGeometry(baseR, 48, 36, 0, Math.PI * 1.5, 0, Math.PI);
      const shellMat = new THREE.MeshStandardMaterial({
        map: loadTexture(cfg.texFile),
        roughness: 0.5,
        side: THREE.FrontSide
      });
      const shellMesh = new THREE.Mesh(shellGeo, shellMat);
      labGroup.add(shellMesh);
      labShells.push({ group: shellMesh, index: 99 });

      const strataTex = createGeologicalCrossSectionTexture(layerData);

      const cutCapGeoA = new THREE.CircleGeometry(baseR * 0.998, 36, -Math.PI * 0.5, Math.PI);
      const cutCapMatA = new THREE.MeshStandardMaterial({
        map: strataTex, roughness: 0.45, metalness: 0.15,
        emissive: 0xffffff, emissiveMap: strataTex, emissiveIntensity: 0.7, side: THREE.DoubleSide
      });
      const cutCapMeshA = new THREE.Mesh(cutCapGeoA, cutCapMatA);
      labGroup.add(cutCapMeshA);
      labShells.push({ group: cutCapMeshA, index: 98 });

      const cutCapGeoB = new THREE.CircleGeometry(baseR * 0.998, 36, -Math.PI * 0.5, Math.PI);
      const cutCapMatB = cutCapMatA.clone();
      const cutCapMeshB = new THREE.Mesh(cutCapGeoB, cutCapMatB);
      cutCapMeshB.rotation.y = -Math.PI * 0.5;
      labGroup.add(cutCapMeshB);
      labShells.push({ group: cutCapMeshB, index: 97 });

      const innerCoreR = Math.max(1.8, baseR * (layerData[0] ? layerData[0].r : 0.22));
      const innerCoreMesh = new THREE.Mesh(
        new THREE.SphereGeometry(innerCoreR, 32, 24),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0xfff0aa,
          emissiveIntensity: 2.2,
          roughness: 0.25
        })
      );
      labGroup.add(innerCoreMesh);
      labShells.push({ group: innerCoreMesh, index: 0 });

      const listEl = document.getElementById("lab-layers-list");
      listEl.innerHTML = "";
      document.getElementById("lab-planet-name").innerText = cfg.name + " Internal Strata";

      layerData.slice().reverse().forEach(function (layer, revIdx) {
        const actualIdx = numLayers - 1 - revIdx;
        const btn = document.createElement("button");
        btn.className = "layer-btn" + (actualIdx === numLayers - 1 ? " active" : "");
        btn.innerHTML =
          '<div style="font-weight:700; font-size:0.8rem; display:flex; justify-content:space-between;">' +
            '<span>' + layer.name + '</span>' +
            '<span style="color:#f59e0b;">' + layer.temp + '</span>' +
          '</div>' +
          '<div style="font-size:0.68rem; color:#94a3b8; margin-top:0.15rem;">' + layer.depth + ' • ' + layer.press + '</div>';
        btn.onclick = function () { selectLabLayer(actualIdx); };
        listEl.appendChild(btn);
      });

      selectLabLayer(numLayers - 1);
    }

    function selectLabLayer(idx) {
      labSelectedLayerIdx = idx;
      playTone(480 + idx * 40, 0.15, "sine", 0.04);

      const btns = document.querySelectorAll(".layer-btn");
      const numLayers = labTargetPlanet.layers.length;
      btns.forEach(function (b, revIdx) {
        const actualIdx = numLayers - 1 - revIdx;
        b.classList.toggle("active", actualIdx === idx);
      });

      const layer = labTargetPlanet.layers[idx];
      document.getElementById("lab-layer-details").innerHTML =
        '<div style="font-size:0.85rem; font-weight:700; color:#ffffff; margin-bottom:0.3rem;">' +
          layer.name +
        '</div>' +
        '<div style="display:flex; flex-direction:column; gap:0.25rem; margin-bottom:0.5rem; font-family:monospace;">' +
          '<div style="display:flex; justify-content:space-between;"><span style="color:#94a3b8;">Depth:</span><span style="color:#38bdf8;">' + layer.depth + '</span></div>' +
          '<div style="display:flex; justify-content:space-between;"><span style="color:#94a3b8;">Temperature:</span><span style="color:#f59e0b;">' + layer.temp + '</span></div>' +
          '<div style="display:flex; justify-content:space-between;"><span style="color:#94a3b8;">Pressure:</span><span style="color:#a78bfa;">' + layer.press + '</span></div>' +
        '</div>' +
        '<div style="color:#cbd5e1; font-size:0.72rem; line-height:1.4;">' + layer.desc + '</div>';

      labShells.forEach(function (s) {
        if (s.index >= 90) {
          s.group.visible = (idx >= numLayers - 2);
        } else if (s.index === 0) {
          s.group.scale.set(idx === 0 ? 1.4 : 1.0, idx === 0 ? 1.4 : 1.0, idx === 0 ? 1.4 : 1.0);
        }
      });
    }

    // --- 11. INJECT MINIMALIST DOM HUD & STYLES ---
    const styleEl = document.createElement("style");
    styleEl.textContent = `
      * { box-sizing: border-box; user-select: none; }
      #telemetry-hud {
        position: absolute; top: 1.25rem; left: 1.25rem; z-index: 20;
        background: rgba(4, 9, 20, 0.78); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
        border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 12px;
        padding: 0.9rem 1.15rem; color: #f1f5f9; min-width: 275px;
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6); pointer-events: auto;
        transition: opacity 0.3s ease, transform 0.3s ease; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .hud-title { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; color: #38bdf8; font-weight: 700; margin-bottom: 0.25rem; }
      .hud-target { font-size: 1.15rem; font-weight: 800; color: #ffffff; letter-spacing: -0.01em; }
      .hud-metrics { margin-top: 0.55rem; display: flex; flex-direction: column; gap: 0.22rem; }
      .hud-metric-row { display: flex; justify-content: space-between; font-size: 0.74rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      .hud-label { color: #94a3b8; }
      .hud-val { color: #e2e8f0; font-weight: 600; }

      #flight-dock {
        position: absolute; bottom: 1.4rem; left: 50%; transform: translateX(-50%); z-index: 20;
        background: rgba(4, 9, 20, 0.88); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 9999px;
        padding: 0.4rem 0.65rem; display: flex; align-items: center; gap: 0.32rem;
        box-shadow: 0 20px 48px rgba(0, 0, 0, 0.7); pointer-events: auto;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        max-width: 96vw; overflow-x: auto; scrollbar-width: none;
      }
      #flight-dock::-webkit-scrollbar { display: none; }
      .dock-btn {
        background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1);
        color: #e2e8f0; font-size: 0.74rem; font-weight: 600; padding: 0.4rem 0.75rem;
        border-radius: 9999px; cursor: pointer; display: flex; align-items: center; gap: 0.35rem;
        transition: all 0.15s ease; white-space: nowrap; outline: none;
      }
      .dock-btn:hover { background: rgba(56, 189, 248, 0.18); border-color: rgba(56, 189, 248, 0.45); color: #38bdf8; transform: translateY(-1px); }
      .dock-btn.active { background: #38bdf8; border-color: #38bdf8; color: #040914; font-weight: 700; }
      .dock-btn.accent { background: rgba(245, 158, 11, 0.16); border-color: rgba(245, 158, 11, 0.4); color: #f59e0b; }
      .dock-btn.accent:hover { background: #f59e0b; color: #040914; }
      .dock-btn.scale-toggle { border-color: rgba(56, 189, 248, 0.45); }
      .dock-btn.scale-toggle.active { background: rgba(56, 189, 248, 0.22); color: #38bdf8; }
      .dock-sep { width: 1px; height: 18px; background: rgba(255, 255, 255, 0.12); margin: 0 0.15rem; flex-shrink: 0; }

      #hover-tooltip {
        position: absolute; z-index: 25; pointer-events: none; transform: translate(-50%, -130%);
        background: rgba(4, 9, 20, 0.88); border: 1px solid #38bdf8; border-radius: 8px;
        padding: 0.3rem 0.65rem; color: #f8fafc; font-size: 0.72rem; font-weight: 600;
        display: none; white-space: nowrap; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }

      #star-chart-drawer {
        position: absolute; top: 1.25rem; right: 1.25rem; width: 340px; max-height: calc(100vh - 2.5rem);
        background: rgba(4, 9, 20, 0.90); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
        border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 16px;
        padding: 1.1rem; color: #f8fafc; z-index: 30; pointer-events: auto;
        box-shadow: 0 24px 50px rgba(0, 0, 0, 0.8); display: none; flex-direction: column; gap: 0.8rem;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .star-item {
        display: flex; justify-content: space-between; align-items: center;
        background: rgba(255, 255, 255, 0.04); border-left: 3px solid #38bdf8;
        padding: 0.55rem 0.75rem; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;
        margin-bottom: 0.35rem;
      }
      .star-item:hover { background: rgba(56, 189, 248, 0.15); border-left-color: #67e8f9; transform: translateX(3px); }

      #lab-studio {
        position: absolute; inset: 0; z-index: 40; pointer-events: none;
        display: none; flex-direction: column; justify-content: space-between; padding: 1.5rem;
        background: radial-gradient(circle at center, rgba(15, 23, 42, 0.3) 0%, rgba(2, 6, 23, 0.85) 100%);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      #lab-studio.active { display: flex; pointer-events: auto; }
      .lab-header {
        background: rgba(4, 9, 20, 0.85); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
        border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 14px;
        padding: 0.85rem 1.3rem; display: flex; justify-content: space-between; align-items: center;
        max-width: 900px; margin: 0 auto; width: 100%;
      }
      .lab-body-info { display: flex; align-items: center; gap: 1rem; }
      .lab-title { font-size: 1.25rem; font-weight: 800; color: #ffffff; }
      .lab-badge { font-size: 0.7rem; font-weight: 700; background: #f59e0b; color: #040914; padding: 0.15rem 0.5rem; border-radius: 9999px; text-transform: uppercase; }

      .lab-card {
        position: absolute; right: 1.5rem; top: 6rem; width: 360px; max-height: calc(100vh - 8rem);
        background: rgba(4, 9, 20, 0.88); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 14px;
        padding: 1.2rem; color: #f8fafc; overflow-y: auto; display: flex; flex-direction: column; gap: 0.9rem;
        box-shadow: 0 20px 48px rgba(0,0,0,0.7);
      }
      .layer-selector { display: flex; flex-direction: column; gap: 0.4rem; }
      .layer-btn {
        background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px; padding: 0.6rem 0.8rem; text-align: left; cursor: pointer; color: #e2e8f0;
        transition: all 0.15s ease;
      }
      .layer-btn:hover { background: rgba(56, 189, 248, 0.15); border-color: #38bdf8; }
      .layer-btn.active { background: rgba(245, 158, 11, 0.2); border-color: #f59e0b; color: #fef3c7; }

      #eye-bloom-overlay {
        position: absolute; inset: 0; pointer-events: none; z-index: 10;
        background: none; transition: opacity 0.15s ease-out;
      }

      #hotkey-hint {
        position: absolute; bottom: 4.8rem; left: 50%; transform: translateX(-50%); z-index: 20;
        font-size: 0.7rem; color: rgba(255, 255, 255, 0.45); pointer-events: none; letter-spacing: 0.04em;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
    `;
    document.head.appendChild(styleEl);

    const hudContainer = document.createElement("div");
    hudContainer.innerHTML =
      '<div id="eye-bloom-overlay"></div>' +
      '<div id="telemetry-hud">' +
        '<div class="hud-title">Orbital Telemetry</div>' +
        '<div class="hud-target" id="hud-target-name">☉ Sol (System Origin)</div>' +
        '<div class="hud-metrics">' +
          '<div class="hud-metric-row"><span class="hud-label">Physical Radius:</span><span class="hud-val" id="hud-val-radius">696,340 km (109.3 R⊕)</span></div>' +
          '<div class="hud-metric-row"><span class="hud-label">Volume vs Earth:</span><span class="hud-val" id="hud-val-vol">1,304,000× Earth</span></div>' +
          '<div class="hud-metric-row"><span class="hud-label">Heliocentric Range:</span><span class="hud-val" id="hud-val-dist">0.000 AU</span></div>' +
          '<div class="hud-metric-row"><span class="hud-label">Orbital Velocity:</span><span class="hud-val" id="hud-val-speed">0.00 km/s</span></div>' +
          '<div class="hud-metric-row"><span class="hud-label">Solar Irradiance:</span><span class="hud-val" id="hud-val-flux">100.0%</span></div>' +
          '<div class="hud-metric-row"><span class="hud-label">Scale Mode:</span><span class="hud-val" id="hud-val-scale" style="color:#38bdf8;">True Scale (Distances & Sizes)</span></div>' +
        '</div>' +
      '</div>' +
      '<div id="hover-tooltip"></div>' +
      '<div id="flight-dock">' +
        '<button class="dock-btn active" id="dock-btn-system" title="Solar System Full Overview (Key: 0)">🌌 Full System</button>' +
        '<button class="dock-btn" id="dock-btn-inner" title="Inner Terrestrial Planets (Mercury to Mars)">☀️ Inner</button>' +
        '<div class="dock-sep"></div>' +
        '<button class="dock-btn" id="dock-btn-sun" title="Target Sun (Sol)">☉ Sun</button>' +
        '<button class="dock-btn" id="dock-btn-earth" title="Target Earth (Terra)">⊕ Earth</button>' +
        '<button class="dock-btn" id="dock-btn-mars" title="Target Mars">♂ Mars</button>' +
        '<button class="dock-btn" id="dock-btn-jupiter" title="Target Jupiter">♃ Jupiter</button>' +
        '<button class="dock-btn" id="dock-btn-saturn" title="Target Saturn">♄ Saturn</button>' +
        '<button class="dock-btn" id="dock-btn-uranus" title="Target Uranus">♅ Uranus</button>' +
        '<button class="dock-btn" id="dock-btn-neptune" title="Target Neptune">♆ Neptune</button>' +
        '<div class="dock-sep"></div>' +
        '<button class="dock-btn scale-toggle active" id="dock-btn-scale" title="Toggle Distance Scale: True AU vs Compact Orrery (Key: S)">📏 True Distances</button>' +
        '<button class="dock-btn scale-toggle active" id="dock-btn-size-scale" title="Toggle Object Sizes: True Proportional Scale vs Compact (Key: Z)">📐 Scaled Sizes</button>' +
        '<button class="dock-btn accent" id="dock-btn-lab" title="Inspect Geological Core Dissection (Key: C)">🔬 Core Lab</button>' +
        '<button class="dock-btn" id="dock-btn-stars" title="Deep Space Star Systems">✨ Stars</button>' +
        '<button class="dock-btn" id="dock-btn-comet" title="Halley\'s Comet (1P/Halley)">☄️ Comet</button>' +
        '<div class="dock-sep"></div>' +
        '<button class="dock-btn" id="dock-btn-pause" title="Pause / Resume Orbits (Key: Space)">⏸</button>' +
        '<button class="dock-btn" id="dock-btn-speed" title="Adjust Simulation Time Scale">1× Speed</button>' +
        '<button class="dock-btn" id="dock-btn-orbits" title="Toggle Keplerian Orbit Lines (Key: O)">Orbits</button>' +
        '<button class="dock-btn" id="dock-btn-sound" title="Toggle Synthesized Audio">🔊</button>' +
      '</div>' +
      '<div id="hotkey-hint">Press [Space] Pause • [S] Distances • [Z] Sizes • [C] Core Lab • [O] Orbits • [H] Hide HUD • [Click] Target Body</div>' +
      '<div id="star-chart-drawer">' +
        '<div style="display:flex; justify-content:space-between; align-items:center;">' +
          '<div style="font-size:1.05rem; font-weight:800; color:#38bdf8;">✨ Interstellar Catalog</div>' +
          '<button id="close-star-drawer" style="background:none; border:none; color:#94a3b8; font-size:1.2rem; cursor:pointer;">✕</button>' +
        '</div>' +
        '<div style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Select any prominent star system to engage interstellar warp travel.</div>' +
        '<div id="star-list-container" style="overflow-y:auto; max-height:360px;"></div>' +
      '</div>' +
      '<div id="lab-studio">' +
        '<div class="lab-header">' +
          '<div class="lab-body-info">' +
            '<span class="lab-badge">Laboratory Dissection</span>' +
            '<div class="lab-title" id="lab-planet-name">Earth Interior Strata</div>' +
          '</div>' +
          '<button class="dock-btn" id="lab-exit-btn" style="background:#f59e0b; color:#040914; font-weight:700;">← Return to Spaceflight [ESC]</button>' +
        '</div>' +
        '<div class="lab-card">' +
          '<div style="font-size:0.95rem; font-weight:700; color:#f8fafc; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:0.4rem;">Geological Layers & Thermodynamics</div>' +
          '<div class="layer-selector" id="lab-layers-list"></div>' +
          '<div id="lab-layer-details" style="background:rgba(255,255,255,0.04); border-radius:8px; padding:0.75rem; font-size:0.75rem; line-height:1.45; color:#cbd5e1;"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(hudContainer);

    // --- 12. RUNTIME STATE & CONTROLLER ---
    let simTime = 0;
    let timeScale = 1.0;
    let isOrbitPaused = false;
    let showOrbits = true;
    let hudVisible = true;
    let inLabMode = false;
    let isTrueScale = true; // True astronomical distances by default
    let isSizeToScale = true; // True relative physical sizes by default
    let activeSystemView = "system";

    let targetBody = null;
    let targetStar = null;
    let targetComet = false;

    let cameraDistance = 7800; // Fits true scale solar system out to Neptune
    let cameraPitch = 0.52;
    let cameraYaw = 0.0;
    const curLookAt = new THREE.Vector3(0, 0, 0);
    const targetLookAt = new THREE.Vector3(0, 0, 0);

    let eyeAdaptation = 1.0;

    // --- 13. SCALE MODE TOGGLES ---
    function updateHudScaleText() {
      const hudScaleEl = document.getElementById("hud-val-scale");
      if (!hudScaleEl) return;
      if (isTrueScale && isSizeToScale) {
        hudScaleEl.innerText = "True Scale (Distances & Sizes)";
        hudScaleEl.style.color = "#38bdf8";
      } else if (isTrueScale && !isSizeToScale) {
        hudScaleEl.innerText = "True Distances (AU) • Compact Sizes";
        hudScaleEl.style.color = "#a78bfa";
      } else if (!isTrueScale && isSizeToScale) {
        hudScaleEl.innerText = "Compact Orbits • Scaled Sizes";
        hudScaleEl.style.color = "#f59e0b";
      } else {
        hudScaleEl.innerText = "Compact Orrery (All Compact)";
        hudScaleEl.style.color = "#94a3b8";
      }
    }

    function toggleDistanceScale() {
      isTrueScale = !isTrueScale;
      playTone(isTrueScale ? 520 : 360, 0.15, "triangle", 0.05);

      const scaleBtn = document.getElementById("dock-btn-scale");
      if (scaleBtn) {
        scaleBtn.innerHTML = isTrueScale ? "📏 True Distances" : "🪐 Compact Orbits";
        scaleBtn.classList.toggle("active", isTrueScale);
      }

      updateHudScaleText();

      // Smoothly update target distances and speed multipliers for all planets
      celestialMeshes.forEach(function (item) {
        item.targetDist = isTrueScale ? item.config.realDist : item.config.compactDist;
        item.speedMult = isTrueScale ? item.config.realSpeed : item.config.speed;
      });

      // Target scales for asteroid belt, Kuiper belt, and comet orbit
      astTargetScale = isTrueScale ? 1.0 : (297.5 / 472.5);
      kbTargetScale = isTrueScale ? 1.0 : (835.0 / 7000.0);
      cometTargetA = isTrueScale ? 3121.0 : 280.0;

      if (!targetBody && !targetStar && !targetComet) {
        if (activeSystemView === "inner") {
          cameraDistance = isTrueScale ? 520 : 380;
        } else {
          cameraDistance = isTrueScale ? 7800 : 750;
        }
      }
    }

    function toggleSizeScale() {
      isSizeToScale = !isSizeToScale;
      playTone(isSizeToScale ? 580 : 320, 0.15, "sine", 0.05);

      const sizeBtn = document.getElementById("dock-btn-size-scale");
      if (sizeBtn) {
        sizeBtn.innerHTML = isSizeToScale ? "📐 Scaled Sizes" : "🪐 Compact Sizes";
        sizeBtn.classList.toggle("active", isSizeToScale);
      }

      updateHudScaleText();

      // Update target sizes for all planets
      celestialMeshes.forEach(function (item) {
        const targetR = isSizeToScale ? item.config.scaleRadius : item.config.compactRadius;
        item.targetSizeScale = targetR / item.config.scaleRadius;
      });

      // Update moons
      celestialMeshes.forEach(function (item) {
        item.moonMeshes.forEach(function (m) {
          const targetMR = isSizeToScale ? m.config.scaleRadius : m.config.compactRadius;
          m.mesh.scale.setScalar(targetMR / m.config.scaleRadius);
        });
      });

      // Adjust camera distance if currently focused on a planet
      if (targetBody && targetBody.config) {
        const curR = isSizeToScale ? (targetBody.config.scaleRadius || 2.4) : (targetBody.config.compactRadius || 8.2);
        cameraDistance = Math.max(8.0, curR * 4.2);
      }
    }

    // --- 14. FLIGHT TRANSITIONS & INTERACTION ---
    function flyToPlanet(id) {
      if (inLabMode) exitLabMode();
      playWarpSound();
      targetStar = null;
      targetComet = false;

      if (id === "sun") {
        targetBody = { config: PLANET_CONFIGS[0], group: sunGroup, radius: sunCfg.scaleRadius, currentDist: 0 };
        cameraDistance = sunCfg.scaleRadius * 3.2;
        cameraPitch = 0.25;
      } else {
        const match = celestialMeshes.find(function (m) { return m.config.id === id; });
        if (!match) return;
        targetBody = match;
        const curR = isSizeToScale ? match.config.scaleRadius : match.config.compactRadius;
        cameraDistance = Math.max(8.0, curR * 4.2);
        cameraPitch = 0.22;
        const curAngle = Math.atan2(match.group.position.x, match.group.position.z);
        cameraYaw = curAngle + 0.35;
      }

      updateDockActive(id);
    }

    function flyToSystemOverview() {
      if (inLabMode) exitLabMode();
      playWarpSound();
      targetBody = null;
      targetStar = null;
      targetComet = false;
      activeSystemView = "system";
      cameraDistance = isTrueScale ? 7800 : 750;
      cameraPitch = 0.52;
      updateDockActive("system");
    }

    function flyToInnerSystem() {
      if (inLabMode) exitLabMode();
      playWarpSound();
      targetBody = null;
      targetStar = null;
      targetComet = false;
      activeSystemView = "inner";
      cameraDistance = isTrueScale ? 520 : 380;
      cameraPitch = 0.44;
      updateDockActive("inner");
    }

    function flyToComet() {
      if (inLabMode) exitLabMode();
      playWarpSound();
      targetBody = null;
      targetStar = null;
      targetComet = true;
      cameraDistance = 35;
      cameraPitch = 0.22;
      const angle = Math.atan2(cometGroup.position.x, cometGroup.position.z);
      cameraYaw = angle + Math.PI * 0.4;
      updateDockActive("comet");
    }

    function flyToStar(st) {
      if (inLabMode) exitLabMode();
      playWarpSound();
      targetStar = st;
      targetBody = null;
      targetComet = false;
      cameraDistance = 240;
      cameraPitch = 0.15;
      cameraYaw = 0.0;
      document.getElementById("star-chart-drawer").style.display = "none";
      updateDockActive("stars");
    }

    function enterLabMode() {
      inLabMode = true;
      isOrbitPaused = true;
      playLabSound();

      const planetCfg = (targetBody && targetBody.config.layers) ? targetBody.config : PLANET_CONFIGS[3];

      sunGroup.visible = false;
      celestialMeshes.forEach(function (m) { m.group.visible = false; });
      orbitLinesGroup.visible = false;
      cometGroup.visible = false;
      astPoints.visible = false;
      kbPoints.visible = false;
      labGroup.visible = true;

      labGroup.position.set(-14, 0, 0);
      buildLabDissection(planetCfg);

      labGroup.rotation.set(0.18, Math.PI * 0.72, 0);

      cameraDistance = 62;
      cameraPitch = 0.18;
      cameraYaw = 0.0;
      targetLookAt.set(-14, 0, 0);

      document.getElementById("lab-studio").classList.add("active");
      document.getElementById("flight-dock").style.display = "none";
      document.getElementById("telemetry-hud").style.display = "none";
      document.getElementById("hotkey-hint").style.display = "none";
    }

    function exitLabMode() {
      inLabMode = false;
      isOrbitPaused = false;
      playTone(380, 0.25, "sine", 0.05);

      labGroup.visible = false;
      sunGroup.visible = true;
      celestialMeshes.forEach(function (m) { m.group.visible = true; });
      orbitLinesGroup.visible = showOrbits;
      cometGroup.visible = true;
      astPoints.visible = true;
      kbPoints.visible = true;

      document.getElementById("lab-studio").classList.remove("active");
      document.getElementById("flight-dock").style.display = "flex";
      document.getElementById("telemetry-hud").style.display = "block";
      document.getElementById("hotkey-hint").style.display = "block";

      if (targetBody) {
        const curR = isSizeToScale ? (targetBody.config.scaleRadius || 2.4) : (targetBody.config.compactRadius || 8.2);
        cameraDistance = Math.max(8.0, curR * 4.2);
      } else {
        cameraDistance = isTrueScale ? (activeSystemView === "inner" ? 520 : 7800) : 750;
      }
    }

    function updateDockActive(id) {
      document.querySelectorAll(".dock-btn").forEach(function (b) { b.classList.remove("active"); });
      const btn = document.getElementById("dock-btn-" + id);
      if (btn) btn.classList.add("active");
      const scaleBtn = document.getElementById("dock-btn-scale");
      if (scaleBtn && isTrueScale) scaleBtn.classList.add("active");
      const sizeBtn = document.getElementById("dock-btn-size-scale");
      if (sizeBtn && isSizeToScale) sizeBtn.classList.add("active");
    }

    // --- 15. UI EVENT LISTENERS & HOTKEYS ---
    document.getElementById("dock-btn-system").onclick = flyToSystemOverview;
    document.getElementById("dock-btn-inner").onclick = flyToInnerSystem;
    document.getElementById("dock-btn-sun").onclick = function () { flyToPlanet("sun"); };
    document.getElementById("dock-btn-earth").onclick = function () { flyToPlanet("earth"); };
    document.getElementById("dock-btn-mars").onclick = function () { flyToPlanet("mars"); };
    document.getElementById("dock-btn-jupiter").onclick = function () { flyToPlanet("jupiter"); };
    document.getElementById("dock-btn-saturn").onclick = function () { flyToPlanet("saturn"); };
    document.getElementById("dock-btn-uranus").onclick = function () { flyToPlanet("uranus"); };
    document.getElementById("dock-btn-neptune").onclick = function () { flyToPlanet("neptune"); };
    document.getElementById("dock-btn-scale").onclick = toggleDistanceScale;
    document.getElementById("dock-btn-size-scale").onclick = toggleSizeScale;
    document.getElementById("dock-btn-comet").onclick = flyToComet;
    document.getElementById("dock-btn-lab").onclick = enterLabMode;
    document.getElementById("lab-exit-btn").onclick = exitLabMode;

    const starDrawer = document.getElementById("star-chart-drawer");
    document.getElementById("dock-btn-stars").onclick = function () {
      const isVisible = starDrawer.style.display === "flex";
      starDrawer.style.display = isVisible ? "none" : "flex";
      if (!isVisible) renderStarDrawerList();
    };
    document.getElementById("close-star-drawer").onclick = function () {
      starDrawer.style.display = "none";
    };

    function renderStarDrawerList() {
      const container = document.getElementById("star-list-container");
      container.innerHTML = "";
      FAMOUS_STARS.forEach(function (st) {
        const item = document.createElement("div");
        item.className = "star-item";
        item.style.borderLeftColor = st.colorCss;
        item.innerHTML =
          '<div>' +
            '<div style="font-size:0.82rem; font-weight:700; color:#f8fafc;">' + st.name + '</div>' +
            '<div style="font-size:0.68rem; color:#94a3b8;">' + st.spec + ' • ' + st.dist + '</div>' +
          '</div>' +
          '<button style="background:rgba(56,189,248,0.2); border:1px solid #38bdf8; color:#38bdf8; font-size:0.7rem; font-weight:600; padding:0.25rem 0.55rem; border-radius:4px; cursor:pointer;">' +
            'Warp 🚀' +
          '</button>';
        item.onclick = function () { flyToStar(st); };
        container.appendChild(item);
      });
    }

    const pauseBtn = document.getElementById("dock-btn-pause");
    pauseBtn.onclick = function () {
      isOrbitPaused = !isOrbitPaused;
      pauseBtn.innerText = isOrbitPaused ? "⏵ Play" : "⏸";
      playTone(400, 0.1, "sine", 0.04);
    };

    const speedBtn = document.getElementById("dock-btn-speed");
    const speedSteps = [0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 25.0];
    let speedStepIdx = 2;
    speedBtn.onclick = function () {
      speedStepIdx = (speedStepIdx + 1) % speedSteps.length;
      timeScale = speedSteps[speedStepIdx];
      speedBtn.innerText = timeScale + "× Speed";
      playTone(440, 0.1, "sine", 0.04);
    };

    const orbitsBtn = document.getElementById("dock-btn-orbits");
    orbitsBtn.onclick = function () {
      showOrbits = !showOrbits;
      orbitLinesGroup.visible = showOrbits;
      orbitsBtn.style.opacity = showOrbits ? "1" : "0.5";
      playTone(420, 0.1, "sine", 0.04);
    };

    const soundBtn = document.getElementById("dock-btn-sound");
    soundBtn.onclick = function () {
      soundEnabled = !soundEnabled;
      soundBtn.innerText = soundEnabled ? "🔊" : "🔇";
      playTone(500, 0.1, "sine", 0.05);
    };

    window.addEventListener("keydown", function (e) {
      if (e.code === "Space") {
        e.preventDefault();
        isOrbitPaused = !isOrbitPaused;
        pauseBtn.innerText = isOrbitPaused ? "⏵ Play" : "⏸";
      } else if (e.code === "KeyS") {
        toggleDistanceScale();
      } else if (e.code === "KeyZ") {
        toggleSizeScale();
      } else if (e.code === "KeyC") {
        if (inLabMode) exitLabMode(); else enterLabMode();
      } else if (e.code === "Escape") {
        if (inLabMode) exitLabMode();
        starDrawer.style.display = "none";
      } else if (e.code === "KeyO") {
        showOrbits = !showOrbits;
        orbitLinesGroup.visible = showOrbits;
        orbitsBtn.style.opacity = showOrbits ? "1" : "0.5";
      } else if (e.code === "KeyH") {
        hudVisible = !hudVisible;
        const op = hudVisible ? "1" : "0";
        document.getElementById("telemetry-hud").style.opacity = op;
        document.getElementById("flight-dock").style.opacity = op;
        document.getElementById("hotkey-hint").style.opacity = op;
      }
    });

    // --- 16. DIRECT VIEWPORT CLICK & ORBIT CONTROLS WITH PROXIMITY HIT ---
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const tooltip = document.getElementById("hover-tooltip");

    function findHoveredOrClickedPlanet(clientX, clientY) {
      mouse.x = (clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const candidates = celestialMeshes.map(function (m) { return m.mesh; });
      candidates.push(sunMesh);
      const intersects = raycaster.intersectObjects(candidates);

      if (intersects.length > 0) {
        const hit = intersects[0].object;
        return celestialMeshes.find(function (m) { return m.mesh === hit; }) || (hit === sunMesh ? { config: sunCfg } : null);
      }

      // Screen-space proximity search (22px radius) so small scaled terrestrial planets are easy to hover & click
      let bestMatch = null;
      let minDistance = 22;
      const screenPos = new THREE.Vector3();

      celestialMeshes.forEach(function (m) {
        m.group.getWorldPosition(screenPos);
        screenPos.project(camera);
        if (screenPos.z < 1.0) {
          const px = ((screenPos.x + 1) * window.innerWidth) / 2;
          const py = ((-screenPos.y + 1) * window.innerHeight) / 2;
          const d = Math.hypot(px - clientX, py - clientY);
          if (d < minDistance) {
            minDistance = d;
            bestMatch = m;
          }
        }
      });

      return bestMatch;
    }

    window.addEventListener("pointerdown", function (e) {
      if (e.target.closest("#flight-dock, #telemetry-hud, #star-chart-drawer, #lab-studio")) return;
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    });

    window.addEventListener("pointermove", function (e) {
      if (isDragging) {
        const dx = e.clientX - prevMouseX;
        const dy = e.clientY - prevMouseY;
        cameraYaw -= dx * 0.005;
        cameraPitch = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, cameraPitch + dy * 0.005));
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
      }

      if (!inLabMode && !isDragging) {
        const matched = findHoveredOrClickedPlanet(e.clientX, e.clientY);
        if (matched) {
          tooltip.style.display = "block";
          tooltip.style.left = e.clientX + "px";
          tooltip.style.top = e.clientY + "px";
          tooltip.innerText = matched.config.name + " (Click to fly)";
          document.body.style.cursor = "pointer";
          return;
        }
      }
      tooltip.style.display = "none";
      document.body.style.cursor = "default";
    });

    window.addEventListener("pointerup", function () { isDragging = false; });

    window.addEventListener("click", function (e) {
      if (isDragging) return;
      if (e.target.closest("#flight-dock, #telemetry-hud, #star-chart-drawer, #lab-studio")) return;

      const matched = findHoveredOrClickedPlanet(e.clientX, e.clientY);
      if (matched) {
        flyToPlanet(matched.config.id);
      }
    });

    window.addEventListener("wheel", function (e) {
      if (inLabMode) {
        cameraDistance = Math.max(28, Math.min(120, cameraDistance + e.deltaY * 0.05));
      } else {
        cameraDistance = Math.max(8, Math.min(24000, cameraDistance * (1 + e.deltaY * 0.001)));
      }
    }, { passive: true });

    window.addEventListener("resize", function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // --- 17. ANIMATION & EYE ADAPTATION LOOP ---
    const clock = new THREE.Clock();

    function animate() {
      requestAnimationFrame(animate);
      const dt = Math.min(0.1, clock.getDelta());

      // Smoothly interpolate belt and comet scales during distance scale transitions
      currentAstScale = THREE.MathUtils.lerp(currentAstScale, astTargetScale, dt * 3.5);
      astPoints.scale.set(currentAstScale, 1, currentAstScale);

      currentKbScale = THREE.MathUtils.lerp(currentKbScale, kbTargetScale, dt * 3.5);
      kbPoints.scale.set(currentKbScale, 1, currentKbScale);

      currentCometA = THREE.MathUtils.lerp(currentCometA, cometTargetA, dt * 3.5);
      cometOrbitLine.scale.set(currentCometA, 1, currentCometA);

      // Smoothly interpolate planet object sizes
      celestialMeshes.forEach(function (item) {
        item.currentSizeScale = THREE.MathUtils.lerp(item.currentSizeScale, item.targetSizeScale, dt * 4.0);
        item.bodyGroup.scale.setScalar(item.currentSizeScale);
      });

      const sunTargetScale = isSizeToScale ? 1.0 : (sunCfg.compactRadius / sunCfg.scaleRadius);
      sunMesh.scale.lerp(new THREE.Vector3(sunTargetScale, sunTargetScale, sunTargetScale), dt * 4.0);

      if (!isOrbitPaused) {
        simTime += dt * timeScale;

        celestialMeshes.forEach(function (item) {
          // Smoothly animate orbital distance between True Scale and Compact
          item.currentDist = THREE.MathUtils.lerp(item.currentDist, item.targetDist, dt * 3.5);
          item.orbitLine.scale.set(item.currentDist, 1, item.currentDist);

          item.angle += dt * 0.15 * item.speedMult * timeScale;
          const px = Math.cos(item.angle) * item.currentDist;
          const pz = Math.sin(item.angle) * item.currentDist;
          item.group.position.set(px, 0, pz);

          item.mesh.rotation.y += dt * 0.5;
          if (item.earthClouds) item.earthClouds.rotation.y += dt * 0.65;

          item.moonMeshes.forEach(function (m) {
            m.angle += dt * 0.8 * m.config.speed * timeScale;
            m.mesh.position.set(
              Math.cos(m.angle) * m.config.dist,
              0,
              Math.sin(m.angle) * m.config.dist
            );
            m.mesh.rotation.y += dt * 0.4;
          });
        });

        // Orbit Halley's Comet
        const cometMeanAnomaly = (simTime * 0.04) % (Math.PI * 2);
        let cometEccAnomaly = cometMeanAnomaly;
        for (let j = 0; j < 4; j++) {
          cometEccAnomaly = cometMeanAnomaly + 0.967 * Math.sin(cometEccAnomaly);
        }
        const cometTrueAnomaly = 2 * Math.atan2(
          Math.sqrt(1 + 0.967) * Math.sin(cometEccAnomaly / 2),
          Math.sqrt(1 - 0.967) * Math.cos(cometEccAnomaly / 2)
        );
        const cometNormR = (1 - 0.967 * 0.967) / (1 + 0.967 * Math.cos(cometTrueAnomaly));
        const cometR = currentCometA * cometNormR;
        cometGroup.position.set(
          Math.cos(cometTrueAnomaly) * cometR,
          Math.sin(cometTrueAnomaly) * (currentCometA * 0.005),
          Math.sin(cometTrueAnomaly) * cometR
        );

        const antiSolarDir = cometGroup.position.clone().normalize();
        ionPoints.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), antiSolarDir);

        const cometVel = new THREE.Vector3(-Math.sin(cometTrueAnomaly), 0, Math.cos(cometTrueAnomaly)).normalize();
        const dustDir = antiSolarDir.clone().multiplyScalar(0.8).sub(cometVel.multiplyScalar(0.3)).normalize();
        dustPoints.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dustDir);

        const cometLuminosity = Math.max(0.1, Math.min(1.8, 220 / Math.max(30, cometR)));
        ionPoints.scale.set(1.0, 1.0, cometLuminosity);
        dustPoints.scale.set(1.1, 1.1, cometLuminosity * 0.85);
        ionPoints.material.opacity = Math.min(0.55, cometLuminosity * 0.38);
        dustPoints.material.opacity = Math.min(0.42, cometLuminosity * 0.28);
      }

      // Camera Look-At Target Lerp
      if (inLabMode) {
        targetLookAt.set(-14, 0, 0);
      } else if (targetStar) {
        targetLookAt.copy(targetStar.pos);
      } else if (targetComet) {
        targetLookAt.copy(cometGroup.position);
      } else if (targetBody) {
        targetLookAt.copy(targetBody.group.position);
      } else {
        targetLookAt.set(0, 0, 0);
      }

      curLookAt.lerp(targetLookAt, 0.08);

      const eyeX = curLookAt.x + cameraDistance * Math.cos(cameraPitch) * Math.sin(cameraYaw);
      const eyeY = curLookAt.y + cameraDistance * Math.sin(cameraPitch);
      const eyeZ = curLookAt.z + cameraDistance * Math.cos(cameraPitch) * Math.cos(cameraYaw);

      camera.position.lerp(new THREE.Vector3(eyeX, eyeY, eyeZ), 0.1);
      camera.lookAt(curLookAt);

      // PHOTOMETRIC SOLAR INCANDESCENCE & HUMAN EYE PUPIL ADAPTATION
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);

      const toSun = sunGroup.position.clone().sub(camera.position);
      const distToSun = toSun.length();
      toSun.normalize();

      const sunDot = Math.max(0, camDir.dot(toSun));
      const rawSolarFlux = Math.min(4.0, 320 / Math.max(40, distToSun));

      if (sunDot > 0.88 && !inLabMode) {
        eyeAdaptation = THREE.MathUtils.lerp(eyeAdaptation, 0.35, dt * 1.1);
        const focusFactor = (sunDot - 0.88) / 0.12;
        const targetExp = 1.0 + focusFactor * (rawSolarFlux * eyeAdaptation * 1.2);
        renderer.toneMappingExposure = THREE.MathUtils.lerp(renderer.toneMappingExposure, targetExp, dt * 2.2);
      } else {
        eyeAdaptation = THREE.MathUtils.lerp(eyeAdaptation, 1.0, dt * 0.85);
        renderer.toneMappingExposure = THREE.MathUtils.lerp(renderer.toneMappingExposure, 1.0, dt * 2.5);
      }

      // Solar Glare Distance Scaling (Pinpoint in outer reaches of the solar system)
      const glareScaleFactor = Math.max(0.35, Math.min(2.5, 520 / Math.max(70, distToSun)));
      sunCoreGlare.scale.set(sunCfg.scaleRadius * 2.2 * glareScaleFactor, sunCfg.scaleRadius * 2.2 * glareScaleFactor, 1);
      sunOuterCorona.scale.set(sunCfg.scaleRadius * 4.8 * glareScaleFactor, sunCfg.scaleRadius * 4.8 * glareScaleFactor, 1);
      sunCoreGlare.material.opacity = Math.min(0.98, 0.45 + 0.5 * eyeAdaptation);
      sunOuterCorona.material.opacity = Math.min(0.75, (0.3 + 0.35 * eyeAdaptation) * Math.min(1.0, glareScaleFactor));

      // Telemetry HUD Update
      if (hudVisible && !inLabMode) {
        let name = "Sol (System Origin)";
        let radiusText = sunCfg.stats["Equatorial Radius"];
        let volText = sunCfg.stats["Volume vs Earth"];
        let distAu = "0.000 AU";
        let vel = "0.00 km/s";
        let fluxText = (rawSolarFlux * 100).toFixed(0) + "%";

        if (targetStar) {
          name = targetStar.name;
          radiusText = "Stellar Sphere (" + targetStar.spec + ")";
          volText = targetStar.desc;
          distAu = targetStar.dist;
          vel = "Relativistic Warp";
          fluxText = "< 0.001%";
        } else if (targetComet) {
          name = "1P/Halley (Comet)";
          radiusText = "11 × 8 × 8 km Nucleus";
          volText = "Dirty Snowball (0.00000001× Earth)";
          const liveCometDist = cometGroup.position.length();
          const auVal = liveCometDist / 175;
          distAu = auVal.toFixed(3) + " AU (" + (auVal * 149.6).toFixed(1) + "M km)";
          vel = (54.5 * (150 / Math.max(50, liveCometDist))).toFixed(1) + " km/s";
          fluxText = auVal > 0 ? (100 / (auVal * auVal)).toFixed(1) + "%" : "100%";
        } else if (targetBody) {
          name = targetBody.config.name;
          radiusText = targetBody.config.stats["Equatorial Radius"] || "N/A";
          volText = targetBody.config.stats["Volume vs Earth"] || "N/A";
          const liveDist = typeof targetBody.currentDist === "number" ? targetBody.currentDist : targetBody.config.dist;
          const auVal = liveDist / 175;
          distAu = liveDist === 0 ? "0.000 AU" : auVal.toFixed(3) + " AU (" + (auVal * 149.6).toFixed(1) + "M km)";
          vel = targetBody.config.stats["Orbital Velocity"] || ((29.8 * targetBody.config.speed).toFixed(2) + " km/s");
          fluxText = auVal > 0 ? (100 / (auVal * auVal)).toFixed(1) + "%" : "100%";
        }

        document.getElementById("hud-target-name").innerText = name;
        document.getElementById("hud-val-radius").innerText = radiusText;
        document.getElementById("hud-val-vol").innerText = volText;
        document.getElementById("hud-val-dist").innerText = distAu;
        document.getElementById("hud-val-speed").innerText = vel;
        document.getElementById("hud-val-flux").innerText = fluxText;
      }

      renderer.render(scene, camera);
    }

    animate();
  }
})();
