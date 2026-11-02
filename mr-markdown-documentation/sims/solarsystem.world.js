// Solar System 3D Master Astrophotography & Spaceflight Engine
// Implements:
// 1. True Astronomical Distance Scaling (Proportional AU distances from Mercury to Neptune & Kuiper Belt)
// 2. True Astronomical Object Size Scaling (Proportional planetary radii: Jupiter 10.97×, Saturn 9.14×, Uranus 3.98×, Earth 1.0×, etc.)
// 3. Dual Scale Engine: Instant seamless toggles for Distance Scale and Object Size Scale
// 4. Incandescent Sun with source-centered glare
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
    let soundEnabled=true,audioCtx=null,lastSound=0;
    function playTone(freq=440,duration=.18){
      if(!soundEnabled||performance.now()-lastSound<100)return;
      const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
      audioCtx ||= new Audio();audioCtx.resume();lastSound=performance.now();
      const now=audioCtx.currentTime,osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
      osc.type='sine';osc.frequency.setValueAtTime(freq,now);osc.frequency.exponentialRampToValueAtTime(freq*.98,now+duration);
      gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.018,now+.025);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
      osc.connect(gain);gain.connect(audioCtx.destination);osc.start(now);osc.stop(now+duration+.02);
    }
    function playWarpSound(){playTone(196,.65);}
    function playLabSound(){}

    // --- 2. RENDERER, CANVAS & SCENE ---
    const canvas = document.getElementById("c");
    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: false,
      logarithmicDepthBuffer: true,
      powerPreference: "high-performance"
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010206);
    scene.fog = new THREE.FogExp2(0x010206, 0.000004);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.0001, 140000);
    camera.position.set(0, 520 * Math.sin(0.44), 520 * Math.cos(0.44));

    // Texture Loaders
    const TEXTURE_LOCAL = "assets/textures/";
    const TEXTURE_CDN = "https://cdn.jsdelivr.net/gh/sanderblue/solar-system-threejs@gh-pages/src/assets/textures/";
    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin("anonymous");

    const textureCache = new Map();
    function loadTexture(name) {
      if(textureCache.has(name))return textureCache.get(name);
      const texture = textureLoader.load(TEXTURE_LOCAL+name,undefined,undefined,()=>{
        textureLoader.load(TEXTURE_CDN+name, fallback=>{texture.image=fallback.image;texture.needsUpdate=true;fallback.dispose();});
      });
      // Surface photographs are color data, not linear light. Keep the same
      // interpretation when an asynchronous CDN fallback replaces the image.
      texture.encoding = THREE.sRGBEncoding;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      textureCache.set(name,texture);return texture;
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
    // Full celestial sphere panorama: ESO/S. Brunier, eso0932a.
    const skyTexture=loadTexture('milky-way.jpg');skyTexture.encoding=THREE.sRGBEncoding;
    const sky=new THREE.Mesh(new THREE.SphereGeometry(100000,64,32),new THREE.MeshBasicMaterial({map:skyTexture,side:THREE.BackSide,depthWrite:false,fog:false,toneMapped:false,color:0x909090}));
    sky.rotation.z=.72;sky.rotation.y=1.1;sky.renderOrder=-1;scene.add(sky);

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

    ["Alpha Centauri", "Proxima Centauri", "Deneb", "Altair", "Arcturus", "Capella", "Antares", "Spica", "Procyon", "Fomalhaut"].forEach((name,i)=>{
      FAMOUS_STARS.push({id:name.toLowerCase().replaceAll(' ','-'),name,designation:name,pos:new THREE.Vector3(Math.cos(i*2.4)*33000,Math.sin(i*1.7)*12000,Math.sin(i*2.4)*33000),colorHex:i%3===0?0xffc78b:0xd9e8ff,colorCss:i%3===0?'#ffc78b':'#d9e8ff',spec:'Named star',dist:'Schematic atlas position',desc:'Stellar destination · distances between stars are compressed.'});
    });
    const stellarGlows = [];
    FAMOUS_STARS.forEach(function (st) {
      st.isStar = true;
      const starGroup = new THREE.Group();
      starGroup.position.copy(st.pos);

      const coreMaterial = new THREE.MeshBasicMaterial({color:st.colorHex,map:loadTexture('sun.jpg'),toneMapped:false,fog:false});
      // Solar imagery supplies texture detail; remove its orange tint before
      // applying each star's spectral color so blue-white stars stay blue-white.
      coreMaterial.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
          #ifdef USE_MAP
            vec4 texel = mapTexelToLinear(texture2D(map,vUv));
            float detail = dot(texel.rgb,vec3(0.2126,0.7152,0.0722));
            diffuseColor *= vec4(vec3(0.8+0.2*detail),texel.a);
          #endif
        `);
      };
      const core = new THREE.Mesh(new THREE.SphereGeometry(22, 24, 24),coreMaterial);
      starGroup.add(core);

      const glowTex = createGlowTexture(st.colorCss, "rgba(255,255,255,0)");
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false, fog: false
      }));
      glow.scale.set(200, 200, 1);
      starGroup.add(glow);
      stellarGlows.push({ group: starGroup, glow: glow });

      scene.add(starGroup);
    });

    // --- 5. PLANETARY ASTROPHYSICAL DATA: TRUE DISTANCES & SCALED RADII ---
    // Distances: 1 AU = 175 units.
    // The Sun uses the distance scale (695,700 / 149,597,870.7 AU).
    // Planet radii are intentionally enlarged for visibility; they are not
    // on the same absolute scale as the orbital distances.
    const PLANET_CONFIGS = [
      {
        id: "sun", name: "Sun (Sol)", symbol: "☉", type: "G-Type Main-Sequence Star",
        scaleRadius: 175 * 695700 / 149597870.7, compactRadius: 32.0, radius: 175 * 695700 / 149597870.7,
        realDist: 0, compactDist: 0, dist: 0, speed: 0, realSpeed: 0, texFile: "sun.jpg",
        stats: {
          "Spectral Type": "Yellow Dwarf (G2V)", "Equatorial Radius": "695,700 km (about 109 R⊕)",
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
        scaleRadius: 0.92, compactRadius: 7.0, radius: 0.92,
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
        scaleRadius: 2.28, compactRadius: 10.0, radius: 2.28,
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
        scaleRadius: 2.40, compactRadius: 10.5, radius: 2.40,
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
        scaleRadius: 1.28, compactRadius: 8.5, radius: 1.28,
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
        scaleRadius: 26.34, compactRadius: 25.0, radius: 26.34,
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
        scaleRadius: 21.94, compactRadius: 21.0, radius: 21.94,
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
        scaleRadius: 9.55, compactRadius: 15.0, radius: 9.55,
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
        scaleRadius: 9.28, compactRadius: 14.5, radius: 9.28,
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

    // Mean radii in km: JPL SSD satellite physical parameters.
    // Local orbits remain circular illustrations, with approximate orbital radii.
    const kmToScene = 175 / 149597870.7;
    const moonData = {
      earth: [['The Moon (Luna)',1737.4,384400]],
      mars: [['Phobos',11.08,9376],['Deimos',6.2,23458]],
      jupiter: [['Io',1821.49,421700],['Europa',1560.8,671100],['Ganymede',2631.2,1070400],['Callisto',2410.3,1882700]],
      saturn: [['Titan',2574.76,1221870],['Enceladus',252.1,238000],['Rhea',763.5,527000],['Iapetus',734.3,3560000]],
      uranus: [['Titania',788.9,436000],['Oberon',761.4,584000],['Ariel',578.9,191000],['Umbriel',584.7,266000],['Miranda',235.8,130000]],
      neptune: [['Triton',1352.6,355000],['Nereid',170,5510000]]
    };
    PLANET_CONFIGS.forEach(planet => {
      planet.moons = (moonData[planet.id] || []).map(([name,radius,distance],i) => ({
        id:name.toLowerCase(),name,scaleRadius:radius*kmToScene,compactRadius:radius*kmToScene,
        radiusKm:radius,dist:distance*kmToScene,speed:0.15/Math.sqrt(i+1),texFile:planet.id === 'earth' ? 'moon.jpg' : null
      }));
    });
    const earthRadiusInUnits = 6371 * kmToScene;
    PLANET_CONFIGS.slice(1).forEach(planet => { planet.scaleRadius *= earthRadiusInUnits / 2.4; });

    // Illustrative surfaces for moons without a dedicated texture asset.
    function moonSurface(cfg) {
      const palettes = { Io:['#c4a35a','#80613a'], Europa:['#c5b9a0','#897d70'], Titan:['#ba8750','#936439'], Enceladus:['#d3d8d5','#a8babd'], Triton:['#b7a99d','#8d7970'], Phobos:['#75665d','#493e3a'], Deimos:['#88786a','#584a43'] };
      const colors = palettes[cfg.name] || ['#99958d','#67635e'];
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
      const ctx = canvas.getContext('2d');
      let seed = Array.from(cfg.name).reduce((n,c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
      const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      ctx.fillStyle = colors[0]; ctx.fillRect(0, 0, 512, 256);
      for (let i = 0; i < 650; i++) {
        const x = random()*512, y = random()*256, r = 1 + random()*14;
        ctx.globalAlpha = .03 + random()*.16; ctx.fillStyle = colors[1];
        ctx.beginPath(); ctx.ellipse(x,y,r,r*(.35+random()*.65),0,0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    }

    // --- 6. SUN & BLINDING PHOTOMETRIC ENGINE ---
    const sunCfg = PLANET_CONFIGS[0];
    const sunGroup = new THREE.Group();
    sunGroup.position.set(0, 0, 0);

    const solarTexture = loadTexture('sun.jpg');
    solarTexture.encoding = THREE.sRGBEncoding;
    const sunMeshMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: solarTexture, toneMapped: false, fog: false });
    const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(sunCfg.scaleRadius, 48, 48), sunMeshMat);
    sunMeshMat.onBeforeCompile = shader => {
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec4 texel=mapTexelToLinear(texture2D(map,vUv));
          float detail=dot(texel.rgb,vec3(0.2126,0.7152,0.0722));
          diffuseColor*=vec4(vec3(0.94+0.06*detail),texel.a);
        #endif
      `);
    };
    sunGroup.add(sunMesh);

    const sunGlowTex = createGlowTexture("rgba(255,255,255,1.0)", "rgba(255,255,255,0)");
    const sunCoreGlare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunGlowTex, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false, fog: false
    }));
    sunCoreGlare.scale.set(sunCfg.scaleRadius * 2.2, sunCfg.scaleRadius * 2.2, 1);
    sunGroup.add(sunCoreGlare);

    const sunOuterGlowTex = createGlowTexture("rgba(255,255,255,0.85)", "rgba(255,255,255,0)");
    const sunOuterCorona = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunOuterGlowTex, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.65, depthWrite: false, toneMapped: false, fog: false
    }));
    sunOuterCorona.scale.set(sunCfg.scaleRadius * 4.8, sunCfg.scaleRadius * 4.8, 1);
    sunGroup.add(sunOuterCorona);


    scene.add(sunGroup);

    const sunLight = new THREE.PointLight(0xffffff, 2.0, 0, 0);
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
      const localPositions = new Float32Array(129 * 3);
      const localGeometry = new THREE.BufferGeometry();
      localGeometry.setAttribute("position", new THREE.BufferAttribute(localPositions, 3));
      const localLine = new THREE.Line(localGeometry, orbitLine.material);
      localLine.frustumCulled = false;
      scene.add(localLine);
      orbitLine.userData.local = { line: localLine, geometry: localGeometry, positions: localPositions };

      const planetGroup = new THREE.Group();
      const bodyGroup = new THREE.Group(); // Subgroup that scales with object size mode

      const pTex = loadTexture(cfg.texFile);
      const pMat = new THREE.MeshStandardMaterial({
        map: pTex,
        roughness: cfg.id === "earth" ? 0.7 : 0.95,
        metalness: 0
      });
      const pMesh = new THREE.Mesh(new THREE.SphereGeometry(cfg.scaleRadius, 40, 40), pMat);
      bodyGroup.add(pMesh);

      let earthClouds = null;
      if (cfg.id === "earth") {
        const cTex = loadTexture(cfg.cloudsFile);
        cTex.encoding = THREE.LinearEncoding; // Grayscale cloud coverage, not surface color.
        const cMat = new THREE.MeshStandardMaterial({
          alphaMap: cTex, color: 0xffffff, transparent: true, opacity: 0.8,
          roughness: 1, metalness: 0, depthWrite: false
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
        const geometry = new THREE.SphereGeometry(mCfg.scaleRadius, 48, 32);
        if (mCfg.name === 'Phobos' || mCfg.name === 'Deimos') {
          // Approximate triaxial proportions and irregular relief, not a shape model.
          const phobos = mCfg.name === 'Phobos';
          const axes = phobos ? [1.25, 0.92, 0.84] : [1.25, 0.98, 0.85];
          const pos = geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i) / mCfg.scaleRadius, y = pos.getY(i) / mCfg.scaleRadius, z = pos.getZ(i) / mCfg.scaleRadius;
            const relief = 1 + .065 * Math.sin(5*x + 2*z)*Math.cos(4*y - z) + .035*Math.sin(9*z + 3*y)*Math.cos(7*x);
            pos.setXYZ(i, x * axes[0] * relief * mCfg.scaleRadius, y * axes[1] * relief * mCfg.scaleRadius, z * axes[2] * relief * mCfg.scaleRadius);
          }
          geometry.computeVertexNormals();
          geometry.computeBoundingSphere();
        }
        const mMesh = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({ map: mCfg.texFile ? loadTexture(mCfg.texFile) : moonSurface(mCfg), roughness: 0.9 })
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
    const astCount = 700;
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
      size: 0.5, vertexColors: true, transparent: true, opacity: 0.10, depthWrite: false
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
      size: 0.5, vertexColors: true, transparent: true, opacity: 0.07, depthWrite: false
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

    const transitPositions=new Float32Array(120*3);
    for(let i=0;i<120;i++){transitPositions[i*3]=(Math.random()-.5)*100;transitPositions[i*3+1]=(Math.random()-.5)*70;transitPositions[i*3+2]=-Math.random()*100-5;}
    const transitGeo=new THREE.BufferGeometry();transitGeo.setAttribute('position',new THREE.BufferAttribute(transitPositions,3));
    const transitMat=new THREE.PointsMaterial({map:softParticleTex,size:.07,color:0xbecbdb,transparent:true,opacity:0,depthWrite:false,fog:false});
    const transitDust=new THREE.Points(transitGeo,transitMat);camera.add(transitDust);scene.add(camera);

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
      .hud-val { color: #e2e8f0; font-weight: 600; min-width: 0; text-align: right; overflow-wrap: anywhere; }

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

      #solar-adaptation {
        position: fixed; inset: 0; z-index: 1000; pointer-events: none;
        background: #fffdf6;
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
      '<div id="solar-adaptation" aria-hidden="true"></div>' +
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
      '';
    document.body.appendChild(hudContainer);

    // --- 12. RUNTIME STATE & CONTROLLER ---
    let simTime = 0;
    let timeScale = 1.0;
    let isOrbitPaused = false;
    let showOrbits = true;
    orbitLinesGroup.visible = true;
    let hudVisible = true;
    let inLabMode = false;
    let isTrueScale = true; // True astronomical distances by default
    let isSizeToScale = true; // True relative physical sizes by default
    let activeSystemView = "inner";

    let targetBody = null;
    let targetStar = null;
    let targetComet = false;
    let targetMoon = null;
    let moonParent = null;

    let cameraDistance = 520; // Begin among the inner planets.
    let cameraPitch = 0.44;
    let cameraYaw = 0.0;
    const curLookAt = new THREE.Vector3(0, 0, 0);
    const targetLookAt = new THREE.Vector3(0, 0, 0);

    const redesign = document.createElement('style');
    redesign.textContent = `#flight-dock,#star-chart-drawer,#hotkey-hint{display:none!important}#telemetry-hud{top:auto;bottom:24px;left:24px;background:#101821;border-radius:6px;backdrop-filter:none;box-shadow:none;max-width:340px}#lab-studio{background:transparent;backdrop-filter:none}.lab-header,.lab-card{background:#101821!important;backdrop-filter:none!important;border-radius:6px!important}body:has(#lab-studio.active) #navigator{display:none}#navigator{position:fixed;left:24px;top:24px;width:min(400px,calc(100vw - 100px));z-index:35;color:#ecf2f7;font:14px 'Helvetica Neue',sans-serif}#navigator input{box-sizing:border-box;width:100%;padding:16px;background:#101821;border:1px solid #40505e;color:white;border-radius:7px;font:inherit}#matches{background:#101821;max-height:50vh;overflow:auto;border-radius:6px;margin-top:6px}#matches button{width:100%;display:flex;align-items:center;gap:16px;text-align:left;padding:12px;border:0;border-bottom:1px solid #293747;background:none;color:white;cursor:pointer}#matches button:hover,#matches button:focus{background:#24374a}#matches img{width:46px;height:46px;border-radius:50%;object-fit:cover}#matches small{display:block;color:#9eafbf;margin-top:5px}#nav-actions{display:flex;gap:8px;margin-top:10px}#nav-actions button{background:#101821;border:1px solid #40505e;color:#d7e5ef;border-radius:5px;padding:10px;cursor:pointer}#nav-brand{font:11px monospace;letter-spacing:3px;margin-bottom:12px;color:#b6c9d8}@media(max-width:600px){#telemetry-hud{max-width:220px;padding:12px;bottom:12px;left:12px}.hud-metric-row{font-size:10px}#navigator{left:12px;top:12px}.lab-card{max-width:65vw!important;max-height:40vh;overflow:auto}}`;
    redesign.textContent += `
      #lab-studio,#dock-btn-lab{display:none!important}
      #navigator{left:32px;top:32px;width:330px;font-family:'Helvetica Neue',sans-serif}
      #nav-brand{font-size:10px;letter-spacing:4px;color:#d1dce3;margin-bottom:20px}
      #navigator input{padding:17px 18px;border:1px solid #ffffff20;background:#0d131beF;border-radius:12px;font-size:13px;box-shadow:0 8px 32px #0005;outline:none}
      #navigator input:focus{border-color:#93b7cc;box-shadow:0 0 0 3px #93b7cc15}
      #matches{padding:6px;background:#101720;border:1px solid #ffffff18;border-radius:12px;max-height:calc(100vh - 270px);box-shadow:0 20px 60px #0008}
      #matches button{padding:12px 10px;border:0;border-radius:8px;gap:14px;font-size:13px;transition:background .15s}
      #matches img{width:44px;height:44px;box-shadow:inset -8px 0 12px #0008}
      #matches small{font-size:10px;letter-spacing:.3px;line-height:1.5}
      #matches button:not(:has(img)):before{content:'✦';display:grid;place-items:center;width:44px;height:44px;flex-shrink:0;color:#e5d4b0;background:#1b2634;border-radius:50%;font-size:25px}
      #nav-actions{gap:16px;margin:16px 4px}#nav-actions button{padding:0;border:0;background:none;color:#94a8b8;font-size:11px}#nav-actions button:hover{color:white}
      #telemetry-hud{left:36px;bottom:36px;top:auto;min-width:0;width:290px;background:none!important;border:0!important;box-shadow:none!important;padding:0;border-radius:0;pointer-events:none}
      .hud-title{font-size:9px;color:#8fa4b6;letter-spacing:3px;margin-bottom:12px}.hud-target{font-size:26px;font-weight:400;letter-spacing:-.7px}.hud-metrics{margin-top:18px;gap:10px}.hud-metric-row{font:11px 'Helvetica Neue',sans-serif;gap:20px;line-height:1.6}.hud-label{color:#8195a6}.hud-val{font-weight:400;text-align:right;color:#cbd7df}.hud-metric-row:nth-child(2),.hud-metric-row:nth-child(5),.hud-metric-row:nth-child(6){display:none}
      #hover-tooltip{background:#101720;border:1px solid #ffffff25;border-radius:6px;box-shadow:none;font:11px 'Helvetica Neue',sans-serif}
      @media(max-width:600px){#navigator{left:20px;top:24px;width:calc(100vw - 90px)}#telemetry-hud{left:24px;bottom:28px;width:240px}.hud-target{font-size:23px}#matches{max-height:45vh}}
    `;
    redesign.textContent += `#navigator{left:auto!important;right:32px}#search-key{position:absolute;right:12px;top:51px;color:#8298aa;font:10px monospace;pointer-events:none}#navigator input{padding-right:75px}#nav-actions{flex-wrap:wrap}#matches{overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch}#matches[hidden],#close-search[hidden]{display:none!important}#close-search{display:block;margin:6px 0 0 auto;padding:7px 12px;border:1px solid #40505e;border-radius:7px;background:#101821;color:#e2e8f0;cursor:pointer}#image-credit{position:fixed;bottom:14px;right:24px;color:#7890a1;font:9px monospace;max-width:45vw;text-align:right;pointer-events:none}@media(max-width:600px){#navigator{right:20px}#image-credit{font-size:8px;max-width:40vw}}`;
    document.head.append(redesign);
    const nav=document.createElement('div');nav.id='navigator';nav.innerHTML='<button id="search-toggle" aria-label="Search destinations" aria-expanded="false" title="Search (⌘K)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></button><div id="search-panel" hidden><input aria-label="Search destinations" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="matches" placeholder="Find a planet, moon or star" autocomplete="off"><button id="close-search" type="button" aria-label="Close search">×</button><div id="matches" role="listbox" aria-label="Destinations" hidden></div><div id="search-hint">↑ ↓ Navigate <span>↵ Select</span> <span>esc Close</span></div><div id="nav-actions"><button id="nav-home">Solar system</button><button id="nav-audio">Sound on</button><button id="nav-orbits" aria-pressed="true">Hide orbits</button></div></div>';
    document.body.append(nav);
    const search=nav.querySelector('input'),matches=nav.querySelector('#matches'),closeSearch=nav.querySelector('#close-search');
    const searchPanel=nav.querySelector('#search-panel'),searchToggle=nav.querySelector('#search-toggle');
    function openSearch(){search.value='';searchPanel.hidden=false;searchToggle.hidden=true;searchToggle.setAttribute('aria-expanded','true');search.focus();showSearch();}
    searchToggle.onclick=openSearch;
    function hideSearch(){search.removeAttribute('aria-activedescendant');matches.hidden=true;searchPanel.hidden=true;searchToggle.hidden=false;searchToggle.setAttribute('aria-expanded','false');search.setAttribute('aria-expanded','false');}
    const controls=document.createElement('div'); controls.id='camera-controls';
    controls.innerHTML='<button id="camera-orbit" title="Rotate: drag" aria-label="Rotate camera" aria-pressed="true">↻</button><button id="camera-pan" title="Pan: Shift-drag or Shift-scroll" aria-label="Pan camera" aria-pressed="false">✥</button><button id="time-toggle" title="Pause time (Space)" aria-label="Pause time" aria-pressed="false">Ⅱ</button>';
    document.body.append(controls);
    ['orbit','pan'].forEach(mode=>controls.querySelector('#camera-'+mode).onclick=()=>{navigationMode=mode;['orbit','pan'].forEach(m=>controls.querySelector('#camera-'+m).setAttribute('aria-pressed',String(m===mode)));});
    redesign.textContent += `#telemetry-hud{top:24px!important;bottom:auto!important;left:24px!important;max-width:min(300px,55vw);max-height:45vh;overflow:auto}#navigator{top:24px!important;right:24px!important;width:auto!important;max-width:calc(100vw - 48px)}#search-panel{width:min(330px,calc(100vw - 48px));position:relative}#search-panel[hidden],#search-toggle[hidden]{display:none!important}#search-panel input{padding-right:44px}#search-toggle,#camera-controls button{width:42px;height:42px;border:1px solid #ffffff30;background:#101821;color:#e4edf5;border-radius:9px;cursor:pointer;display:grid;place-items:center}#search-toggle:hover,#camera-controls button:hover{background:#263645}#close-search{position:absolute;top:5px;right:5px;margin:0;border:0;background:transparent;font-size:22px}#camera-controls{position:fixed;bottom:24px;right:24px;display:flex;gap:6px;z-index:40}#camera-controls button{font-size:23px}#camera-controls button[aria-pressed=true]{border-color:#d5e7f5;background:#354a5a}#image-credit,#nav-brand,#search-key,.hud-title{display:none!important}`;
    redesign.textContent += `#matches button[aria-selected=true]{background:#263d50;box-shadow:inset 3px 0 #a5d6e8}#matches button:focus-visible,#search-toggle:focus-visible,#close-search:focus-visible,#nav-actions button:focus-visible{outline:2px solid #a5d6e8;outline-offset:2px}#search-hint{display:flex;gap:14px;padding:9px 5px 0;color:#91a6b7;font:10px monospace}#search-hint span:last-child{margin-left:auto}.search-empty{padding:18px 12px;color:#aebfcb;font-size:12px;line-height:1.5}#matches{max-height:min(50vh,440px)}#matches button span{min-width:0}#matches button small{overflow-wrap:anywhere}`;
    closeSearch.onclick=()=>{hideSearch();searchToggle.focus();};
    document.addEventListener('pointerdown',e=>{if(!nav.contains(e.target))hideSearch();});
    nav.addEventListener('keydown',e=>{if(e.key==='Escape'){hideSearch();searchToggle.focus();e.stopPropagation();}});
    document.getElementById('nav-audio').onclick=e=>{soundEnabled=!soundEnabled;e.target.textContent=soundEnabled?'Sound on':'Sound off';if(soundEnabled)playTone(440,.2);};
    window.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'||e.key==='/'&&!e.target.matches?.('input,textarea')){e.preventDefault();openSearch();search.select();}});


    const scaleControl=document.createElement('div');
    scaleControl.id='scale-control';
    scaleControl.innerHTML='<div role="group" aria-label="Solar system scale"><button type="button" data-scale="true" aria-pressed="true">True Scale</button><button type="button" data-scale="illustrated" aria-pressed="false">Illustrated View</button></div><p id="scale-description">Proportional sizes and distances · original orbital motion</p>';
    document.body.append(scaleControl);
    redesign.textContent += `#scale-control{position:fixed;left:24px;bottom:24px;z-index:40;max-width:calc(100vw - 48px);font:11px 'Helvetica Neue',sans-serif;color:#aebdca}#scale-control>div{display:flex;gap:4px;padding:4px;background:#101821;border:1px solid #ffffff30;border-radius:10px;width:fit-content}#scale-control button{background:transparent;color:#aebdca;border:0;border-radius:6px;padding:10px 14px;font:inherit;cursor:pointer}#scale-control button[aria-pressed=true]{background:#354a5a;color:#f0f5f8}#scale-control p{margin:8px 0 0;max-width:310px;line-height:1.5}@media(max-width:600px){#scale-control{left:12px;bottom:78px}#scale-control p{max-width:270px}}`;
    scaleControl.querySelectorAll('button').forEach(button=>button.onclick=()=>setScaleMode(button.dataset.scale==='true'));

    const catalog=PLANET_CONFIGS.map(cfg=>({name:cfg.name,detail:cfg.type,texture:cfg.texFile,go:()=>flyToPlanet(cfg.id)}));
    celestialMeshes.forEach(body=>body.moonMeshes.forEach(moon=>catalog.push({name:moon.config.name,detail:'Moon of '+body.config.name+' · illustrative orbit',go:()=>flyToMoon(body,moon)})));
    FAMOUS_STARS.forEach(st=>catalog.push({name:st.name,detail:st.spec+' · '+st.dist,go:()=>flyToStar(st)}));
    [['Pluto',6900,.6,0xbda997],['Ceres',490,.5,0x99938b],['Eris',11500,.6,0xddd9d1],['Makemake',8000,.5,0xb9937e],['Haumea',7600,.5,0xcfcac2]].forEach(([name,d,r,color],i)=>{
      const position=new THREE.Vector3(Math.cos(i*1.7)*d,Math.sin(i)*d*.1,Math.sin(i*1.7)*d);
      const body=new THREE.Mesh(new THREE.SphereGeometry(r,32,24),new THREE.MeshStandardMaterial({color,roughness:1,map:loadTexture('moon.jpg')}));body.position.copy(position);scene.add(body);
      const destination={name,pos:position,spec:name==='Ceres'?'Dwarf planet · asteroid belt':'Dwarf planet',dist:'Schematic orbit',desc:'Illustrative surface; not a photographic map of this object.'};
      catalog.push({name,detail:destination.spec,go:()=>{flyToStar(destination);cameraDistance=5;}});
    });
    const spacecraft = [];
    [['Voyager 1', 22000, 0.3], ['Voyager 2', 20000, 2.1], ['Parker Solar Probe', 45, 4.2]].forEach(([name, distance, angle]) => {
      const group = new THREE.Group();
      const metal=new THREE.MeshBasicMaterial({color:0xabb2b7});
      const white=new THREE.MeshBasicMaterial({color:0xe3e2db,side:THREE.DoubleSide});
      const dark=new THREE.MeshBasicMaterial({color:0x24364a,side:THREE.DoubleSide});
      function part(geometry,material,x,y,z){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);group.add(mesh);return mesh;}
      if(name==='Parker Solar Probe'){
        // Recognizable heat shield, instrument bus, and paired solar arrays.
        const shield=part(new THREE.CylinderGeometry(.78,.78,.12,32),white,0,0,.6);shield.rotation.x=Math.PI/2;
        part(new THREE.BoxGeometry(.7,.55,.65),metal,0,0,0);
        [-1,1].forEach(side=>{const panel=part(new THREE.BoxGeometry(.85,.04,.45),dark,side*.75,0,-.1);panel.rotation.z=side*.16;});
        part(new THREE.CylinderGeometry(.018,.018,1.1,8),metal,0,.65,0);
      } else {
        // Voyager 1 and 2 share the same spacecraft design: dish and long booms.
        part(new THREE.CylinderGeometry(.42,.42,.35,8),metal,0,0,0);
        const dish=part(new THREE.ConeGeometry(.8,.35,32,1,true),white,0,0,.35);dish.rotation.x=Math.PI/2;
        const boom=part(new THREE.CylinderGeometry(.018,.018,1.8,8),metal,1,0,0);boom.rotation.z=Math.PI/2;
        part(new THREE.CylinderGeometry(.11,.11,.35,10),metal,1.8,0,0).rotation.z=Math.PI/2;
        const aerial=part(new THREE.CylinderGeometry(.009,.009,2.2,6),metal,-.3,1.05,0);aerial.rotation.z=.3;
      }
      // The atlas positions are schematic. Show an enlarged model only while
      // selected; otherwise this toy-sized proxy overwhelms real-scale planets.
      group.visible=false;
      group.position.set(Math.cos(angle)*distance, distance * 0.06, Math.sin(angle)*distance); scene.add(group);
      const destination = {name, pos:group.position, spec:'Spacecraft', dist:'Schematic position', desc:'Enlarged illustrative model and schematic position; not live tracking.'};
      spacecraft.push({group, destination});
      catalog.push({name, detail:'Spacecraft · schematic position', go:()=>{flyToStar(destination);cameraDistance=6;}});
    });
    catalog.push({name:'Milky Way · Galactic panorama',detail:'Our galaxy · ESO photographic sky',texture:'milky-way.jpg',go:()=>{flyToSystemOverview();cameraPitch=.2;cameraYaw=1.8;}});
    catalog.push({name:"Halley’s comet",detail:'Comet · 1P/Halley',go:flyToComet});
    let searchResults=[], activeResult=-1;
    function setActiveResult(index){
      if(!searchResults.length)return;
      activeResult=(index+searchResults.length)%searchResults.length;
      const options=matches.querySelectorAll('[role="option"]');
      options.forEach((option,i)=>option.setAttribute('aria-selected',String(i===activeResult)));
      const active=options[activeResult];
      search.setAttribute('aria-activedescendant',active.id);
      active.scrollIntoView({block:'nearest'});
    }
    function selectResult(index){if(!searchResults[index])return;searchResults[index].go();hideSearch();searchToggle.focus();}
    function showSearch(){
      matches.replaceChildren();matches.hidden=false;search.setAttribute('aria-expanded','true');
      const query=search.value.trim().toLowerCase();
      searchResults=catalog.filter(c=>(c.name+' '+c.detail).toLowerCase().includes(query));
      activeResult=-1;search.removeAttribute('aria-activedescendant');
      if(!searchResults.length){const empty=document.createElement('p');empty.className='search-empty';empty.textContent='No destinations found. Try another search.';matches.append(empty);return;}
      searchResults.forEach((c,i)=>{
        const button=document.createElement('button');button.type='button';button.id='destination-option-'+i;button.setAttribute('role','option');button.setAttribute('aria-selected','false');button.tabIndex=-1;
        if(c.texture){const img=document.createElement('img');img.src=TEXTURE_LOCAL+c.texture;img.alt='';button.append(img);}
        const label=document.createElement('span');label.textContent=c.name;const small=document.createElement('small');small.textContent=c.detail;label.append(small);button.append(label);
        button.onpointermove=()=>{if(activeResult!==i)setActiveResult(i);};button.onclick=()=>selectResult(i);matches.append(button);
      });
    }
    search.oninput=showSearch;search.onfocus=()=>{if(matches.hidden)showSearch();};
    search.onkeydown=e=>{
      if(e.key!=='Escape')e.stopPropagation();
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setActiveResult(activeResult<0?(e.key==='ArrowDown'?0:searchResults.length-1):activeResult+(e.key==='ArrowDown'?1:-1));}
      else if(e.key==='Enter'){e.preventDefault();selectResult(activeResult<0?0:activeResult);}
    };
    document.getElementById('nav-home').onclick=flyToSystemOverview;
    function toggleTime() {
      isOrbitPaused=!isOrbitPaused;
      const button=controls.querySelector('#time-toggle');
      button.textContent=isOrbitPaused?'▶':'Ⅱ';
      button.setAttribute('aria-pressed',String(isOrbitPaused));
      button.setAttribute('aria-label',isOrbitPaused?'Play time':'Pause time');
      button.title=(isOrbitPaused?'Play':'Pause')+' time (Space)';
    }
    controls.querySelector('#time-toggle').onclick=toggleTime;
    document.getElementById('nav-orbits').onclick=e=>{showOrbits=!showOrbits;e.target.textContent=showOrbits?'Hide orbits':'Show orbits';e.target.setAttribute('aria-pressed',String(showOrbits));};

    const freeFocus=new THREE.Vector3(); let freeFlight=false, orbitGesture=false;
    const panOffset = new THREE.Vector3();
    let navigationMode = 'orbit';
    let travel = null;
    const orbitOffset=new THREE.Vector3();
    const lookMatrix=new THREE.Matrix4();
    const flightQuaternion=new THREE.Quaternion();
    const renderPan=new THREE.Vector3();
    const smoothStep=t=>t*t*t*(t*(t*6-15)+10);
    function beginTravel() {
      pendingStar=null;adaptationStart=-Infinity;
      panOffset.set(0,0,0);
      travel = { start: camera.position.clone(), look: curLookAt.clone(), rotation:camera.quaternion.clone(), age: 0, duration: null, phase:'aim' };
      renderPan.set(0,0,0);
    }
    function interruptTravel() {
      if(!travel)return;
      // Rebase the controller at the actual in-flight pose, not its destination.
      const offset=camera.position.clone().sub(curLookAt);
      cameraDistance=Math.max(.00005,offset.length());
      cameraYaw=Math.atan2(offset.x,offset.z);
      cameraPitch=Math.asin(THREE.MathUtils.clamp(offset.y/cameraDistance,-1,1));
      freeFocus.copy(curLookAt);freeFlight=true;
      panOffset.set(0,0,0);renderPan.set(0,0,0);
      orbitOffset.copy(offset);travel=null;pendingStar=null;
    }
    function panView(dx, dy) {
      const scale = 2 * cameraDistance * Math.tan(camera.fov * Math.PI / 360) / innerHeight;
      const offset = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).multiplyScalar(-dx*scale)
        .addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1),dy*scale);
      if (!freeFlight && (targetBody || targetStar || targetComet)) {
        panOffset.add(offset).clampLength(0, cameraDistance * 0.45);
      } else {
        if (!freeFlight) freeFocus.copy(curLookAt);
        freeFlight=true; freeFocus.add(offset);
      }
    }
    function focusRadius() {
      return freeFlight ? 0 : targetBody ? targetBody.config.scaleRadius*(targetBody.currentSizeScale||1)*(targetBody.config.hasRings?2.35:1) : targetMoon ? targetMoon.config.scaleRadius : targetComet ? .4 : targetStar?.isStar ? 22 : targetStar ? 1 : 0;
    }
    function zoomView(delta, x=innerWidth/2, y=innerHeight/2) {
      const oldDistance=cameraDistance;
      const radius=focusRadius();
      cameraDistance = Math.max(Math.max(.00005,radius*2.5), Math.min(100000,cameraDistance*Math.exp(delta*.003)));
      if (!targetMoon) {
        const scale = 2*(oldDistance-cameraDistance)*Math.tan(camera.fov*Math.PI/360)/innerHeight;
        const offset = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).multiplyScalar((x-innerWidth/2)*scale)
          .addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1),-(y-innerHeight/2)*scale);
        if(!freeFlight&&(targetBody||targetStar||targetComet))panOffset.add(offset).clampLength(0,cameraDistance*.45);
        else {if(!freeFlight)freeFocus.copy(curLookAt);freeFlight=true;freeFocus.add(offset);}
      }
    }


    // --- 13. SCALE MODE TOGGLES ---
    function updateHudScaleText() {
      const hudScaleEl=document.getElementById('hud-val-scale');
      if(hudScaleEl) hudScaleEl.textContent=isTrueScale?'True Scale':'Illustrated View · exaggerated sizes, spacing and motion';
    }

    function setScaleMode(trueScale) {
      if(isTrueScale===trueScale && isSizeToScale===trueScale)return;
      isTrueScale=trueScale;
      isSizeToScale=trueScale;
      celestialMeshes.forEach(item=>{
        item.targetDist=trueScale?item.config.realDist:item.config.compactDist;
        // Illustrated periods run from about 24 to 70 seconds. This deliberately
        // compresses orbital time differences, rather than implying Kepler scaling.
        item.speedMult=trueScale?item.config.realSpeed:Math.sqrt(item.config.speed)*1.4;
        item.targetSizeScale=trueScale?1:item.config.compactRadius/item.config.scaleRadius;
      });
      astTargetScale=trueScale?1:297.5/472.5;
      kbTargetScale=trueScale?1:835/7000;
      cometTargetA=trueScale?3121:280;
      scaleControl.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String((button.dataset.scale==='true')===trueScale)));
      document.getElementById('scale-description').textContent=trueScale?'Proportional sizes and distances · original orbital motion':'Enlarged planets · compressed orbits · accelerated outer planets';
      updateHudScaleText();
      // Reframe the complete system so the new spacing is immediately useful.
      // Explicitly return to the existing inner-system view for True Scale.
      if(trueScale)flyToInnerSystem();else flyToSystemOverview();
    }
    function toggleDistanceScale(){setScaleMode(!isTrueScale);}
    function toggleSizeScale(){setScaleMode(!isTrueScale);}

    // --- 14. FLIGHT TRANSITIONS & INTERACTION ---
    function flyToPlanet(id) {
      beginTravel();
      targetMoon = null;
      moonParent = null;
      freeFlight=false;
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
        cameraDistance = Math.max(0.002, curR * 4.2);
        cameraPitch = 0.22;
        const curAngle = Math.atan2(match.group.position.x, match.group.position.z);
        cameraYaw = curAngle + 0.35;
      }

      updateDockActive(id);
    }

    function illustratedOverviewDistance(){return 2100*Math.max(1,0.9/camera.aspect);}

    function flyToSystemOverview() {
      beginTravel();
      targetMoon = null;
      moonParent = null;
      freeFlight=false;
      if (inLabMode) exitLabMode();
      playWarpSound();
      targetBody = null;
      targetStar = null;
      targetComet = false;
      activeSystemView = "system";
      cameraDistance = isTrueScale ? 7800 : illustratedOverviewDistance();
      cameraPitch = 0.52;
      updateDockActive("system");
    }

    function flyToInnerSystem() {
      beginTravel();
      targetMoon = null;
      moonParent = null;
      freeFlight = false;
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
      beginTravel();
      targetMoon = null;
      moonParent = null;
      freeFlight = false;
      if (inLabMode) exitLabMode();
      playWarpSound();
      targetBody = null;
      targetStar = null;
      targetComet = true;
      cameraDistance = 8;
      cameraPitch = 0.22;
      const angle = Math.atan2(cometGroup.position.x, cometGroup.position.z);
      cameraYaw = angle + Math.PI * 0.4;
      updateDockActive("comet");
    }

    function flyToStar(st) {
      beginTravel();
      targetMoon = null;
      moonParent = null;
      freeFlight=false;
      if (inLabMode) exitLabMode();
      playWarpSound();
      targetStar = st;
      targetBody = null;
      targetComet = false;
      cameraDistance = st.galaxy ? 10500 : 240;
      cameraPitch = 0.15;
      cameraYaw = 0.0;
      if (st.isStar) { pendingStar = st; adaptationStart=-Infinity; }
      else pendingStar = null;
      document.getElementById("star-chart-drawer").style.display = "none";
      updateDockActive("stars");
    }

    function flyToMoon(body, moon) {
      beginTravel();
      freeFlight = false;
      targetBody = null;
      targetComet = false;
      targetMoon = moon;
      moonParent = body;
      targetStar = { name: moon.config.name, pos: new THREE.Vector3(), spec: 'Moon of ' + body.config.name, dist: 'Circular orbit approximation', desc: 'Mean radius: ' + moon.config.radiusKm + ' km · ' + (moon.config.texFile ? 'surface map.' : 'illustrative surface.') };
      moon.mesh.getWorldPosition(targetStar.pos);
      cameraDistance = Math.max(0.002, moon.config.scaleRadius * 4.2);
      cameraPitch = 0.22;
      cameraYaw = Math.atan2(moon.mesh.position.x, moon.mesh.position.z) + 0.35;
    }

    function enterLabMode() {} // Interior inspection has been removed.
    function exitLabMode() {}

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
      toggleTime();
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
      if (e.target.closest?.("input,button")) return;
      if (e.code === "Space") {
        e.preventDefault();
        toggleTime();
      } else if (e.code === "KeyS" && e.shiftKey) {
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
        const orbitControl = document.getElementById('nav-orbits');
        orbitControl.textContent = showOrbits ? 'Hide orbits' : 'Show orbits';
        orbitControl.setAttribute('aria-pressed', String(showOrbits));
      } else if (e.code.startsWith('Arrow')) {
        e.preventDefault();
        if (e.code === 'ArrowLeft') cameraYaw += 0.1;
        if (e.code === 'ArrowRight') cameraYaw -= 0.1;
        if (e.code === 'ArrowUp') cameraPitch = Math.min(Math.PI * 0.48, cameraPitch + 0.1);
        if (e.code === 'ArrowDown') cameraPitch = Math.max(-Math.PI * 0.48, cameraPitch - 0.1);
      } else if (['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE'].includes(e.code)) {
        e.preventDefault();
        if (!freeFlight) freeFocus.copy(curLookAt);
        freeFlight = true;
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
        const forward = camera.getWorldDirection(new THREE.Vector3());
        const step = Math.max(0.5, cameraDistance * 0.08);
        if (e.code === 'KeyW') freeFocus.addScaledVector(forward, step);
        if (e.code === 'KeyS') freeFocus.addScaledVector(forward, -step);
        if (e.code === 'KeyA') freeFocus.addScaledVector(right, -step);
        if (e.code === 'KeyD') freeFocus.addScaledVector(right, step);
        if (e.code === 'KeyQ') freeFocus.addScaledVector(up, step);
        if (e.code === 'KeyE') freeFocus.addScaledVector(up, -step);
      } else if (e.code === "KeyH") {
        hudVisible = !hudVisible;
        const op = hudVisible ? "1" : "0";
        document.getElementById("telemetry-hud").style.opacity = op;
        document.getElementById("flight-dock").style.opacity = op;
        document.getElementById("hotkey-hint").style.opacity = op;
      }
    });

    // --- 16. DIRECT VIEWPORT CLICK & ORBIT CONTROLS WITH PROXIMITY HIT ---
    window.addEventListener("contextmenu",e=>e.preventDefault());
    let isDragging = false;
    let dragTravel = 0;
    let lastHoverCheck = 0;
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
      if (e.target.closest("#navigator, #scale-control, #camera-controls, #flight-dock, #telemetry-hud, #star-chart-drawer, #lab-studio")) return;
      isDragging = true; dragTravel = 0; orbitGesture=!(e.shiftKey || e.button===1 || navigationMode==='pan');
      interruptTravel();
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    });

    window.addEventListener("pointermove", function (e) {
      if (isDragging) {
        const dx = e.clientX - prevMouseX;
        const dy = e.clientY - prevMouseY;
        dragTravel += Math.hypot(dx,dy);
        if(!inLabMode&&!orbitGesture){
          panView(dx,dy);
        } else {
        cameraYaw -= dx * 0.005;
        cameraPitch = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, cameraPitch + dy * 0.005));
        }
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
      }

      if (!inLabMode && !isDragging) {
        if(performance.now()-lastHoverCheck<70)return;
        lastHoverCheck=performance.now();
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
      if (isDragging || dragTravel >= 5) return;
      if (e.target.closest("#navigator, #scale-control, #camera-controls, #flight-dock, #telemetry-hud, #star-chart-drawer, #lab-studio")) return;

      const matched = findHoveredOrClickedPlanet(e.clientX, e.clientY);
      if (matched) {
        flyToPlanet(matched.config.id);
        return;
      }
      // Screen-space targets remain usable for tiny, distant bodies on touch.
      const candidates = [];
      celestialMeshes.forEach(body => body.moonMeshes.forEach(moon => candidates.push({ position: moon.mesh.getWorldPosition(new THREE.Vector3()), go: () => flyToMoon(body, moon) })));
      FAMOUS_STARS.forEach(star => candidates.push({position:star.pos, go:()=>flyToStar(star)}));
      spacecraft.forEach(craft => candidates.push({position:craft.group.position, go:()=>{flyToStar(craft.destination);cameraDistance=6;}}));
      candidates.push({position:cometGroup.position,go:flyToComet});
      let closest = 24, selected = null;
      candidates.forEach(candidate => {
        const p = candidate.position.clone().project(camera);
        if (p.z < -1 || p.z > 1) return;
        const distance = Math.hypot((p.x + 1) * innerWidth / 2 - e.clientX, (1 - p.y) * innerHeight / 2 - e.clientY);
        if (distance < closest) { closest = distance; selected = candidate; }
      });
      if (selected) selected.go();
    });

    window.addEventListener("wheel", function (e) {
      if (e.target.closest('#navigator, #telemetry-hud, #camera-controls')) return;
      e.preventDefault(); interruptTravel();
      if (e.shiftKey) {
        panView(e.deltaX, e.deltaY);
      } else {
        zoomView(e.deltaY * (e.ctrlKey ? 3 : e.deltaMode ? 12 : 1), e.clientX, e.clientY);
      }
    }, { passive: false });

    window.addEventListener("resize", function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      if(!isTrueScale && activeSystemView==='system' && !targetBody && !targetStar && !targetComet && !freeFlight)cameraDistance=illustratedOverviewDistance();
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // --- 17. ANIMATION & EYE ADAPTATION LOOP ---
    const clock = new THREE.Clock();
    let adaptationStart = performance.now();
    const adaptationOverlay = document.getElementById("solar-adaptation");
    const projectedSun = new THREE.Vector3();
    const adaptedStars = new Set(['sun']);
    let pendingStar = null;
    let adaptationSource = {position:sunGroup.position, color:'#fffdf5'};
    let travelProgress = 0;
    const brightSources = [{ position:sunGroup.position, radius:sunCfg.scaleRadius, id:'sun' }];
    stellarGlows.forEach(star=>brightSources.push({position:star.group.position,radius:22,id:star.group.uuid}));
    const sourceOffset = new THREE.Vector3();
    const moonMarkers = ['moon','parent'].map(() => {
      const label=document.createElement('div');
      label.style.cssText='position:fixed;z-index:18;pointer-events:none;color:#cbd7df;font:11px sans-serif;transform:translate(10px,-15px);display:none;text-shadow:0 1px 3px #000';
      document.body.append(label);return label;
    });
    const markerPoint=new THREE.Vector3();
    let telemetryAge = 0;
    const telemetryRows = Array.from(document.querySelectorAll('.hud-metric-row'));
    const telemetryFields = ['name','radius','vol','dist','speed','flux'].map(key=>document.getElementById(key==='name'?'hud-target-name':'hud-val-'+key));

    function animate() {
      requestAnimationFrame(animate);
      const dt = Math.min(0.1, clock.getDelta());
      orbitLinesGroup.visible = true;
      celestialMeshes.forEach(item => { item.orbitLine.visible = showOrbits || targetBody === item; });
      cometOrbitLine.visible = false;

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
      sunMesh.scale.setScalar(THREE.MathUtils.lerp(sunMesh.scale.x,sunTargetScale,1-Math.exp(-dt*4)));
      sunMesh.rotation.y += dt * 0.025;

      celestialMeshes.forEach(item=>{
        item.currentDist=THREE.MathUtils.lerp(item.currentDist,item.targetDist,1-Math.exp(-dt*3.5));
        item.orbitLine.scale.set(item.currentDist,1,item.currentDist);
        item.group.position.set(Math.cos(item.angle)*item.currentDist,0,Math.sin(item.angle)*item.currentDist);
        item.moonMeshes.forEach((moon,i)=>{
          const displayDist=isSizeToScale?moon.config.dist:Math.max(moon.config.dist,(item.config.compactRadius*3)+(i*item.config.compactRadius*.7));
          moon.mesh.position.set(Math.cos(moon.angle)*displayDist,0,Math.sin(moon.angle)*displayDist);
        });
      });
      if (!isOrbitPaused) {
        simTime += dt * timeScale;

        celestialMeshes.forEach(function (item) {
          // Smoothly animate orbital distance between True Scale and Compact
          item.angle += dt * 0.15 * item.speedMult * timeScale;
          const px = Math.cos(item.angle) * item.currentDist;
          const pz = Math.sin(item.angle) * item.currentDist;
          item.group.position.set(px, 0, pz);

          item.mesh.rotation.y += dt * 0.5;
          if (item.earthClouds) item.earthClouds.rotation.y += dt * 0.65;

          item.moonMeshes.forEach(function (m) {
            m.angle += dt * 0.8 * m.config.speed * timeScale;
            const displayDist=isSizeToScale?m.config.dist:Math.max(m.config.dist,item.config.compactRadius*3+item.moonMeshes.indexOf(m)*item.config.compactRadius*.7);
            m.mesh.position.set(Math.cos(m.angle)*displayDist,0,Math.sin(m.angle)*displayDist);
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
      if(freeFlight&&!inLabMode){targetLookAt.copy(freeFocus);
      } else if (inLabMode) {
        targetLookAt.set(-14, 0, 0);
      } else if (targetStar) {
        if (targetMoon) { moonParent.group.updateWorldMatrix(true,true); targetMoon.mesh.getWorldPosition(targetStar.pos); }
        targetLookAt.copy(targetStar.pos);
      } else if (targetComet) {
        targetLookAt.copy(cometGroup.position);
      } else if (targetBody) {
        targetLookAt.copy(targetBody.group.position);
      } else {
        targetLookAt.set(0, 0, 0);
      }

      if (travel && targetBody && targetBody.config.id !== 'sun') cameraYaw = Math.atan2(targetBody.group.position.x,targetBody.group.position.z) + 0.35;
      const response=1-Math.exp(-dt*14);
      renderPan.lerp(panOffset,response);
      const desiredLook = targetLookAt.clone().add(renderPan);
      const desiredOffset = new THREE.Vector3(
        cameraDistance*Math.cos(cameraPitch)*Math.sin(cameraYaw),
        cameraDistance*Math.sin(cameraPitch),cameraDistance*Math.cos(cameraPitch)*Math.cos(cameraYaw));
      const destinationEye=desiredLook.clone().add(desiredOffset);
      if(travel) {
        travel.age+=dt;
        if(travel.phase==='aim') {
          const t=Math.min(1,travel.age/1.15);
          camera.position.copy(travel.start);
          lookMatrix.lookAt(camera.position,desiredLook,camera.up);
          flightQuaternion.setFromRotationMatrix(lookMatrix);
          camera.quaternion.slerpQuaternions(travel.rotation,flightQuaternion,smoothStep(t));
          // Keep a valid controller look point along the interpolated direction.
          curLookAt.copy(camera.position).addScaledVector(camera.getWorldDirection(new THREE.Vector3()),camera.position.distanceTo(desiredLook));
          travelProgress=0;
          if(t===1){travel.phase='move';travel.age=0;}
        } else {
          if(travel.duration===null)travel.duration=Math.min(9,1.5+Math.log1p(travel.start.distanceTo(destinationEye)/100)*1.05);
          const t=Math.min(1,travel.age/travel.duration),eased=smoothStep(t);
          travelProgress=t;
          if (targetBody && targetBody.config.id !== 'sun') {
            // Approach around the planet, rather than crossing through it on a
            // straight line and revealing the opposite hemisphere in one frame.
            const from = travel.start.clone().sub(desiredLook);
            const startDistance = from.length();
            if (startDistance > 0.000001) {
              const direction = from.normalize();
              const endDirection = desiredOffset.clone().normalize();
              const arc = new THREE.Quaternion().setFromUnitVectors(direction, endDirection);
              direction.applyQuaternion(new THREE.Quaternion().slerp(arc, eased));
              const distance = THREE.MathUtils.lerp(startDistance, cameraDistance, eased);
              camera.position.copy(desiredLook).addScaledVector(direction, distance);
            } else {
              camera.position.lerpVectors(travel.start, destinationEye, eased);
            }
          } else {
            camera.position.lerpVectors(travel.start,destinationEye,eased);
          }
          curLookAt.copy(desiredLook);
          if(t===1){
            travel=null;orbitOffset.copy(desiredOffset);
            if(pendingStar&&!adaptedStars.has(pendingStar.id)){
              adaptedStars.add(pendingStar.id);adaptationStart=performance.now();
              adaptationSource={position:pendingStar.pos,color:pendingStar.colorCss};
            }
            pendingStar=null;
          }
        }
      } else {
        if(orbitOffset.lengthSq()===0)orbitOffset.copy(desiredOffset);
        orbitOffset.lerp(desiredOffset,response);
        const safeRadius=focusRadius()*2.5;
        if(orbitOffset.length()<safeRadius)orbitOffset.setLength(safeRadius);
        // Track the target's translation exactly while easing orbit/zoom offsets.
        curLookAt.copy(desiredLook);camera.position.copy(desiredLook).add(orbitOffset);
      }
      // Anchor each nearby track at the point closest to the camera. This also
      // works when the camera follows a moon or moves freely near an orbit.
      celestialMeshes.forEach(body => {
        const local = body.orbitLine.userData.local;
        const radius = body.currentDist;
        const angle = Math.atan2(camera.position.z, camera.position.x);
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const anchorX = radius * cos, anchorZ = radius * sin;
        const distance = Math.hypot(camera.position.x - anchorX, camera.position.y, camera.position.z - anchorZ);
        const enabled = showOrbits || targetBody === body;
        local.line.visible = enabled && distance < radius * 0.5;
        if (!local.line.visible) return;
        body.orbitLine.visible = false;
        local.line.position.set(anchorX, 0, anchorZ);
        const span = Math.min(Math.PI * 2, Math.max(distance * 20 / radius, 0.00001));
        for (let i = 0; i <= 128; i++) {
          const delta = (i / 128 - 0.5) * span;
          const dc = -2 * Math.sin(delta / 2) ** 2, ds = Math.sin(delta);
          local.positions[i * 3] = radius * (cos * dc - sin * ds);
          local.positions[i * 3 + 1] = 0;
          local.positions[i * 3 + 2] = radius * (sin * dc + cos * ds);
        }
        local.geometry.attributes.position.needsUpdate = true;
      });
      // Prevent entering stellar surfaces regardless of camera movement mode.
      brightSources[0].radius=sunCfg.scaleRadius*sunMesh.scale.x;
      let nearestBright = null;
      let nearestRatio = Infinity;
      brightSources.forEach(function (source) {
        const offset = sourceOffset.copy(camera.position).sub(source.position);
        let distance = offset.length();
        const minimum = source.radius * 1.6;
        if (distance < minimum) {
          if (distance < 0.0001) offset.set(0, 0, 1); else offset.divideScalar(distance);
          camera.position.copy(source.position).addScaledVector(offset, minimum);
          distance = minimum;
        }
        const ratio = distance / source.radius;
        if (ratio < nearestRatio) { nearestRatio = ratio; nearestBright = source; }
      });
      // Keep the near plane in front of tiny bodies when zoomed in.
      const near = Math.max(0.000001, Math.min(0.0001, cameraDistance * 0.01));
      if (camera.near !== near) { camera.near = near; camera.updateProjectionMatrix(); }
      if(!travel || travel.phase!=='aim')camera.lookAt(curLookAt);
      camera.updateMatrixWorld();

      // Glare is attached to the Sun, so it moves and disappears with its source.
      const distToSun = sunGroup.position.distanceTo(camera.position);
      const rawSolarFlux = Math.min(4.0, 320 / Math.max(40, distToSun));

      // The physical disk follows perspective. A soft optical glow keeps the
      // bright source visible when its disk is smaller than a display pixel.
      const viewHeightAtSun = 2 * distToSun * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      const minHaloPixels = 8 + 20 * Math.min(1, 520 / Math.max(1, distToSun));
      const minHaloSize = viewHeightAtSun * minHaloPixels / Math.max(1, window.innerHeight);
      const visibleSunRadius = sunCfg.scaleRadius * sunMesh.scale.x;
      const haloSize = Math.max(visibleSunRadius * (isTrueScale?8:3), minHaloSize);
      sunCoreGlare.scale.set(haloSize * 0.65, haloSize * 0.65, 1);
      sunOuterCorona.scale.set(haloSize, haloSize, 1);
      sunCoreGlare.material.opacity = 0.9;
      sunOuterCorona.material.opacity = 0.7;
      stellarGlows.forEach(function (star) {
        const distance = star.group.position.distanceTo(camera.position);
        const viewHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
        const minimum = viewHeight * (8 + 20 * Math.min(1, 520 / Math.max(1, distance))) / Math.max(1, window.innerHeight);
        const size = Math.max(176, minimum);
        star.glow.scale.set(size, size, 1);
      });

      // Telemetry HUD Update
      telemetryAge+=dt;
      if (hudVisible && !inLabMode && telemetryAge>=.12) {
        telemetryAge=0;
        let name = "Sol (System Origin)";
        let radiusText = sunCfg.stats["Equatorial Radius"];
        let volText = sunCfg.stats["Volume vs Earth"];
        let distAu = "0.000 AU";
        let vel = "0.00 km/s";
        let fluxText = (rawSolarFlux * 100).toFixed(0) + "%";

        if (targetStar) {
          name = targetStar.name;
          radiusText = targetStar.spec;
          volText = targetStar.desc;
          distAu = targetStar.dist;
          vel = "—";
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

        const rows=telemetryRows;
        rows[0].querySelector('.hud-label').textContent=targetStar?'Classification':'Physical radius';
        rows[1].querySelector('.hud-label').textContent=targetStar?'About':'Volume vs Earth';
        rows[2].querySelector('.hud-label').textContent=targetStar?'Distance / position':'Distance from Sun';
        rows[3].style.display=targetStar?'none':'';
        rows[4].style.display=targetStar?'none':'';
        rows[5].style.display=targetStar?'none':'';
        telemetryFields[0].textContent = name;
        telemetryFields[1].textContent = radiusText;
        telemetryFields[2].textContent = volText;
        telemetryFields[3].textContent = distAu;
        telemetryFields[4].textContent = vel;
        telemetryFields[5].textContent = fluxText;
      }

      sky.position.copy(camera.position);
      moonMarkers.forEach((label,i)=>{
        if(!targetMoon || travel){label.style.display='none';return;}
        markerPoint.copy(i===0?targetStar.pos:moonParent.group.position).project(camera);
        const visible=markerPoint.z>=-1&&markerPoint.z<=1&&Math.abs(markerPoint.x)<1&&Math.abs(markerPoint.y)<1;
        label.style.display=visible?'block':'none';
        if(visible){label.textContent=i===0?targetMoon.config.name:moonParent.config.name;label.style.left=(markerPoint.x*.5+.5)*innerWidth+'px';label.style.top=(.5-markerPoint.y*.5)*innerHeight+'px';}
      });
      spacecraft.forEach(craft=>{craft.group.visible=targetStar===craft.destination;});
      transitDust.visible=!!travel;
      if(travel){
        transitMat.opacity=Math.sin(travelProgress*Math.PI)*.22;
        for(let i=0;i<120;i++){transitPositions[i*3+2]+=dt*22;if(transitPositions[i*3+2]>-2)transitPositions[i*3+2]=-105;}
        transitGeo.attributes.position.needsUpdate=true;
      }
      renderer.render(scene, camera);

      // Artistic eye adaptation: begin saturated, then reveal the scene from
      // the edges inward as the bright area contracts around the Sun.
      const age = (performance.now() - adaptationStart) / 1000;
      const progress = THREE.MathUtils.clamp((age - 0.5) / 5, 0, 1);
      const approachingNewStar=travel && travel.phase==='move' && pendingStar && !adaptedStars.has(pendingStar.id);
      const approachGlare=approachingNewStar ? Math.pow(travelProgress,3)*.98 : 0;
      const proximityGlare = Math.max(approachGlare,(!freeFlight && !travel && (targetStar?.isStar || targetBody?.config.id==='sun') ? THREE.MathUtils.clamp((4 - nearestRatio) / 2.4, 0, 1) * 0.94 : 0));
      if ((progress < 1 || proximityGlare > 0) && !inLabMode) {
        camera.updateMatrixWorld();
        projectedSun.copy(approachingNewStar ? pendingStar.pos : proximityGlare > 0 ? nearestBright.position : adaptationSource.position).project(camera);
        if (projectedSun.z >= -1 && projectedSun.z <= 1) {
          const x = (projectedSun.x * 0.5 + 0.5) * window.innerWidth;
          const y = (0.5 - projectedSun.y * 0.5) * window.innerHeight;
          const eased = progress * progress * (3 - 2 * progress);
          const tint = approachingNewStar ? pendingStar.colorCss : adaptationSource.color;
          const radius = Math.max(window.innerWidth, window.innerHeight) * Math.max(2.6 - 2.25 * eased, 0.35 + proximityGlare * 2);
          const opacity = Math.max(1 - Math.pow(progress, 3), proximityGlare);
          adaptationOverlay.style.opacity = opacity;
          adaptationOverlay.style.background = `radial-gradient(circle ${radius}px at ${x}px ${y}px, #fff 0%, ${tint} 28%, rgba(255,239,205,.88) 48%, rgba(255,220,160,.3) 72%, transparent 100%)`;
        } else {
          adaptationOverlay.style.opacity = 0;
        }
      } else {
        adaptationOverlay.style.opacity = 0;
      }
    }

    animate();
  }
})();
