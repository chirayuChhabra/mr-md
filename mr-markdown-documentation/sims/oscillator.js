(() => {
  "use strict";

  const sim = window.defineSimulation({ props: { damping: 1.5, dampingMode: "viscous", medium: "air", stiffness: 25, mass: 1 } });

  const visibleMeasurements = new Set();
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.data?.type !== "bk:measurement-visibility" || !Array.isArray(event.data.measurements)) return;
    visibleMeasurements.clear();
    for (const measurement of event.data.measurements) {
      if (typeof measurement?.scene === "string") visibleMeasurements.add(measurement.scene);
    }
    window.__renderFrame?.();
  });

  // Core physical state (all variables encapsulated in local closure)
  const state = {
    // Model parameters synced with host controls
    damping: Number(window.__simProps?.damping ?? 1.5), // N·s/m
    dampingMode: String(window.__simProps?.dampingMode ?? "viscous"),
    medium: String(window.__simProps?.medium ?? "air"),
    stiffness: Number(window.__simProps?.stiffness ?? 25), // N/m
    mass: Math.max(0.1, Number(window.__simProps?.mass ?? 1.0)), // kg

    // Dynamical state: displacement x (meters), velocity v (m/s)
    x: 0.75,
    v: 0.0,
    time: 0,
  };

  // Pointer drag and visual animation state
  let isDragging = false;
  let dragPointerId = null;
  let lastDragX = 0;
  let lastDragTime = 0;
  let impulseFlash = 0;
  let pointerInitialized = false;
  let grabOffsetX = 0;
  let grabOffsetY = 0;

  sim.onPlaybackChange((playing) => {
    if (playing && dragPointerId === null) isDragging = false;
  });

  // The apparatus and annotations share a fixed 1280 × 720 layout.
  const LOGICAL_WIDTH = 1280;
  const LOGICAL_HEIGHT = 720;
  const EQUILIBRIUM_X = 776;
  const METERS_TO_PIXELS = 128; // 1.0 m = 128 px
  const MAX_DISPLACEMENT = 1.25; // meters

  // Environment drag factor
  function getMediumMultiplier(medium) {
    switch (medium) {
      case "vacuum":
        return 0.0;
      case "water":
        return 2.5;
      case "glycerin":
        return 5.0;
      case "air":
      default:
        return 1.0;
    }
  }

  // React to host property changes (tunables & presets)
  sim.onPropsChange((p) => {
    if (p.damping !== undefined) state.damping = Math.max(0, Number(p.damping));
    if (p.dampingMode !== undefined) state.dampingMode = String(p.dampingMode);
    if (p.medium !== undefined) state.medium = String(p.medium);
    if (p.stiffness !== undefined) state.stiffness = Math.max(1, Number(p.stiffness));
    if (p.mass !== undefined) state.mass = Math.max(0.1, Number(p.mass));
  });

  sim.onReset(() => {
    state.x = 0.75;
    state.v = 0;
    state.time = 0;
    isDragging = false;
    dragPointerId = null;
    impulseFlash = 0;
  });



  // React to host action button clicks (repeatable impulses and rest reset)
  window.addEventListener("bk:action", (event) => {
    const action = event.detail?.action;
    if (action === "impulse") {
      // Deliver repeatable impulse Δv
      let kickDir = 1;
      if (state.x > 0.6) kickDir = -1;
      else if (state.x < -0.6) kickDir = 1;
      else if (Math.abs(state.v) > 0.05) kickDir = Math.sign(state.v);
      state.v += kickDir * 2.2 / state.mass;
      impulseFlash = 1.0;
    } else if (action === "zero") {
      isDragging = false;
      dragPointerId = null;
      state.x = 0;
      state.v = 0;
      impulseFlash = 0;
    }
  });

  // Pointer drag interaction for manual displacement
  let layoutOffsetY = 0;
  function initializePointer(canvas) {
    if (pointerInitialized) return;

    canvas.tabIndex = 0;
    const focusStyle = document.createElement("style");
    focusStyle.textContent = "#c:focus { outline: none; }";
    document.head.appendChild(focusStyle);
    canvas.style.touchAction = "none";
    canvas.setAttribute("aria-label", "Damped oscillator. Drag the cart or use the left and right arrow keys to displace it.");
    canvas.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      state.x = Math.max(-MAX_DISPLACEMENT, Math.min(MAX_DISPLACEMENT, state.x + (event.key === "ArrowRight" ? 0.1 : -0.1)));
      state.v = 0;
      window.__renderFrame?.();
    });
    canvas.addEventListener("pointerdown", (event) => {
      const pt = window.bkCanvasPoint(event, canvas);
      const cartBody = apparatusGeometry();

      if (dragPointerId !== null || !event.isPrimary || event.button !== 0) return;
      if (
        pt.x >= cartBody.bounds.left - 12 && pt.x <= cartBody.bounds.right + 12 &&
        pt.y - layoutOffsetY >= cartBody.bounds.top - 12 && pt.y - layoutOffsetY <= cartBody.bounds.bottom + 12
      ) {
        canvas.focus({ preventScroll: true });
        isDragging = true;
        dragPointerId = event.pointerId;
        canvas.setPointerCapture(event.pointerId);
        grabOffsetX = pt.x;
        grabOffsetY = pt.y;
        lastDragX = state.x;
        lastDragTime = performance.now();
        state.v = 0;
      }
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!isDragging || event.pointerId !== dragPointerId) {
        const pt = window.bkCanvasPoint(event, canvas);
        const body = apparatusGeometry();
        canvas.style.cursor = pt.x >= body.bounds.left - 12 && pt.x <= body.bounds.right + 12 && pt.y - layoutOffsetY >= body.bounds.top - 12 && pt.y - layoutOffsetY <= body.bounds.bottom + 12 ? "grab" : "default";
        return;
      }
      canvas.style.cursor = "grabbing";
      const pt = window.bkCanvasPoint(event, canvas);
      const now = performance.now();
      const dt = Math.max(0.001, (now - lastDragTime) / 1000);

      // Project the gesture onto the same diagonal axis used to draw the rail.
      const alongTrack = ((pt.x - grabOffsetX) + 0.28 * (pt.y - grabOffsetY)) / (1 + 0.28 ** 2);
      const targetX = lastDragX + alongTrack / METERS_TO_PIXELS;
      const clampedX = Math.max(-MAX_DISPLACEMENT, Math.min(MAX_DISPLACEMENT, targetX));
      state.v = sim.isPlaying ? (clampedX - state.x) / dt : 0;
      state.x = clampedX;
      lastDragTime = now;
      window.__renderFrame?.();
    });

    const endDrag = (event) => {
      if (isDragging && event.pointerId === dragPointerId) {
        isDragging = false;
        dragPointerId = null;
        state.v = event.type !== "pointerup" || performance.now() - lastDragTime > 100 ? 0 : Math.max(-6, Math.min(6, state.v));
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        canvas.style.cursor = "grab";
        window.__renderFrame?.();
      }
    };

    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("lostpointercapture", endDrag);

    pointerInitialized = true;
  }

  // Visual language styling matching active bkUi()
  function getUiStyle() {
    const mode = typeof window.bkUi === "function" ? window.bkUi() : "standard";
    switch (mode) {
      case "neo":
        return {
          mode: "neo",
          cartRadius: 0,
          panelRadius: 0,
          lineWidth: 2.0,
          thickLineWidth: 3.0,
          shadowOffset: 3,
          lineCap: "square",
          lineJoin: "miter",
          fontFamily: "'Space Grotesk', system-ui, -apple-system, sans-serif",
        };
      case "playful":
        return {
          mode: "playful",
          cartRadius: 16,
          panelRadius: 14,
          lineWidth: 2.5,
          thickLineWidth: 3.5,
          shadowOffset: 4,
          lineCap: "round",
          lineJoin: "round",
          fontFamily: "'Fredoka', 'Quicksand', system-ui, sans-serif",
        };
      case "standard":
      default:
        return {
          mode: "standard",
          cartRadius: 6,
          panelRadius: 8,
          lineWidth: 1.5,
          thickLineWidth: 2.5,
          shadowOffset: 2,
          lineCap: "round",
          lineJoin: "round",
          fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
        };
    }
  }

  function strokeLine(ctx, x1, y1, x2, y2, color, width = 2) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Orthographic projection: x is the physical track axis, y is bench depth, z is height.
  function project(x, y = 0, z = 0) {
    return { x: x + y * 0.55, y: 200 + x * 0.28 - y * 0.5 - z };
  }

  function apparatusGeometry() {
    const x = EQUILIBRIUM_X + state.x * METERS_TO_PIXELS;
    const height = 72 + state.mass * 12;
    const corners = [-80, 80].flatMap(dx => [-100, 100].flatMap(y => [20, height + 20].map(z => project(x + dx, y, z))));
    return { x, left: x - 80, height, bounds: {
      left: Math.min(...corners.map(p => p.x)), right: Math.max(...corners.map(p => p.x)),
      top: Math.min(...corners.map(p => p.y)), bottom: Math.max(...corners.map(p => p.y))
    } };
  }

  function polygon(ctx, points, fill, stroke = window.bkColor("line-strong"), width = window.bkUi() === "neo" ? 2.5 : window.bkUi() === "playful" ? 2 : 1.5) {
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }

  const LIQUID_LEVEL = 110;
  function liquidColor() {
    return state.medium === "water" ? "#299ec2" : state.medium === "glycerin" ? "#b98526" : null;
  }

  function submergedFace(vertices) {
    const clipped = [];
    for (let i=0;i<vertices.length;i++) {
      const a=vertices[i], b=vertices[(i+1)%vertices.length];
      const insideA=a[2]<=LIQUID_LEVEL, insideB=b[2]<=LIQUID_LEVEL;
      if(insideA)clipped.push(a);
      if(insideA!==insideB) {
        const t=(LIQUID_LEVEL-a[2])/(b[2]-a[2]);
        clipped.push(a.map((v,j)=>v+(b[j]-v)*t));
      }
    }
    return clipped;
  }

  function cuboid(ctx, x, y, z, length, depth, height, material = {}) {
    const c = window.bkColor;
    const face = (vertices, fill) => {
      const points=vertices.map(v=>project(...v));
      polygon(ctx,points,c("paper"),null); polygon(ctx,points,fill);
      const fluid=liquidColor();
      if(fluid && z+height>0) {
        const wet=submergedFace(vertices);
        if(wet.length>=3) {
          ctx.save();ctx.globalAlpha=state.medium==="glycerin"?0.22:0.16;
          polygon(ctx,wet.map(v=>project(...v)),fluid,null);ctx.restore();
        }
      }
    };
    face([[x,y,z+height],[x+length,y,z+height],[x+length,y+depth,z+height],[x,y+depth,z+height]], material.top || c("paper"));
    face([[x,y,z],[x+length,y,z],[x+length,y,z+height],[x,y,z+height]], material.front || c("paper"));
    face([[x+length,y,z],[x+length,y+depth,z],[x+length,y+depth,z+height],[x+length,y,z+height]], material.side || c("accent-soft"));
  }

  function worldLine(ctx, a, b, color, width = 2) {
    const p = project(...a), q = project(...b);
    strokeLine(ctx, p.x, p.y, q.x, q.y, color, width);
  }

  function drawEnvironment(ctx, foreground = false) {
    if(state.medium==="vacuum")return;
    const fluid=liquidColor(), viscous=state.medium==="glycerin";
    if(fluid) {
      const level=LIQUID_LEVEL;
      const faces=foreground ? [
        [[145,-120,0],[1105,-120,0],[1105,-120,level],[145,-120,level]],
        [[1105,-120,0],[1105,120,0],[1105,120,level],[1105,-120,level]]
      ] : [[[145,120,0],[1105,120,0],[1105,120,level],[145,120,level]]];
      ctx.save();ctx.globalAlpha=foreground?0.09:0.12;
      for(const face of faces)polygon(ctx,face.map(v=>project(...v)),fluid,null);
      ctx.restore();
      if(foreground) {
        ctx.save();ctx.globalAlpha=viscous?0.04:0.025;
        polygon(ctx,[project(145,-120,level),project(1105,-120,level),project(1105,120,level),project(145,120,level)],fluid,null);ctx.restore();
        // The surface crosses the apparatus at one shared physical height.
        for(const y of [-120,120])worldLine(ctx,[145,y,level],[1105,y,level],fluid,1.5);
        worldLine(ctx,[1105,-120,level],[1105,120,level],fluid,1.5);
        for(const x of [145,1105])worldLine(ctx,[x,-120,0],[x,-120,level],fluid,1);
        if(Math.abs(state.v)>0.04) {
          const cart=apparatusGeometry();
          for(let ring=0;ring<2;ring++) {
            const spread=5+ring*5+(state.time*(viscous?0.3:1.2)%3);
            ctx.save();ctx.globalAlpha=Math.min(0.35,Math.abs(state.v)*0.13)/(ring+1);
            ctx.beginPath();
            for(let i=0;i<=40;i++) {
              const t=i/40;
              const p=project(cart.left-24+t*208,-102-spread-8*Math.sin(t*Math.PI),level);
              i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);
            }
            ctx.strokeStyle=fluid;ctx.lineWidth=1;ctx.stroke();ctx.restore();
          }
          for(let lane=0;lane<3;lane++) {
            ctx.beginPath();
            for(let i=0;i<=30;i++) {
              const t=i/30, x=EQUILIBRIUM_X+state.x*METERS_TO_PIXELS-145+t*290;
              const y=-110-lane*3, z=30+lane*18+Math.sin(t*Math.PI*2-state.time*(viscous?1:3))*Math.min(4,Math.abs(state.v)*2);
              const p=project(x,y,z);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);
            }
            ctx.strokeStyle=fluid;ctx.lineWidth=viscous?2:1;ctx.stroke();
          }
        }
      }
    }
    ctx.save();ctx.globalAlpha=fluid?0.45:0.2;
    ctx.strokeStyle=fluid||window.bkColor("text-light");ctx.fillStyle=ctx.strokeStyle;
    const count=viscous?30:fluid?20:10;
    for(let i=0;i<count;i++) {
      const x=220+((i*173.31+state.time*(viscous?1:7))%850);
      const y=foreground?-118+(i*7.3)%15:20+(i*31.7)%90;
      const z=12+(i*29.3)%(LIQUID_LEVEL-20);
      const p=project(x,y,z);ctx.beginPath();
      if(fluid) {ctx.arc(p.x,p.y,viscous?2.2:1.8,0,Math.PI*2);viscous?ctx.fill():ctx.stroke();}
      else if(!foreground) {ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+10,p.y+3);ctx.stroke();}
    }
    ctx.restore();
  }

  function drawSpring(ctx, cart, ui) {
    const c = window.bkColor, start = 190, end = cart.left, lead = 20, turns = 10;
    const wire = 2.5 + (state.stiffness - 5) / 55 * 4;
    const coil = () => {
      ctx.beginPath(); let p = project(start,-55,72); ctx.moveTo(p.x,p.y);
      p = project(start+lead,-55,72);ctx.lineTo(p.x,p.y);
      for (let i=0;i<=480;i++) {
        const t=i/480, a=t*turns*Math.PI*2;
        p=project(start+lead+(end-start-2*lead)*t,-55+28*Math.sin(a),72+28*Math.cos(a));
        ctx.lineTo(p.x,p.y);
      }
      p=project(end,-55,72);ctx.lineTo(p.x,p.y);
    };
    ctx.lineCap=ui.lineCap;ctx.lineJoin="round";
    coil();ctx.strokeStyle=c("line-strong");ctx.lineWidth=wire+2;ctx.stroke();
    coil();ctx.strokeStyle=c("text-light");ctx.lineWidth=wire;ctx.stroke();
    ctx.save();ctx.translate(0,-0.8);coil();ctx.strokeStyle=c("text");ctx.lineWidth=Math.max(1,wire/3);ctx.stroke();ctx.restore();
    const fluid=liquidColor();
    if(fluid) {ctx.save();ctx.globalAlpha=0.3;coil();ctx.strokeStyle=fluid;ctx.lineWidth=wire;ctx.stroke();ctx.restore();}
    if(visibleMeasurements.has("springEnergy")) {
      const energy=0.5*state.stiffness*state.x*state.x;
      const reference=0.5*state.stiffness*0.75**2;
      const amount=1-Math.exp(-energy/reference);
      ctx.save();ctx.globalAlpha=amount;coil();ctx.strokeStyle=c("accent");ctx.lineWidth=wire+amount*3;ctx.stroke();ctx.restore();
    }

  }

  function drawDamping(ctx, cart) {
    const c=window.bkColor, amount=Math.min(1,state.damping/25);
    if (state.dampingMode === "friction") {
      const width=38+amount*64;
      cuboid(ctx,cart.x-width/2,-100,4,width,200,16,{front:c("accent-soft"),top:c("accent-soft")});
      for(let x=cart.x-width/2+4;x<cart.x+width/2;x+=8)worldLine(ctx,[x,-102,5],[x+4,-102,16],c("accent"),2);
      return;
    }
    if(state.dampingMode === "quadratic") {
      const depth=42+amount*100;
      worldLine(ctx,[cart.left-40,50,50],[cart.left,50,50],c("text-light"),5);
      cuboid(ctx,cart.left-50,50-depth/2,28,12,depth,52,{front:c("accent-soft"),top:c("accent-soft")});
      const wake=Math.min(70,Math.abs(state.v)*20)*-Math.sign(state.v);
      for(const y of [20,50,80])worldLine(ctx,[cart.left-60,y,50],[cart.left-60+wake,y,50],c("accent"),1.5);
      return;
    }
    const piston=cart.left-332;
    cuboid(ctx,190,30,16,340,42,40,{front:c("accent-soft"),top:c("paper")});
    ctx.save();ctx.globalAlpha=amount*0.3;
    polygon(ctx,[project(192,29,18),project(528,29,18),project(528,29,54),project(192,29,54)],c("accent"),null);ctx.restore();
    worldLine(ctx,[piston,29,36],[cart.left,29,36],c("text"),5);
    const fins=1+Math.round(amount*5);
    for(let i=0;i<fins;i++) {
      const x=Math.max(196,Math.min(524,piston+(i-(fins-1)/2)*7));
      worldLine(ctx,[x,28,21],[x,28,51],c("accent"),3);
    }
    const p=project(215,29,36);
    ctx.fillStyle=c("paper");ctx.strokeStyle=c("text-light");ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(p.x,p.y,9,0,Math.PI*2);ctx.fill();ctx.stroke();
    strokeLine(ctx,p.x,p.y-6*(1-amount),p.x,p.y+6*(1-amount),c("accent"),3);
  }

  function drawApparatus(ctx, cart, ui) {
    const c=window.bkColor;
    ctx.lineJoin=ui.lineJoin;
    ctx.lineCap=ui.lineCap;
    // A broad bench gives the track depth without changing spring or mass proportions.
    cuboid(ctx,145,-120,-35,960,240,24,{top:c("paper"),front:c("line-strong"),side:c("line-strong")});
    for(const x of [160,1040]) for(const y of [-100,100]) cuboid(ctx,x,y,-59,28,24,24,{front:c("line-strong")});
    for(const y of [-78,78]) cuboid(ctx,135,y,-9,970,12,14,{top:c("text-light"),front:c("line-strong"),side:c("line-strong")});
    // Trolley feet sit on the two guides rather than floating below the mass.
    for(const y of [-84,72]) cuboid(ctx,cart.left-6,y,5,172,24,15,{front:c("line-strong")});
    cuboid(ctx,150,-115,0,40,230,140,{front:c("paper"),side:c("line-strong")});
    for(const y of [-85,85]) {
      const p=project(172,y,141);ctx.strokeStyle=c("text-light");ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.stroke();
    }
    drawDamping(ctx,cart);
    drawSpring(ctx,cart,ui);
    const count=Math.max(1,Math.round(state.mass*2));
    const material={top:c("paper"),front:isDragging||impulseFlash>0?c("accent-soft"):c("paper"),side:c("accent-soft")};
    cuboid(ctx,cart.left,-100,20,160,200,cart.height,material);
    for(let i=1;i<count;i++) {
      const z=20+cart.height*i/count;
      worldLine(ctx,[cart.left,-100,z],[cart.left+160,-100,z],c("line-strong"),1.5);
      worldLine(ctx,[cart.left+160,-100,z],[cart.left+160,100,z],c("line-strong"),1.5);
    }
    for(const x of [cart.left+18,cart.left+142]) {
      worldLine(ctx,[x,-102,28],[x,-102,cart.height+12],c("accent"),3);
      const p=project(x,-65,cart.height+21);ctx.fillStyle=c("line-strong");ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();
    }
    if(visibleMeasurements.has("kineticEnergy")) {
      const energy=0.5*state.mass*state.v*state.v;
      const amount=1-Math.exp(-energy/(0.5*state.stiffness*0.75**2));
      ctx.save();ctx.globalAlpha=0.55;
      polygon(ctx,[project(cart.left,-101,20),project(cart.left+160,-101,20),project(cart.left+160,-101,20+cart.height*amount),project(cart.left,-101,20+cart.height*amount)],c("accent"),null);
      ctx.restore();
      if(amount>0.005) {
        const direction=-Math.sign(state.v);
        for(let i=1;i<=3;i++) {
          ctx.save();ctx.globalAlpha=amount*(0.55-i*0.12);
          const x=cart.x+direction*(85+i*32*amount);
          worldLine(ctx,[x,-100,25],[x,-100,25+cart.height*0.8],c("accent"),2);
          ctx.restore();
        }
      }
    }
    if(ctx.canvas.matches(":focus-visible")) {
      ctx.save();ctx.setLineDash([5,4]);
      polygon(ctx,[project(cart.left-5,-105,18),project(cart.left+165,-105,18),project(cart.left+165,-105,cart.height+25),project(cart.left-5,-105,cart.height+25)],null,c("accent"),3);ctx.restore();
    }
  }

  // Numerical simulation integration with sub-stepping
  function updatePhysics(dt) {
    if (isDragging || dt <= 0) return;

    const subSteps = Math.max(1, Math.ceil(dt / 0.001));
    const h = dt / subSteps;
    const c = state.damping * getMediumMultiplier(state.medium);
    const m = state.mass, k = state.stiffness;
    const omega = Math.sqrt(k / m);
    // Exact spring flow and exact drag flow avoid explicit-damping instability.
    const spring = (duration) => {
      const angle = omega * duration, cos = Math.cos(angle), sin = Math.sin(angle);
      const x = state.x;
      state.x = x * cos + state.v / omega * sin;
      state.v = state.v * cos - x * omega * sin;
    };
    for (let i = 0; i < subSteps; i++) {
      if (state.dampingMode === "friction") {
        // Dry contact friction is independent of the surrounding fluid.
        const kinetic = Math.min(0.8, state.damping * 0.04) * m * 9.81;
        const force = -k * state.x;
        if (Math.abs(state.v) < 1e-10 && Math.abs(force) <= 1.25 * kinetic) {
          state.v = 0;
          continue;
        }
        const direction = Math.sign(state.v) || Math.sign(force);
        const acceleration = (force - direction * kinetic) / m;
        const stopTime = acceleration * state.v < 0 ? -state.v / acceleration : Infinity;
        const step = Math.min(h, stopTime);
        state.x += state.v * step + 0.5 * acceleration * step * step;
        state.v = stopTime <= h ? 0 : state.v + acceleration * h;
      } else {
        spring(h / 2);
        if (state.dampingMode === "quadratic") state.v /= 1 + 0.5 * c * Math.abs(state.v) * h / m;
        else state.v *= Math.exp(-c * h / m);
        spring(h / 2);
      }
      if (Math.abs(state.x) > MAX_DISPLACEMENT) {
        const side = Math.sign(state.x);
        state.x = side * MAX_DISPLACEMENT;
        if (state.v * side > 0) state.v *= -0.2;
      }
    }

    state.time += dt;
  }

  // Main canvas draw callback
  function draw(ctx, width, height, frame) {
    const viewX = frame?.originX ?? 0;
    const viewY = frame?.originY ?? 0;
    const viewWidth = frame?.viewportWidth ?? width;
    const viewHeight = frame?.viewportHeight ?? height;
    initializePointer(ctx.canvas);

    const elapsed = sim.deltaTime();
    const dt = window.__bkRestoring ? 0 : Math.min(elapsed, 0.05);

    updatePhysics(dt);

    if (impulseFlash > 0) {
      impulseFlash = Math.max(0, impulseFlash - dt * 2.5);
    }

    const ui = getUiStyle();
    const bg = window.bkColor("bg");
    const accent = window.bkColor("accent");

    // Clear canvas background
    ctx.fillStyle = bg;
    ctx.fillRect(viewX, viewY, viewWidth, viewHeight);
    layoutOffsetY = viewY + Math.max(0, (viewHeight - LOGICAL_HEIGHT) / 2);
    ctx.save();
    ctx.translate(0, layoutOffsetY);

    // Analytical linear oscillator quantities
    const mediumMult = getMediumMultiplier(state.medium);
    const effC = state.damping * mediumMult;
    const omega0 = Math.sqrt(state.stiffness / state.mass);
    const criticalC = 2 * Math.sqrt(state.stiffness * state.mass);
    const zeta = effC / criticalC;

    let regimeBadge = "Underdamped";
    if (state.dampingMode === "viscous") {
      if (effC === 0) {
        regimeBadge = "Undamped";
      } else if (Math.abs(zeta - 1.0) <= 0.02) {
        regimeBadge = "Near critical damping";
      } else if (zeta > 1.02) {
        regimeBadge = "Overdamped";
      } else {
        regimeBadge = "Underdamped";
      }
    } else if (state.dampingMode === "quadratic") {
      regimeBadge = "Quadratic drag";
    } else if (state.dampingMode === "friction") {
      regimeBadge = "Dry friction";
    }

    const cart = apparatusGeometry();
    const kinetic = 0.5 * state.mass * state.v * state.v;
    const potential = 0.5 * state.stiffness * state.x * state.x;
    drawEnvironment(ctx);
    drawApparatus(ctx, cart, ui);
    drawEnvironment(ctx, true);

    if (visibleMeasurements.has("displacement")) {
      worldLine(ctx,[EQUILIBRIUM_X,-205,0],[cart.x,-205,0],accent,2);
      for(const x of [EQUILIBRIUM_X,cart.x])worldLine(ctx,[x,-205,-5],[x,-205,5],accent,2);

    }
    if (visibleMeasurements.has("velocity")) {
      const length = Math.max(-112, Math.min(112, state.v * 32));
      const a = project(cart.x,-105,cart.height+72), b = project(cart.x+length,-105,cart.height+72);
      strokeLine(ctx,a.x,a.y,b.x,b.y,accent,3);
      if(Math.abs(length)>3) {
        const direction=Math.sign(length), dx=direction*8, dy=direction*2.24;
        strokeLine(ctx,b.x,b.y,b.x-dx-2,b.y-dy+6,accent,3);
        strokeLine(ctx,b.x,b.y,b.x-dx+2,b.y-dy-6,accent,3);
      }

    }
    if (!window.__bkRestoring) sim.publishTelemetry({
      time: state.time,
      regime: regimeBadge,
      displacement: state.x,
      velocity: state.v,
      springEnergy: potential,
      kineticEnergy: kinetic,
      angularFrequency: omega0,
      dampingRatio: state.dampingMode === "viscous" ? zeta : null
    });

    ctx.restore();
  }

  // Preserve transient visuals so a restored frame matches its capture.
  window.bkRegisterSnapshot({
    capture: () => ({
      ...state,
      props: { ...window.__simProps },
      impulseFlash,
      isDragging,
      lastDragX,
    }),
    restore: (snapshot) => {
      const { props, impulseFlash: flash, isDragging: dragging, lastDragX: dragX, ...model } = snapshot;
      Object.assign(state, model);
      impulseFlash = flash;
      // Pointer capture belongs to a live gesture, never to a historical frame.
      if (dragPointerId !== null) {
        const canvas = document.getElementById("c");
        if (canvas.hasPointerCapture(dragPointerId)) canvas.releasePointerCapture(dragPointerId);
      }
      isDragging = dragging;
      dragPointerId = null;
      lastDragX = dragX;
      lastDragTime = performance.now();
    },
  });

  // Register canvas loop with standard mr-md lifecycle
  window.bkSetup(LOGICAL_WIDTH, LOGICAL_HEIGHT, draw);
})();
