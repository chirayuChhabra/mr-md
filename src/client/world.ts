// @ts-nocheck

let activeWorldFigure = null;
const registeredPortals = new Map();
let worldObserver = null;
const _hudIdleTimer = null;

// ============================================================================
// MODULAR TRANSITION REGISTRY ("Extensibility Backdoor")
// ============================================================================
const transitionRegistry = new Map();

export function bkRegisterWorldTransition(id, definition) {
	if (!id || !definition) return;
	transitionRegistry.set(id, definition);
}

if (typeof window !== "undefined") {
	window.bkRegisterWorldTransition = bkRegisterWorldTransition;
}

// Ramanujan ellipse perimeter for rx=180, ry=96
const RIM_CIRCUMFERENCE = 887.3;

// Helper: resolve active transition for a world figure strictly from config/block attribute
function resolveTransitionForFigure(figure) {
	const portalAttr =
		figure?.getAttribute("data-portal") ||
		figure
			?.querySelector(".bk-world-portal")
			?.getAttribute("data-portal-type") ||
		"minimal";

	if (portalAttr === "wormhole") {
		return transitionRegistry.get("wormhole") || defaultWormholeTransition;
	}

	if (portalAttr === "pixel") {
		return transitionRegistry.get("pixel") || pixelGatewayTransition;
	}

	return transitionRegistry.get(portalAttr) || minimalWorldTransition;
}

// ============================================================================
// TRANSITION 1: MINIMALIST (CALLOUT-SIZED ARCHITECTURAL APERTURE)
// Silky smooth GPU compositor clip-path expansion and circular hold meter.
// ============================================================================
const minimalWorldTransition = {
	id: "minimal",

	initInline(_portalData) {},

	renderInline(_portalData, _time, _dt) {},

	traverse(params) {
		const { slot, startRect, portal, onComplete } = params;
		const TOPBAR_H = 48;
		const screenW = window.innerWidth;
		const screenH = window.innerHeight - TOPBAR_H;

		const topClip = Math.max(0, startRect.top - TOPBAR_H);
		const leftClip = Math.max(0, startRect.left);
		const rightClip = Math.max(0, screenW - startRect.right);
		const bottomClip = Math.max(0, screenH - (startRect.bottom - TOPBAR_H));
		const portalEl =
			portal ||
			(typeof document !== "undefined"
				? document.querySelector(".bk-world-card--minimal.bk-world-portal")
				: null);
		const computedRadius = portalEl
			? parseFloat(window.getComputedStyle(portalEl).borderRadius)
			: 12;
		const radius = Number.isNaN(computedRadius) ? 12 : computedRadius;

		slot.style.position = "absolute";
		slot.style.inset = "0";
		slot.style.width = "100%";
		slot.style.height = "100%";
		slot.style.clipPath = `inset(${topClip}px ${rightClip}px ${bottomClip}px ${leftClip}px round ${radius}px)`;
		slot.style.opacity = "1";
		slot.style.pointerEvents = "none";
		slot.style.willChange = "clip-path";

		// Double rAF ensures the compositor registers initial clip-path before animating
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				slot.style.transition = "clip-path 0.42s cubic-bezier(0.16, 1, 0.3, 1)";
				slot.style.clipPath = "inset(0px 0px 0px 0px round 0px)";
			});
		});

		setTimeout(() => {
			slot.style.transition = "";
			slot.style.clipPath = "";
			slot.style.pointerEvents = "";
			slot.style.willChange = "";
			onComplete();
		}, 460);
	},

	exit(params) {
		const { slot, endRect, portal, onComplete } = params;
		const TOPBAR_H = 48;
		const screenW = window.innerWidth;
		const screenH = window.innerHeight - TOPBAR_H;

		const topClip = Math.max(0, endRect.top - TOPBAR_H);
		const leftClip = Math.max(0, endRect.left);
		const rightClip = Math.max(0, screenW - endRect.right);
		const bottomClip = Math.max(0, screenH - (endRect.bottom - TOPBAR_H));
		const portalEl =
			portal ||
			(typeof document !== "undefined"
				? document.querySelector(".bk-world-card--minimal.bk-world-portal")
				: null);
		const computedRadius = portalEl
			? parseFloat(window.getComputedStyle(portalEl).borderRadius)
			: 12;
		const radius = Number.isNaN(computedRadius) ? 12 : computedRadius;

		slot.style.pointerEvents = "none";
		slot.style.willChange = "clip-path, opacity";
		slot.style.clipPath = "inset(0px 0px 0px 0px round 0px)";
		slot.style.transition =
			"clip-path 0.34s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.28s ease";

		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				slot.style.clipPath = `inset(${topClip}px ${rightClip}px ${bottomClip}px ${leftClip}px round ${radius}px)`;
				slot.style.opacity = "0.1";
			});
		});

		setTimeout(() => {
			slot.style.cssText = "";
			onComplete();
		}, 360);
	},
};

transitionRegistry.set("minimal", minimalWorldTransition);

function parseRgb(colorStr) {
	if (!colorStr) return [56, 189, 248];
	if (colorStr.startsWith("#")) {
		const hex = colorStr.replace("#", "");
		if (hex.length === 3) {
			return [
				parseInt(hex[0] + hex[0], 16),
				parseInt(hex[1] + hex[1], 16),
				parseInt(hex[2] + hex[2], 16),
			];
		}
		if (hex.length >= 6) {
			return [
				parseInt(hex.substring(0, 2), 16),
				parseInt(hex.substring(2, 4), 16),
				parseInt(hex.substring(4, 6), 16),
			];
		}
	}
	const m = colorStr.match(/(\d+),\s*(\d+),\s*(\d+)/);
	if (m) {
		return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
	}
	if (typeof document !== "undefined") {
		try {
			const c = document.createElement("canvas");
			c.width = 1;
			c.height = 1;
			const cx = c.getContext("2d");
			if (cx) {
				cx.fillStyle = colorStr;
				cx.fillRect(0, 0, 1, 1);
				const d = cx.getImageData(0, 0, 1, 1).data;
				if (d[3] > 0) return [d[0], d[1], d[2]];
			}
		} catch (_) {}
	}
	return [56, 189, 248];
}

// ============================================================================
// GRAVITATIONAL OBJECT WARP (PHYSICAL SPACETIME DISTORTION OF NEARBY BLOCKS)
// Physically warps content blocks above and below while holding to charge.
// ============================================================================
function updateGravitationalObjectWarp(figure, progress, time) {
	if (!figure) return;
	const p = Math.max(0, Math.min(1.0, progress));

	const prev1 = figure.previousElementSibling;
	const prev2 = prev1 ? prev1.previousElementSibling : null;
	const next1 = figure.nextElementSibling;
	const next2 = next1 ? next1.nextElementSibling : null;

	const siblings = [
		{ el: prev1, dir: 1, weight: 1.0 },
		{ el: prev2, dir: 1, weight: 0.45 },
		{ el: next1, dir: -1, weight: 1.0 },
		{ el: next2, dir: -1, weight: 0.45 },
	];

	const hum = p > 0.05 ? Math.sin(time * 0.038) * (p * 1.8) : 0;

	for (let i = 0; i < siblings.length; i++) {
		const { el, dir, weight } = siblings[i];
		if (!el || el.classList.contains("bk-world-fullscreen")) continue;

		if (p <= 0.005) {
			if (el.__isGravityWarped) {
				el.style.transform = "";
				el.style.filter = "";
				el.style.transition =
					"transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), filter 0.35s ease";
				el.__isGravityWarped = false;
				setTimeout(() => {
					if (!el.__isGravityWarped) el.style.transition = "";
				}, 360);
			}
			continue;
		}

		el.__isGravityWarped = true;
		el.style.transition = "none";
		el.style.willChange = "transform, filter";

		// Directional pull towards wormhole mouth
		const pullY = dir * p * 26 * weight; // Sucked towards wormhole
		const scaleX = 1 - p * 0.048 * weight; // Gravitational tidal compression
		const scaleY = 1 + p * 0.028 * weight; // Spacetime elongation
		const skewX = dir * p * 1.8 * weight; // Rotational frame-dragging twist
		const blur = (p * 0.5 * weight).toFixed(2);

		el.style.transformOrigin = dir > 0 ? "center bottom" : "center top";
		el.style.transform = `translate3d(${hum * weight}px, ${pullY.toFixed(2)}px, 0) scale(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)}) skewX(${skewX.toFixed(2)}deg)`;
		if (parseFloat(blur) > 0.1) {
			el.style.filter = `blur(${blur}px)`;
		} else {
			el.style.filter = "";
		}
	}
}

function clearGravitationalObjectWarp(figure) {
	if (!figure) return;
	const prev1 = figure.previousElementSibling;
	const prev2 = prev1 ? prev1.previousElementSibling : null;
	const next1 = figure.nextElementSibling;
	const next2 = next1 ? next1.nextElementSibling : null;

	const siblings = [prev1, prev2, next1, next2];
	for (let i = 0; i < siblings.length; i++) {
		const el = siblings[i];
		if (el?.__isGravityWarped) {
			el.style.transition =
				"transform 0.38s cubic-bezier(0.16, 1, 0.3, 1), filter 0.38s ease";
			el.style.transform = "";
			el.style.filter = "";
			el.__isGravityWarped = false;
			setTimeout(() => {
				if (!el.__isGravityWarped) el.style.transition = "";
			}, 400);
		}
	}
}

// ============================================================================
// TRANSITION 2: EINSTEIN-ROSEN SPATIAL WORMHOLE (UNBOXED CELESTIAL GATEWAY)
// Traversable hyperspace conduit linking distant cosmological coordinates.
// Freestanding gravitational lens caustic (Einstein ring), exotic matter
// stabilization vortex, 3D parallax destination starfield inside throat,
// and cinematic 3D relativistic hyperspace transit.
// ============================================================================
const defaultWormholeTransition = {
	id: "wormhole",

	initInline(portalData) {
		// 1. Destination Universe Starfield (Looking THROUGH the throat)
		portalData.throatStars = [];
		const THROAT_STAR_COUNT = 85;
		const STAR_PALETTE = [
			"#ffffff",
			"#f0f9ff",
			"#e0f2fe",
			"#bae6fd",
			"#38bdf8",
			"#818cf8",
			"#c084fc",
			"#fde047",
		];
		for (let s = 0; s < THROAT_STAR_COUNT; s++) {
			// Distribution inside unit circle
			const r = Math.sqrt(Math.random()) * 0.94;
			const theta = Math.random() * Math.PI * 2;
			portalData.throatStars.push({
				nx: Math.cos(theta) * r,
				ny: Math.sin(theta) * r,
				depth: 0.15 + Math.random() * 0.85, // 3D depth layer
				size: 0.5 + Math.random() * 1.5,
				color: STAR_PALETTE[Math.floor(Math.random() * STAR_PALETTE.length)],
				alpha: 0.35 + Math.random() * 0.65,
				twinkleSpeed: 1.2 + Math.random() * 2.8,
				twinklePhase: Math.random() * Math.PI * 2,
				isCross: Math.random() < 0.18, // Luminous diffraction cross
			});
		}

		// 2. Exotic Negative-Energy Plasma Streamers (Stabilizing the Throat Rim)
		portalData.exoticFilaments = [];
		const FILAMENT_COUNT = 38;
		for (let i = 0; i < FILAMENT_COUNT; i++) {
			const u = Math.random();
			const rRatio = 1.02 + u ** 1.6 * 0.75; // Hugs throat boundary 1.02 R0 to 1.77 R0
			portalData.exoticFilaments.push({
				rRatio,
				angle: Math.random() * Math.PI * 2,
				arcLen: 0.3 + Math.random() * 0.85,
				baseSpeed: (1.8 + Math.random() * 0.8) / rRatio ** 1.4,
				width: 0.8 + Math.random() * 1.6,
				alpha: 0.25 + Math.random() * 0.55,
				isCyan: Math.random() < 0.65,
			});
		}

		// 3. Gravitational Metric Quantum Specks
		portalData.quantumSparks = [];
		for (let d = 0; d < 24; d++) {
			portalData.quantumSparks.push({
				rRatio: 1.1 + Math.random() * 1.5,
				angle: Math.random() * Math.PI * 2,
				speed: 0.45 + Math.random() * 0.5,
				size: 0.7 + Math.random() * 1.2,
				alpha: 0.2 + Math.random() * 0.5,
			});
		}

		// 4. Active Quantum Discharge Micro-Arcs
		portalData.dischargeArcs = [];
		portalData.nextArcTime = 0;

		// 6. Relativistic Keplerian Accretion Disk Bands (Color synced with theme accent)
		portalData.accretionBands = [];
		const ACCRETION_COUNT = 32;
		for (let i = 0; i < ACCRETION_COUNT; i++) {
			const u = Math.random();
			const rRatio = 1.15 + u ** 1.5 * 1.05; // 1.15 R0 to 2.2 R0
			portalData.accretionBands.push({
				rRatio,
				angle: Math.random() * Math.PI * 2,
				arcLen: 0.35 + Math.random() * 0.9,
				speed: (1.6 + Math.random() * 0.8) / rRatio ** 1.5,
				width: 1.0 + Math.random() * 2.2,
				alpha: 0.25 + Math.random() * 0.55,
				isHotCore: rRatio < 1.35,
			});
		}
	},

	renderInline(portalData, time, dt) {
		const {
			ctx,
			width: w,
			height: h,
			chargeProgress,
			mouse,
			throatStars,
			exoticFilaments,
			quantumSparks,
			accretionBands,
		} = portalData;
		if (!ctx || w === 0 || h === 0) return;

		// 1. CLEAR WITH 100% TRANSPARENCY — NO RECTANGULAR BOX BACKGROUND!
		ctx.clearRect(0, 0, w, h);

		// Resolve theme accent color
		if (
			!portalData.accentRgb ||
			(portalData.lastThemeCheck || 0) !== time >> 10
		) {
			portalData.lastThemeCheck = time >> 10;
			const computed = window.getComputedStyle(document.documentElement);
			const rawAccent =
				computed.getPropertyValue("--accent").trim() ||
				window
					.getComputedStyle(document.body)
					.getPropertyValue("--accent")
					.trim() ||
				"#38bdf8";
			portalData.accentRgb = parseRgb(rawAccent);
		}
		const [R, G, B] = portalData.accentRgb || [56, 189, 248];

		// Theme-synchronized Accretion Disk palette
		const R_hot = Math.min(255, Math.round(R * 0.45 + 255 * 0.55));
		const G_hot = Math.min(255, Math.round(G * 0.45 + 255 * 0.55));
		const B_hot = Math.min(255, Math.round(B * 0.45 + 255 * 0.55));
		const R_deep = Math.round(R * 0.65);
		const G_deep = Math.round(G * 0.65);
		const B_deep = Math.round(B * 0.65);

		// Relativistic Accretion Disk orbital geometry
		const DISK_TILT = -0.22; // ~-12.6 deg slant for physical perspective
		const DISK_ASPECT = 0.36; // Foreshortened inclination

		const cx = w / 2;
		const cy = h / 2;
		// Throat radius: unboxed, sits gracefully in center
		const R0 = Math.min(w, h) * 0.29 * (1 + chargeProgress * 0.08);

		// 3D Parallax eye-tilt from mouse
		const mx = mouse?.x || 0;
		const my = mouse?.y || 0;
		// Wormhole mouth center shifts subtly
		const tx = cx + mx * 0.35;
		const ty = cy + my * 0.25;
		// Vanishing point deep inside throat shifts more (perspective depth)
		const vx = tx + mx * 0.85;
		const vy = ty + my * 0.65;

		const boost = 1 + chargeProgress * 3.8;

		// Advance Keplerian Accretion Bands
		if (accretionBands) {
			for (let i = 0; i < accretionBands.length; i++) {
				const b = accretionBands[i];
				b.angle = (b.angle + b.speed * dt * boost) % (Math.PI * 2);
			}
		}

		// -------------------------------------------------------------------------
		// A. EXTERIOR SPACETIME METRIC: GRAVITATIONAL CURVATURE & RIPPLES (r > R0)
		// Fades completely to 0.0 alpha, seamlessly blending into document background
		// -------------------------------------------------------------------------

		// 1. Warped Spacetime Metric Geodesic Rays
		ctx.save();
		const RAY_COUNT = 16;
		for (let a = 0; a < RAY_COUNT; a++) {
			const baseAng = (a / RAY_COUNT) * Math.PI * 2;
			ctx.beginPath();
			for (let step = 0; step <= 16; step++) {
				const frac = step / 16;
				const r = R0 * (1.05 + frac * 1.55);
				// Relativistic frame-dragging twist near throat
				const twist = (1 / (r / R0) ** 1.6) * 0.42;
				const curAng = baseAng + twist;
				const gx = tx + Math.cos(curAng) * r;
				const gy = ty + Math.sin(curAng) * r * 0.94;
				if (step === 0) ctx.moveTo(gx, gy);
				else ctx.lineTo(gx, gy);
			}
			const rayAlpha =
				Math.max(0, 0.09 - a * 0.002) * (1 + chargeProgress * 0.8);
			ctx.strokeStyle = `rgba(${R}, ${G}, ${B}, ${rayAlpha.toFixed(3)})`;
			ctx.lineWidth = 1;
			ctx.stroke();
		}
		ctx.restore();

		// 2. Luminous Gravitational Waves (Expanding Harmonic Ripples)
		const RIPPLE_COUNT = 4;
		for (let i = 0; i < RIPPLE_COUNT; i++) {
			const rPhase =
				(time * 0.00045 * (1 + chargeProgress * 2.2) + i / RIPPLE_COUNT) % 1.0;
			const rippleR = R0 * (1.06 + rPhase * 1.4);
			const rippleAlpha = (1 - rPhase) ** 2 * (0.16 + chargeProgress * 0.35);

			ctx.strokeStyle = `rgba(56, 189, 248, ${rippleAlpha.toFixed(3)})`;
			ctx.lineWidth = 1.2;
			ctx.beginPath();
			ctx.ellipse(tx, ty, rippleR, rippleR * 0.94, 0, 0, Math.PI * 2);
			ctx.stroke();
		}

		// 3. Infalling Quantum Sparks
		if (quantumSparks) {
			for (let i = 0; i < quantumSparks.length; i++) {
				const q = quantumSparks[i];
				q.rRatio -= q.speed * dt * 0.16 * boost;
				if (q.rRatio <= 1.01) {
					q.rRatio = 2.4 + Math.random() * 0.4;
					q.angle = Math.random() * Math.PI * 2;
				}
				q.angle += (1.4 / q.rRatio ** 1.5) * dt * boost;

				const qr = R0 * q.rRatio;
				const qx = tx + Math.cos(q.angle) * qr;
				const qy = ty + Math.sin(q.angle) * qr * 0.94;
				const qAlpha = (
					q.alpha * Math.min(1.0, (q.rRatio - 1.0) / 0.4)
				).toFixed(3);

				ctx.fillStyle = `rgba(224, 242, 254, ${qAlpha})`;
				ctx.beginPath();
				ctx.arc(qx, qy, q.size, 0, Math.PI * 2);
				ctx.fill();
			}
		}

		// 4. Relativistic Exotic Matter Streamers (Coiling Plasma Filaments)
		if (exoticFilaments) {
			for (let i = 0; i < exoticFilaments.length; i++) {
				const f = exoticFilaments[i];
				f.angle += f.baseSpeed * dt * boost;
				const ang = ((f.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
				const r = R0 * f.rRatio;

				// Relativistic Doppler Beaming: Approaching side is brighter & bluer
				const doppler = (Math.cos(ang + Math.PI * 0.65) + 1) / 2;
				const col =
					doppler > 0.45
						? `rgba(224, 242, 254, ${(f.alpha * (0.6 + chargeProgress * 0.4)).toFixed(3)})`
						: `rgba(168, 85, 247, ${(f.alpha * 0.35).toFixed(3)})`;

				ctx.strokeStyle = col;
				ctx.lineWidth = f.width * (1 + chargeProgress * 0.5);
				ctx.beginPath();
				ctx.ellipse(tx, ty, r, r * 0.94, 0, ang, ang + f.arcLen);
				ctx.stroke();
			}
		}

		// 5. Relativistic Keplerian Accretion Torus (Exterior Spacetime r > R0)
		// Clean vector streamlines, caustics, and Doppler beaming hugging r > R0.
		// Protected by donut mask so the celestial throat interior is 100% PRISTINE!
		ctx.save();
		ctx.beginPath();
		// Non-zero winding donut mask: outer canvas rect (CW) + inner throat aperture (CCW)
		ctx.rect(0, 0, w, h);
		ctx.ellipse(tx, ty, R0 * 1.01, R0 * 0.94 * 1.01, 0, 0, Math.PI * 2, true);
		ctx.clip();

		// A. Equatorial Accretion Disk Streamers (Left & Right Wings)
		ctx.save();
		ctx.translate(tx, ty);
		ctx.rotate(DISK_TILT);

		if (accretionBands) {
			for (let i = 0; i < accretionBands.length; i++) {
				const b = accretionBands[i];
				const r = R0 * b.rRatio;
				const midA =
					(((b.angle + b.arcLen * 0.5) % (Math.PI * 2)) + Math.PI * 2) %
					(Math.PI * 2);

				// Relativistic Doppler Beaming: Approaching side (left) is brilliant white-hot
				const doppler = (Math.sin(midA) * 0.25 - Math.cos(midA) * 0.75 + 1) / 2;
				const alpha = Math.min(
					0.85,
					b.alpha * (0.42 + chargeProgress * 0.4) * (0.5 + doppler * 0.9),
				);

				if (doppler > 0.55) {
					ctx.strokeStyle = `rgba(${R_hot}, ${G_hot}, ${B_hot}, ${alpha.toFixed(3)})`;
					ctx.lineWidth = b.width * (1.1 + chargeProgress * 0.5);
					ctx.shadowColor = `rgba(${R}, ${G}, ${B}, 0.7)`;
					ctx.shadowBlur = 6 + chargeProgress * 8;
				} else {
					ctx.strokeStyle = `rgba(${R_deep}, ${G_deep}, ${B_deep}, ${alpha.toFixed(3)})`;
					ctx.lineWidth = b.width;
					ctx.shadowBlur = 0;
				}

				ctx.beginPath();
				ctx.ellipse(0, 0, r, r * DISK_ASPECT, 0, b.angle, b.angle + b.arcLen);
				ctx.stroke();
				ctx.shadowBlur = 0;
			}
		}
		ctx.restore();

		// B. Relativistic Gravitational Lensing Crown Arch (Light bent over top rim)
		ctx.save();
		ctx.strokeStyle = `rgba(${R_hot}, ${G_hot}, ${B_hot}, ${(0.45 + chargeProgress * 0.4).toFixed(2)})`;
		ctx.lineWidth = 2.2 + chargeProgress * 1.4;
		ctx.shadowColor = `rgba(${R}, ${G}, ${B}, 0.85)`;
		ctx.shadowBlur = 10 + chargeProgress * 12;
		ctx.beginPath();
		ctx.ellipse(
			tx,
			ty - R0 * 0.05,
			R0 * 1.15,
			R0 * 0.94 * 0.65,
			DISK_TILT * 0.35,
			Math.PI * 0.94,
			Math.PI * 2.06,
		);
		ctx.stroke();

		// Razor-sharp inner caustic line
		ctx.strokeStyle = `rgba(255, 255, 255, ${(0.8 + chargeProgress * 0.2).toFixed(2)})`;
		ctx.lineWidth = 1.2 + chargeProgress * 0.6;
		ctx.beginPath();
		ctx.ellipse(
			tx,
			ty - R0 * 0.05,
			R0 * 1.11,
			R0 * 0.94 * 0.61,
			DISK_TILT * 0.35,
			Math.PI * 1.02,
			Math.PI * 1.98,
		);
		ctx.stroke();
		ctx.shadowBlur = 0;
		ctx.restore();

		// C. Relativistic Gravitational Lensing Under-Arch (Light bent under bottom rim)
		ctx.save();
		ctx.strokeStyle = `rgba(${R_hot}, ${G_hot}, ${B_hot}, ${(0.38 + chargeProgress * 0.35).toFixed(2)})`;
		ctx.lineWidth = 2.0 + chargeProgress * 1.2;
		ctx.shadowColor = `rgba(${R}, ${G}, ${B}, 0.8)`;
		ctx.shadowBlur = 8 + chargeProgress * 10;
		ctx.beginPath();
		ctx.ellipse(
			tx,
			ty + R0 * 0.05,
			R0 * 1.14,
			R0 * 0.94 * 0.62,
			DISK_TILT * 0.35,
			0.06,
			Math.PI - 0.06,
		);
		ctx.stroke();

		// Razor-sharp inner caustic line
		ctx.strokeStyle = `rgba(255, 255, 255, ${(0.75 + chargeProgress * 0.25).toFixed(2)})`;
		ctx.lineWidth = 1.1 + chargeProgress * 0.5;
		ctx.beginPath();
		ctx.ellipse(
			tx,
			ty + R0 * 0.05,
			R0 * 1.1,
			R0 * 0.94 * 0.58,
			DISK_TILT * 0.35,
			0.12,
			Math.PI - 0.12,
		);
		ctx.stroke();
		ctx.shadowBlur = 0;
		ctx.restore();

		ctx.restore(); // END DONUT MASK (EXTERIOR ACCRETION TORUS)

		// -------------------------------------------------------------------------
		// B. THE THROAT APERTURE: LOOKING DIRECTLY INTO THE DESTINATION UNIVERSE
		// -------------------------------------------------------------------------
		ctx.save();
		ctx.beginPath();
		ctx.ellipse(tx, ty, R0, R0 * 0.94, 0, 0, Math.PI * 2);
		ctx.clip();

		// 1. Deep Celestial Space of Alternate Universe
		const skyGrad = ctx.createRadialGradient(vx, vy, 0, tx, ty, R0);
		skyGrad.addColorStop(0, "rgba(8, 14, 38, 1)");
		skyGrad.addColorStop(0.3, "rgba(5, 8, 24, 1)");
		skyGrad.addColorStop(0.7, "rgba(3, 4, 14, 1)");
		skyGrad.addColorStop(1, "#020308");
		ctx.fillStyle = skyGrad;
		ctx.fillRect(tx - R0 * 1.5, ty - R0 * 1.5, R0 * 3, R0 * 3);

		// 2. Destination Galaxy Nebula Core
		const nebGrad = ctx.createRadialGradient(vx, vy, 0, vx, vy, R0 * 0.75);
		nebGrad.addColorStop(
			0,
			`rgba(56, 189, 248, ${(0.32 + chargeProgress * 0.25).toFixed(2)})`,
		);
		nebGrad.addColorStop(
			0.35,
			`rgba(168, 85, 247, ${(0.22 + chargeProgress * 0.15).toFixed(2)})`,
		);
		nebGrad.addColorStop(0.7, "rgba(30, 27, 75, 0.15)");
		nebGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
		ctx.fillStyle = nebGrad;
		ctx.beginPath();
		ctx.arc(vx, vy, R0 * 0.8, 0, Math.PI * 2);
		ctx.fill();

		// 3. Hyperspace Conduit Geometry Rings (Depth Perspective)
		const TUNNEL_DEPTHS = [0.18, 0.38, 0.6, 0.8, 0.94];
		for (let k = 0; k < TUNNEL_DEPTHS.length; k++) {
			const z = TUNNEL_DEPTHS[k];
			const rz = R0 * (1 - z * 0.88);
			const zx = tx + (vx - tx) * z;
			const zy = ty + (vy - ty) * z;
			const zAlpha = (1 - z) * (0.18 + chargeProgress * 0.4);

			ctx.strokeStyle = `rgba(56, 189, 248, ${zAlpha.toFixed(3)})`;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.ellipse(zx, zy, rz, rz * 0.94, 0, 0, Math.PI * 2);
			ctx.stroke();
		}

		// 4. Destination Universe Starfield with 3D Parallax & Twinkle
		if (throatStars) {
			for (let s = 0; s < throatStars.length; s++) {
				const star = throatStars[s];
				// 3D perspective projection
				const z = star.depth;
				const zScale = 1 - z * 0.75;
				const sx = tx + (vx - tx) * z + star.nx * R0 * zScale;
				const sy = ty + (vy - ty) * z + star.ny * R0 * 0.94 * zScale;

				const tw =
					0.5 +
					0.5 * Math.sin(time * 0.003 * star.twinkleSpeed + star.twinklePhase);
				const _sAlpha = (star.alpha * tw).toFixed(3);

				// If holding/charging: stars streak slightly towards vanishing point
				if (chargeProgress > 0.05) {
					const streakLen = chargeProgress * 12 * (1 - z);
					const dx = (sx - vx) / Math.hypot(sx - vx, sy - vy || 1);
					const dy = (sy - vy) / Math.hypot(sx - vx, sy - vy || 1);
					ctx.strokeStyle = star.color;
					ctx.lineWidth = star.size * 0.8;
					ctx.beginPath();
					ctx.moveTo(sx, sy);
					ctx.lineTo(sx + dx * streakLen, sy + dy * streakLen);
					ctx.stroke();
				} else {
					ctx.fillStyle = star.color;
					ctx.beginPath();
					ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
					ctx.fill();

					// Cross diffraction spikes on luminous foreground stars
					if (star.isCross && star.size > 1.2) {
						ctx.strokeStyle = `rgba(255, 255, 255, ${(star.alpha * tw * 0.7).toFixed(2)})`;
						ctx.lineWidth = 0.8;
						ctx.beginPath();
						ctx.moveTo(sx - 3.5, sy);
						ctx.lineTo(sx + 3.5, sy);
						ctx.moveTo(sx, sy - 3.5);
						ctx.lineTo(sx, sy + 3.5);
						ctx.stroke();
					}
				}
			}
		}

		// 5. Central Exit Beacon / Distant Universe Core
		const beaconR = 3.2 + Math.sin(time * 0.006) * 1.2 + chargeProgress * 5.0;
		ctx.fillStyle = "#ffffff";
		ctx.shadowColor = "#38bdf8";
		ctx.shadowBlur = 14 + chargeProgress * 18;
		ctx.beginPath();
		ctx.arc(vx, vy, beaconR, 0, Math.PI * 2);
		ctx.fill();
		ctx.shadowBlur = 0;

		ctx.restore(); // END THROAT CLIPPING

		// -------------------------------------------------------------------------
		// C. THE EINSTEIN RING & GRAVITATIONAL LENS CAUSTIC (THE THROAT RIM)
		// Multi-pass optical caustic with chromatic aberration and lens flare beads
		// -------------------------------------------------------------------------

		// 1. Chromatic Dispersion Fringe (Cyan outside, Violet inside)
		ctx.save();
		ctx.strokeStyle = `rgba(34, 211, 238, ${(0.45 + chargeProgress * 0.45).toFixed(2)})`;
		ctx.lineWidth = 2.4 + chargeProgress * 1.2;
		ctx.beginPath();
		ctx.ellipse(tx, ty, R0 * 1.015, R0 * 0.94 * 1.015, 0, 0, Math.PI * 2);
		ctx.stroke();

		ctx.strokeStyle = `rgba(168, 85, 247, ${(0.4 + chargeProgress * 0.35).toFixed(2)})`;
		ctx.lineWidth = 1.8;
		ctx.beginPath();
		ctx.ellipse(tx, ty, R0 * 0.985, R0 * 0.94 * 0.985, 0, 0, Math.PI * 2);
		ctx.stroke();

		// 2. Razor-Sharp Brilliant White Photon Sphere Caustic
		ctx.strokeStyle = "rgba(255, 255, 255, 0.98)";
		ctx.lineWidth = 1.8 + chargeProgress * 1.8;
		ctx.shadowColor = `rgba(${R}, ${G}, ${B}, ${(0.85 + chargeProgress * 0.15).toFixed(2)})`;
		ctx.shadowBlur = 12 + chargeProgress * 16;
		ctx.beginPath();
		ctx.ellipse(tx, ty, R0, R0 * 0.94, 0, 0, Math.PI * 2);
		ctx.stroke();
		ctx.shadowBlur = 0;
		ctx.restore();

		// -------------------------------------------------------------------------
		// D. ENERGETIC QUANTUM DISCHARGE ARCS ALONG RIM (WHEN CHARGING)
		// -------------------------------------------------------------------------
		if (chargeProgress > 0.08) {
			if (time > (portalData.nextArcTime || 0)) {
				portalData.nextArcTime = time + 60 + Math.random() * 90;
				const startAng = Math.random() * Math.PI * 2;
				const span = 0.2 + Math.random() * 0.5;
				const arcPts = [];
				const segs = 6;
				for (let s = 0; s <= segs; s++) {
					const a = startAng + (s / segs) * span;
					const jitter = (Math.random() - 0.5) * R0 * 0.08;
					const ar = R0 + jitter;
					arcPts.push({
						x: tx + Math.cos(a) * ar,
						y: ty + Math.sin(a) * ar * 0.94,
					});
				}
				portalData.activeArc = { pts: arcPts, alpha: 0.9 };
			}

			if (portalData.activeArc) {
				const arc = portalData.activeArc;
				arc.alpha -= dt * 4.5;
				if (arc.alpha > 0 && arc.pts.length > 1) {
					ctx.strokeStyle = `rgba(224, 242, 254, ${arc.alpha.toFixed(2)})`;
					ctx.lineWidth = 1.4;
					ctx.beginPath();
					ctx.moveTo(arc.pts[0].x, arc.pts[0].y);
					for (let p = 1; p < arc.pts.length; p++) {
						ctx.lineTo(arc.pts[p].x, arc.pts[p].y);
					}
					ctx.stroke();
				}
			}
		}
	},

	traverse(params) {
		const { slot, flightCanvas, startRect, onComplete } = params;
		const screenW = window.innerWidth;
		const TOPBAR_H = 48;
		const screenH = window.innerHeight - TOPBAR_H;

		// Initial slot setup
		slot.style.position = "fixed";
		slot.style.left = "0px";
		slot.style.top = `${TOPBAR_H}px`;
		slot.style.width = "100vw";
		slot.style.height = `${screenH}px`;
		slot.style.zIndex = "100000";
		slot.style.pointerEvents = "none";
		slot.style.opacity = "0";
		slot.style.transform = "scale(0.88)";
		slot.style.transformOrigin = "center center";

		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		flightCanvas.style.top = `${TOPBAR_H}px`;
		flightCanvas.style.height = `${screenH}px`;
		flightCanvas.width = screenW * dpr;
		flightCanvas.height = screenH * dpr;
		const fCtx = flightCanvas.getContext("2d");
		fCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

		const originX = startRect.left + startRect.width / 2;
		const originY = startRect.top - TOPBAR_H + startRect.height / 2;
		const startRadius = Math.min(startRect.width, startRect.height) * 0.29;

		const targetX = screenW / 2;
		const targetY = screenH / 2;

		// 3D Hyperspace Warp Particles
		const WARP_PARTICLES = 160;
		const warpPool = [];
		for (let i = 0; i < WARP_PARTICLES; i++) {
			const theta = Math.random() * Math.PI * 2;
			const radius =
				Math.min(screenW, screenH) * 0.35 +
				Math.random() * (Math.max(screenW, screenH) * 0.65);
			warpPool.push({
				theta,
				radius,
				z: 0.1 + Math.random() * 6.5,
				speed: 2.2 + Math.random() * 4.8,
				size: 1.0 + Math.random() * 2.2,
				color:
					Math.random() < 0.6
						? "#38bdf8"
						: Math.random() < 0.85
							? "#818cf8"
							: "#ffffff",
			});
		}

		// 3D Hyperspace Cylindrical Conduit Rings
		const RING_COUNT = 16;
		const conduitRings = [];
		for (let r = 0; r < RING_COUNT; r++) {
			conduitRings.push({
				z: (r / RING_COUNT) * 6.0,
			});
		}

		const DURATION = 720; // 720ms: visceral, cinematic, responsive
		const startTime = performance.now();
		let lastStepTime = performance.now();

		const step = (now) => {
			const elapsed = now - startTime;
			const _dt = Math.min(0.05, (now - lastStepTime) / 1000);
			lastStepTime = now;

			const p = Math.min(1.0, elapsed / DURATION);
			const easeP = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;

			fCtx.clearRect(0, 0, screenW, screenH);

			// Current focal center interpolates from freestanding mouth to screen center
			const curX = originX + (targetX - originX) * easeP;
			const curY = originY + (targetY - originY) * easeP;

			// =================================================================
			// STAGE 1: SINGULARITY BREACH & GRAVITATIONAL LENS (p < 0.38)
			// =================================================================
			if (p < 0.38) {
				const p1 = p / 0.38;
				// Expanding throat mouth
				const throatR =
					startRadius +
					(Math.max(screenW, screenH) * 0.95 - startRadius) * p1 ** 2.2;

				// Gravitational darkness envelope
				fCtx.fillStyle = `rgba(2, 4, 12, ${(0.96 * p1).toFixed(3)})`;
				fCtx.fillRect(0, 0, screenW, screenH);

				// Relativistic flare ring expanding outward
				fCtx.strokeStyle = "rgba(255, 255, 255, 0.95)";
				fCtx.lineWidth = 3 * (1 + p1 * 2);
				fCtx.shadowColor = "#38bdf8";
				fCtx.shadowBlur = 18;
				fCtx.beginPath();
				fCtx.arc(curX, curY, throatR, 0, Math.PI * 2);
				fCtx.stroke();
				fCtx.shadowBlur = 0;
			}

			// =================================================================
			// STAGE 2: 3D VOLUMETRIC HYPERSPACE CONDUIT (p in [0.22, 0.85])
			// =================================================================
			if (p >= 0.22) {
				const p2 = (p - 0.22) / 0.78;
				const tunnelAlpha = p < 0.82 ? 1.0 : 1.0 - (p - 0.82) / 0.18;

				fCtx.save();
				fCtx.fillStyle = `rgba(2, 3, 10, ${(0.95 * tunnelAlpha).toFixed(3)})`;
				fCtx.fillRect(0, 0, screenW, screenH);

				fCtx.globalCompositeOperation = "lighter";

				// 1. Perspective Conduit Rings rushing toward camera
				for (let r = 0; r < conduitRings.length; r++) {
					const cr = conduitRings[r];
					cr.z -= 0.08 * (1 + p2 * 6.5);
					if (cr.z <= 0.05) cr.z += 6.0;

					const ringRad = (Math.min(screenW, screenH) * 0.65) / (cr.z + 0.15);
					const ringAlpha =
						Math.sin((cr.z / 6.0) * Math.PI) * 0.45 * tunnelAlpha;

					fCtx.strokeStyle = `rgba(56, 189, 248, ${ringAlpha.toFixed(3)})`;
					fCtx.lineWidth = Math.min(6, 1.2 + (1 / cr.z) * 1.5);
					fCtx.beginPath();
					fCtx.arc(curX, curY, ringRad, 0, Math.PI * 2);
					fCtx.stroke();
				}

				// 2. Relativistic Warp Light Streaks Streaming Past Camera
				for (let i = 0; i < warpPool.length; i++) {
					const wp = warpPool[i];
					wp.z -= 0.12 * (1 + p2 * 8.0);
					if (wp.z <= 0.04) {
						wp.z += 6.5;
						wp.theta = Math.random() * Math.PI * 2;
					}

					const trailZ = wp.z + 0.28 * (1 + p2 * 2.2);

					const headRad = wp.radius / (wp.z + 0.12);
					const tailRad = wp.radius / (trailZ + 0.12);

					const hx = curX + Math.cos(wp.theta) * headRad;
					const hy = curY + Math.sin(wp.theta) * headRad;
					const tx = curX + Math.cos(wp.theta) * tailRad;
					const ty = curY + Math.sin(wp.theta) * tailRad;

					const streakGrad = fCtx.createLinearGradient(tx, ty, hx, hy);
					streakGrad.addColorStop(0, "rgba(56, 189, 248, 0)");
					streakGrad.addColorStop(1, wp.color);

					fCtx.strokeStyle = streakGrad;
					fCtx.lineWidth = Math.min(5, wp.size * (1 + (1 / wp.z) * 0.8));
					fCtx.beginPath();
					fCtx.moveTo(tx, ty);
					fCtx.lineTo(hx, hy);
					fCtx.stroke();
				}

				// 3. Ahead Down the Throat: Destination Exit Mouth Expanding
				const exitProgress = p2 ** 2.2;
				const exitRadius = screenW * 0.8 * exitProgress;
				if (exitRadius > 2) {
					const exitGrad = fCtx.createRadialGradient(
						curX,
						curY,
						0,
						curX,
						curY,
						exitRadius,
					);
					exitGrad.addColorStop(
						0,
						`rgba(240, 249, 255, ${(0.95 * tunnelAlpha).toFixed(2)})`,
					);
					exitGrad.addColorStop(
						0.35,
						`rgba(56, 189, 248, ${(0.8 * tunnelAlpha).toFixed(2)})`,
					);
					exitGrad.addColorStop(
						0.75,
						`rgba(168, 85, 247, ${(0.35 * tunnelAlpha).toFixed(2)})`,
					);
					exitGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

					fCtx.fillStyle = exitGrad;
					fCtx.beginPath();
					fCtx.arc(curX, curY, exitRadius, 0, Math.PI * 2);
					fCtx.fill();
				}

				fCtx.restore();
			}

			// =================================================================
			// STAGE 3: HORIZON BREAKTHROUGH & SIMULATION REVEAL (p > 0.65)
			// =================================================================
			if (p > 0.65) {
				const p3 = (p - 0.65) / 0.35;
				slot.style.opacity = String(p3);
				slot.style.transform = `scale(${(0.88 + p3 * 0.12).toFixed(3)})`;
			}

			if (p < 1.0) {
				requestAnimationFrame(step);
			} else {
				slot.style.opacity = "1";
				slot.style.transform = "none";
				fCtx.clearRect(0, 0, screenW, screenH);
				onComplete();
			}
		};

		requestAnimationFrame(step);
	},

	exit(params) {
		const { slot, flightCanvas, onComplete } = params;
		slot.style.pointerEvents = "none";
		slot.style.opacity = "0";
		slot.style.transform = "";
		if (flightCanvas) {
			const fCtx = flightCanvas.getContext("2d");
			if (fCtx) {
				fCtx.clearRect(0, 0, flightCanvas.width, flightCanvas.height);
			}
		}
		// Instant exit: directly restore page view without jarring reverse animation
		onComplete();
	},
};

bkRegisterWorldTransition("wormhole", defaultWormholeTransition);

// ============================================================================
// TRANSITION 2: 3D BROKEN VOXEL WALL WITH HOLE REVEALING WHAT'S BEHIND
// A physical wall of chunky 3D voxel bricks in running masonry bond, broken
// from between to reveal the glowing digital world behind. Holding breaks
// the wall voxel-by-voxel, expanding the breach into full immersion!
// ============================================================================
// ============================================================================
// TRANSITION 3: RETRO 8-BIT PIXEL MATRIX & WARP
// Stepped pixel frame with de-pixelating mosaic resolution and cyber warp tunnel
// ============================================================================
const pixelGatewayTransition = {
	id: "pixel",

	initInline(portalData) {
		// 8-bit starfield grid coordinates (upper sky)
		portalData.pixelStars = [];
		for (let i = 0; i < 36; i++) {
			portalData.pixelStars.push({
				nx: Math.random(),
				ny: Math.random() * 0.58,
				isCross: Math.random() < 0.25, // 5-pixel cross '+'
				blinkSpeed: 1 + Math.floor(Math.random() * 4),
				phase: Math.floor(Math.random() * 12),
			});
		}

		// Floating 8-bit ambient stardust motes
		portalData.pixelMotes = [];
		for (let m = 0; m < 16; m++) {
			portalData.pixelMotes.push({
				x: Math.random(),
				y: Math.random(),
				speedY: 0.04 + Math.random() * 0.05,
				swaySpeed: 1.5 + Math.random() * 2.0,
				swayAmp: 0.015 + Math.random() * 0.02,
				phase: Math.random() * Math.PI * 2,
				colorIdx: Math.floor(Math.random() * 3),
			});
		}
	},

	renderInline(portalData, time, dt) {
		const {
			ctx,
			width: w,
			height: h,
			chargeProgress,
			pixelStars,
			pixelCubes,
		} = portalData;
		if (!ctx || w === 0 || h === 0) return;

		// 8-bit pixel grid: 6px blocks
		const PX = 6;
		const cols = Math.ceil(w / PX);
		const rows = Math.ceil(h / PX);
		const midC = Math.floor(cols / 2);
		const midR = Math.floor(rows / 2);

		// 8-Bit Retro Palette
		const PALETTE = [
			"#070214", // 0: Deep space
			"#1a0833", // 1: Dark plum
			"#2e0854", // 2: Deep purple
			"#4c0587", // 3: Indigo purple
			"#6b21a8", // 4: Rich violet
			"#9333ea", // 5: Vibrant purple
			"#06b6d4", // 6: Arcade cyan
			"#38bdf8", // 7: Electric blue
			"#4ade80", // 8: 8-bit mint
			"#ffffff", // 9: Pure pixel white
		];

		// 1. Deep 8-bit background
		ctx.fillStyle = PALETTE[0];
		ctx.fillRect(0, 0, w, h);

		// 2. 8-Bit Twinkling Pixel Stars
		if (pixelStars) {
			const tick = Math.floor(time * 0.005);
			for (let i = 0; i < pixelStars.length; i++) {
				const star = pixelStars[i];
				const visible =
					(tick + star.phase) % (star.blinkSpeed * 2) < star.blinkSpeed;
				if (!visible) continue;

				const sx = (star.gx % cols) * PX;
				const sy = (star.gy % rows) * PX;

				ctx.fillStyle = PALETTE[7];
				ctx.fillRect(sx, sy, PX, PX);

				if (star.isCross) {
					ctx.fillStyle = PALETTE[6];
					ctx.fillRect(sx - PX, sy, PX, PX);
					ctx.fillRect(sx + PX, sy, PX, PX);
					ctx.fillRect(sx, sy - PX, PX, PX);
					ctx.fillRect(sx, sy + PX, PX, PX);
				}
			}
		}

		// 3. Central 8-Bit Concentric Stepped Pixel Vortex
		const speedMult = 1 + chargeProgress * 3.5;
		const cycleOffset = Math.floor(time * 0.008 * speedMult);
		const maxDist = Math.floor(Math.min(cols, rows) * 0.42);

		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const dx = c - midC;
				// Aspect foreshortening for 8-bit oval portal
				const dy = Math.floor((r - midR) * 1.5);
				// Stepped diamond-circle distance
				const dist = Math.floor(Math.hypot(dx, dy));

				if (dist > maxDist) continue;

				// In the center: absolute 8-bit black void
				if (dist < 4) {
					ctx.fillStyle = "#000000";
					ctx.fillRect(c * PX, r * PX, PX, PX);
					continue;
				}

				// Palette band
				const band = (dist + cycleOffset) % 6;
				let color = PALETTE[0];

				if (band === 0)
					color = PALETTE[9]; // White pulse
				else if (band === 1)
					color = PALETTE[7]; // Electric cyan
				else if (band === 2)
					color = PALETTE[5]; // Vibrant purple
				else if (band === 3)
					color = PALETTE[3]; // Violet
				else if (band === 4)
					color = PALETTE[2]; // Deep purple
				else color = PALETTE[1];

				// 8-bit checkerboard dither between bands
				if ((c + r) % 2 === 0 && band > 1) {
					color = PALETTE[band];
				}

				ctx.fillStyle = color;
				ctx.fillRect(c * PX, r * PX, PX, PX);
			}
		}

		// 4. Floating 8-Bit Pixel Blocks (stepped pixel cubes)
		if (pixelCubes) {
			for (let i = 0; i < pixelCubes.length; i++) {
				const cube = pixelCubes[i];
				cube.angle += cube.speed * dt * speedMult;
				const curDist = cube.dist * (1 - chargeProgress * 0.3);
				const gx = midC + Math.floor(Math.cos(cube.angle) * curDist);
				const gy = midR + Math.floor(Math.sin(cube.angle) * curDist * 0.55);

				// Draw 8-bit mini voxel (3x3 grid cells)
				const px = gx * PX;
				const py = gy * PX;
				const sz = cube.size * PX;

				// Top highlight
				ctx.fillStyle = PALETTE[8]; // Mint
				ctx.fillRect(px, py - PX, sz, PX);
				// Body
				ctx.fillStyle = PALETTE[6]; // Cyan
				ctx.fillRect(px, py, sz, sz);
				// Shadow
				ctx.fillStyle = PALETTE[2]; // Dark violet
				ctx.fillRect(px + sz - PX, py, PX, sz);
			}
		}

		// 5. Diagonal Subtle Glass Scanline Reflections
		ctx.fillStyle = `rgba(180, 220, 255, ${(0.08 + 0.05 * Math.sin(time * 0.003)).toFixed(2)})`;
		for (let i = 0; i < cols; i += 2) {
			const rx = i * PX;
			const ry1 = ((i * 2 + Math.floor(time * 0.015)) % (rows * 2)) * PX * 0.5;
			if (ry1 < h) {
				ctx.fillRect(rx, ry1, PX * 2, PX);
			}
		}
	},

	traverse(params) {
		const { slot, flightCanvas, startRect, onComplete } = params;
		const screenW = window.innerWidth;
		const TOPBAR_H = 48;
		const screenH = window.innerHeight - TOPBAR_H;

		slot.style.position = "fixed";
		slot.style.left = "0px";
		slot.style.top = `${TOPBAR_H}px`;
		slot.style.width = "100vw";
		slot.style.height = `${screenH}px`;
		slot.style.zIndex = "100000";
		slot.style.pointerEvents = "none";
		slot.style.opacity = "0";

		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		flightCanvas.style.top = `${TOPBAR_H}px`;
		flightCanvas.style.height = `${screenH}px`;
		flightCanvas.width = screenW * dpr;
		flightCanvas.height = screenH * dpr;
		const fCtx = flightCanvas.getContext("2d");
		fCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

		const docElem = document.documentElement;
		const computed = getComputedStyle(docElem);
		const accentHex = computed.getPropertyValue("--accent").trim() || "#10b981";

		const COLS = Math.ceil(screenW / 40);
		const ROWS = Math.ceil(screenH / 40);
		const grid = [];

		const originCol = Math.floor((startRect.left + startRect.width / 2) / 40);
		const originRow = Math.floor(
			(startRect.top - TOPBAR_H + startRect.height / 2) / 40,
		);

		for (let r = 0; r < ROWS; r++) {
			for (let c = 0; c < COLS; c++) {
				const dist = Math.hypot(c - originCol, r - originRow);
				grid.push({
					x: c * 40,
					y: r * 40,
					dist,
					delay: dist * 24 + Math.random() * 60,
				});
			}
		}

		const DURATION = 460;
		const startTime = performance.now();

		const step = (now) => {
			const elapsed = now - startTime;
			const p = Math.min(1.0, elapsed / DURATION);

			fCtx.clearRect(0, 0, screenW, screenH);
			fCtx.fillStyle = "rgba(4, 7, 14, 0.96)";

			for (let i = 0; i < grid.length; i++) {
				const block = grid[i];
				if (elapsed > block.delay) {
					const blockAge = (elapsed - block.delay) / 110;
					const bP = Math.min(1.0, blockAge);
					const bSize = 38 * bP;

					fCtx.fillStyle = bP < 0.65 ? accentHex : "#050811";
					fCtx.fillRect(
						block.x + (40 - bSize) / 2,
						block.y + (40 - bSize) / 2,
						bSize,
						bSize,
					);

					if (bP < 0.9) {
						fCtx.strokeStyle = accentHex;
						fCtx.lineWidth = 1;
						fCtx.strokeRect(
							block.x + (40 - bSize) / 2,
							block.y + (40 - bSize) / 2,
							bSize,
							bSize,
						);
					}
				}
			}

			if (p > 0.6) {
				slot.style.opacity = String((p - 0.6) / 0.4);
			}

			if (p < 1.0) {
				requestAnimationFrame(step);
			} else {
				slot.style.opacity = "1";
				fCtx.clearRect(0, 0, screenW, screenH);
				onComplete();
			}
		};

		requestAnimationFrame(step);
	},

	exit(params) {
		const { slot, flightCanvas, onComplete } = params;
		const screenW = window.innerWidth;
		const TOPBAR_H = 48;
		const screenH = window.innerHeight - TOPBAR_H;

		slot.style.pointerEvents = "none";

		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		flightCanvas.style.top = `${TOPBAR_H}px`;
		flightCanvas.style.height = `${screenH}px`;
		flightCanvas.width = screenW * dpr;
		flightCanvas.height = screenH * dpr;
		const fCtx = flightCanvas.getContext("2d");
		fCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

		const docElem = document.documentElement;
		const computed = getComputedStyle(docElem);
		const accentHex = computed.getPropertyValue("--accent").trim() || "#10b981";

		const DURATION = 320;
		const startTime = performance.now();

		const step = (now) => {
			const elapsed = now - startTime;
			const p = Math.min(1.0, elapsed / DURATION);

			slot.style.opacity = String(1.0 - p);

			fCtx.clearRect(0, 0, screenW, screenH);
			const PIXEL_COUNT = 80;
			for (let i = 0; i < PIXEL_COUNT; i++) {
				const vx = (Math.sin(i * 123 + p * 5) * 0.5 + 0.5) * screenW;
				const vy = (Math.cos(i * 321 + p * 5) * 0.5 + 0.5) * screenH;
				const size = (6 + (i % 8)) * (1 - p);
				fCtx.fillStyle = accentHex;
				fCtx.fillRect(vx, vy, size, size);
			}

			if (p < 1.0) {
				requestAnimationFrame(step);
			} else {
				fCtx.clearRect(0, 0, screenW, screenH);
				onComplete();
			}
		};

		requestAnimationFrame(step);
	},
};

bkRegisterWorldTransition("pixel", pixelGatewayTransition);

// ============================================================================
// CORE RUNTIME: TOPBAR INTEGRATION, ENTER, EXIT, AND INTERACTION CONTROLLER
// ============================================================================

function attachTopbarWorldControls(figure) {
	const breadcrumbs = document.querySelector(".bk-topbar-breadcrumbs");
	if (breadcrumbs && !breadcrumbs.querySelector(".bk-world-crumb-item")) {
		const label =
			figure?.getAttribute("data-world-title") ||
			figure?.querySelector(".bk-world-label")?.textContent?.trim() ||
			figure?.querySelector(".bk-world-top-title")?.textContent?.trim() ||
			"Simulation";
		const activeSection = breadcrumbs.querySelector(
			".bk-topbar-active-section",
		);
		if (!activeSection || activeSection.textContent.trim() !== label) {
			const sep = document.createElement("span");
			sep.className = "bk-topbar-crumb-sep bk-world-crumb-sep";
			sep.textContent = "/";
			const item = document.createElement("span");
			item.className = "bk-topbar-crumb-item bk-world-crumb-item";
			item.textContent = label;
			breadcrumbs.appendChild(sep);
			breadcrumbs.appendChild(item);
		}
	}

	let exitBtn = document.getElementById("bk-world-exit-topbar-btn");
	if (!exitBtn) {
		exitBtn = document.createElement("button");
		exitBtn.id = "bk-world-exit-topbar-btn";
		exitBtn.type = "button";
		exitBtn.className = "bk-icon-btn bk-topbar-btn bk-world-exit-topbar-btn";
		exitBtn.setAttribute("aria-label", "Exit Simulation");
		exitBtn.setAttribute("title", "Exit Simulation (Esc)");
		exitBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg><span class="bk-sr-only">Exit Simulation</span>`;
		exitBtn.addEventListener("click", () => bkExitWorld());
		const themeToggle = document.getElementById("bk-theme-toggle");
		if (themeToggle?.parentElement) {
			themeToggle.parentElement.insertBefore(exitBtn, themeToggle);
		}
	}
	exitBtn.removeAttribute("hidden");
	exitBtn.style.removeProperty("display");
}

function detachTopbarWorldControls() {
	document
		.querySelectorAll(".bk-world-crumb-sep, .bk-world-crumb-item")
		.forEach((el) => {
			el.remove();
		});
	const exitBtn = document.getElementById("bk-world-exit-topbar-btn");
	if (exitBtn) {
		exitBtn.setAttribute("hidden", "");
		exitBtn.style.removeProperty("display");
	}
}

export function bkEnterWorld(figure) {
	if (!figure) return;
	activeWorldFigure = figure;
	figure.classList.add("bk-world--active");
	figure.classList.remove("bk-wormhole--charging");
	figure.style.removeProperty("--charge-p");
	figure.style.transform = "none";
	document.body.style.overflow = "hidden";
	document.body.classList.add("bk-world-immersive");

	attachTopbarWorldControls(figure);

	const fullscreen =
		figure.fullscreenEl || figure.querySelector(".bk-world-fullscreen");
	if (fullscreen) {
		if (fullscreen.parentElement !== document.body) {
			fullscreen.__figure = figure;
			figure.fullscreenEl = fullscreen;
			document.body.appendChild(fullscreen);
		}
		fullscreen.classList.add("bk-world--active");
		fullscreen.setAttribute("aria-hidden", "false");
		const slot = fullscreen.querySelector(".bk-world-frame-slot");
		const template = fullscreen.querySelector(".bk-world-frame-template");
		if (slot && template && slot.children.length === 0) {
			slot.appendChild(template.content.cloneNode(true));
		}

		const iframe = fullscreen.querySelector("iframe");
		if (iframe?.contentWindow) {
			iframe.contentWindow.postMessage({ type: "bk:play" }, "*");
			setTimeout(() => {
				try {
					iframe.contentWindow.focus();
				} catch (_) {}
			}, 100);
		}
	}
}

export function bkExitWorld(figure) {
	const fig =
		figure ||
		activeWorldFigure ||
		document.querySelector("figure.bk-object--world.bk-world--active") ||
		document.querySelector(".bk-world-fullscreen.bk-world--active")?.__figure;

	const fullscreen =
		fig?.fullscreenEl ||
		fig?.querySelector(".bk-world-fullscreen") ||
		document.querySelector(".bk-world-fullscreen.bk-world--active") ||
		document.querySelector(".bk-world-fullscreen.bk-world--flying");

	if (!fullscreen && !fig) return;

	if (document.fullscreenElement) {
		try {
			document.exitFullscreen?.().catch(() => {});
		} catch (_) {}
	}

	const cleanup = () => {
		detachTopbarWorldControls();
		document.body.classList.remove("bk-world-immersive");

		if (fullscreen) {
			fullscreen.classList.remove(
				"bk-world--active",
				"bk-world--flying",
				"bk-world--exiting",
			);
			fullscreen.setAttribute("aria-hidden", "true");
			const slot = fullscreen.querySelector(".bk-world-frame-slot");
			if (slot) {
				slot.innerHTML = "";
				slot.style.cssText = "";
			}
		}

		if (fig) {
			fig.classList.remove(
				"bk-world--active",
				"bk-wormhole--charging",
				"bk-wormhole--traversing",
			);
			fig.style.removeProperty("--charge-p");
			fig.style.transform = "";
			clearGravitationalObjectWarp(fig);
			const portalData = registeredPortals.get(fig);
			if (portalData) {
				portalData.resetHold();
				if (portalData.isVisible) {
					portalData.startLoop();
				}
			}
		}

		document.body.style.overflow = "";
		if (activeWorldFigure === fig || !fig) {
			activeWorldFigure = null;
		}

		try {
			const aperture = fig?.querySelector?.(".bk-world-portal");
			aperture?.focus?.({ preventScroll: true });
		} catch (_) {}
	};

	const transition = resolveTransitionForFigure(fig);
	const portal = fig?.querySelector(".bk-world-portal");
	const slot = fullscreen?.querySelector(".bk-world-frame-slot");
	const flightCanvas = fullscreen?.querySelector(".bk-world-flight-canvas");

	if (
		transition?.exit &&
		portal &&
		slot &&
		flightCanvas &&
		fullscreen.classList.contains("bk-world--active")
	) {
		fullscreen.classList.add("bk-world--flying");
		const endRect = portal.getBoundingClientRect();
		transition.exit({
			fullscreen,
			slot,
			flightCanvas,
			portal,
			endRect,
			onComplete: cleanup,
		});
	} else if (fullscreen?.classList.contains("bk-world--active")) {
		fullscreen.classList.add("bk-world--exiting");
		setTimeout(cleanup, 160);
	} else {
		cleanup();
	}
}

// ============================================================================
// PORTAL SETUP & INTERACTION CONTROLLER
// ============================================================================

function setupWorldPortal(figure) {
	const portal = figure.querySelector(".bk-world-portal");
	const canvas = figure.querySelector(
		".bk-world-canvas, .bk-wormhole-canvas, .bk-pixel-canvas",
	);
	const stage = figure.querySelector(".bk-world-stage");
	const meterProgress = figure.querySelector(".bk-wormhole-rim-progress");

	if (!portal) return;

	const ctx = canvas ? canvas.getContext("2d") : null;
	const _portalType = figure.getAttribute("data-portal") || "minimal";
	const transition = resolveTransitionForFigure(figure);

	const portalData = {
		figure,
		portal,
		canvas,
		ctx,
		stage,
		isVisible: false,
		animId: null,
		rotation: 0,
		chargeProgress: 0,
		targetProgress: 0,
		isHolding: false,
		isTraversing: false,
		traverseStartTime: 0,
		holdStartTime: 0,
		mouse: { x: 0, y: 0, targetX: 0, targetY: 0 },
		width: 0,
		height: 0,
		dpr: 1,
		transition,

		resetHold() {
			this.isHolding = false;
			this.isTraversing = false;
			this.targetProgress = 0;
			this.chargeProgress = 0;
			figure.classList.remove(
				"bk-wormhole--charging",
				"bk-wormhole--traversing",
			);
			figure.style.removeProperty("--charge-p");
			clearGravitationalObjectWarp(figure);
			if (meterProgress) {
				meterProgress.style.strokeDashoffset = RIM_CIRCUMFERENCE.toFixed(2);
			}

			const dialFill = figure.querySelector(".bk-world-hud-dial-fill");
			if (dialFill) dialFill.style.strokeDashoffset = "62.83";

			const hudState = figure.querySelector(".bk-world-charge-state");
			if (hudState) hudState.textContent = "Hold to enter";

			const holdProgress = figure.querySelector(".bk-world-hold-progress");
			if (holdProgress) holdProgress.style.strokeDashoffset = "94.25";

			const holdLabel = figure.querySelector(".bk-world-hold-label");
			if (holdLabel) holdLabel.textContent = "Hold to enter";

			const holdHint = figure.querySelector(".bk-world-hold-hint");
			if (holdHint) holdHint.textContent = "Press & hold";

			const minimalFill = figure.querySelector(".bk-minimal-charge-fill");
			if (minimalFill) minimalFill.style.width = "0%";

			const minimalLabel = figure.querySelector(".bk-minimal-charge-state");
			if (minimalLabel) minimalLabel.textContent = "HOLD TO ENTER";

			const pixelLabel = figure.querySelector(".bk-pixel-charge-state");
			if (pixelLabel) pixelLabel.textContent = "[░░░░░░░░] HOLD TO ENTER";

			const wormholeLabel = figure.querySelector(".bk-wormhole-charge-state");
			if (wormholeLabel) wormholeLabel.textContent = "Hold to enter";

			const wormholeProgress = figure.querySelector(
				".bk-wormhole-rim-progress",
			);
			if (wormholeProgress) wormholeProgress.style.strokeDashoffset = "50.26";
		},

		resize() {
			const rect = portal.getBoundingClientRect();
			if (rect.width === 0 || rect.height === 0) return;
			this.width = rect.width;
			this.height = rect.height;
			this.dpr = Math.min(window.devicePixelRatio || 1, 2);
			if (canvas && ctx) {
				canvas.width = this.width * this.dpr;
				canvas.height = this.height * this.dpr;
				ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
			}
		},

		startLoop() {
			if (this.animId) return;
			this.resize();
			let lastTime = performance.now();

			const loop = (time) => {
				if (!this.isVisible || figure.classList.contains("bk-world--active")) {
					this.animId = null;
					return;
				}

				const dt = Math.min(0.05, (time - lastTime) / 1000);
				lastTime = time;

				this.update(time, dt);
				if (this.transition.renderInline) {
					this.transition.renderInline(this, time, dt);
				}

				this.animId = requestAnimationFrame(loop);
			};

			this.animId = requestAnimationFrame(loop);
		},

		stopLoop() {
			if (this.animId) {
				cancelAnimationFrame(this.animId);
				this.animId = null;
			}
		},

		update(time, dt) {
			this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.1;
			this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.1;

			if (this.isHolding && !this.isTraversing) {
				const elapsed = time - this.holdStartTime;
				const holdDuration = this.transition?.id === "minimal" ? 550 : 880;
				const p = Math.min(1.0, elapsed / holdDuration);
				this.targetProgress = p;
				this.chargeProgress = p;

				if (p >= 1.0) {
					this.initiateTraversal();
				}
			} else if (!this.isTraversing) {
				this.targetProgress = 0;
				this.chargeProgress += (0 - this.chargeProgress) * 0.18;
				if (this.chargeProgress < 0.005) this.chargeProgress = 0;
			}

			if (!this.isTraversing && this.transition?.id === "wormhole") {
				updateGravitationalObjectWarp(figure, this.chargeProgress, time);
			}

			const pVal = this.chargeProgress.toFixed(3);
			figure.style.setProperty("--charge-p", pVal);

			if (meterProgress) {
				const offset = RIM_CIRCUMFERENCE * (1 - this.chargeProgress);
				meterProgress.style.strokeDashoffset = offset.toFixed(2);
			}

			// Update Circular Hold Meter
			const holdProgress = figure.querySelector(".bk-world-hold-progress");
			if (holdProgress) {
				const circ = 94.25;
				holdProgress.style.strokeDashoffset = (
					circ *
					(1 - this.chargeProgress)
				).toFixed(2);
			}

			const holdLabel = figure.querySelector(".bk-world-hold-label");
			const holdHint = figure.querySelector(".bk-world-hold-hint");
			if (holdLabel) {
				if (this.isTraversing) {
					holdLabel.textContent = "Entering...";
					if (holdHint) holdHint.textContent = "Opening world";
				} else if (this.chargeProgress > 0) {
					const pct = Math.round(this.chargeProgress * 100);
					holdLabel.textContent = `Entering • ${pct}%`;
					if (holdHint) holdHint.textContent = "Keep holding";
				} else {
					holdLabel.textContent = "Hold to enter";
					if (holdHint) holdHint.textContent = "Press & hold";
				}
			}

			// Update Precision Glass Dial HUD
			const dialFill = figure.querySelector(".bk-world-hud-dial-fill");
			if (dialFill) {
				const offset = 62.8318 * (1 - this.chargeProgress);
				dialFill.style.strokeDashoffset = offset.toFixed(2);
			}
			const hudState = figure.querySelector(".bk-world-charge-state");
			if (hudState) {
				hudState.textContent = this.isTraversing
					? "Entering..."
					: this.chargeProgress > 0
						? `${Math.round(this.chargeProgress * 100)}%`
						: "Hold to enter";
			}

			const minimalFill = figure.querySelector(".bk-minimal-charge-fill");
			if (minimalFill) {
				minimalFill.style.width = `${Math.round(this.chargeProgress * 100)}%`;
			}
			const minimalLabel = figure.querySelector(".bk-minimal-charge-state");
			if (minimalLabel) {
				minimalLabel.textContent = this.isTraversing
					? "EXPANDING..."
					: this.chargeProgress > 0
						? `HOLDING ${Math.round(this.chargeProgress * 100)}%`
						: "HOLD TO ENTER";
			}

			const pixelLabel = figure.querySelector(".bk-pixel-charge-state");
			if (pixelLabel) {
				const blocks = Math.min(8, Math.floor(this.chargeProgress * 9));
				const bar = `[${"█".repeat(blocks)}${"░".repeat(8 - blocks)}]`;
				pixelLabel.textContent = this.isTraversing
					? `${bar} WARPING...`
					: this.chargeProgress > 0
						? `${bar} INITIALIZING ${Math.round(this.chargeProgress * 100)}%`
						: `${bar} HOLD TO ENTER`;
			}

			const wormholeProgress = figure.querySelector(
				".bk-wormhole-rim-progress",
			);
			if (wormholeProgress) {
				const circ = 50.265;
				wormholeProgress.style.strokeDashoffset = (
					circ *
					(1 - this.chargeProgress)
				).toFixed(2);
			}

			const wormholeLabel = figure.querySelector(".bk-wormhole-charge-state");
			if (wormholeLabel) {
				if (this.isTraversing) {
					wormholeLabel.textContent = "Entering...";
				} else if (this.chargeProgress > 0) {
					const pct = Math.round(this.chargeProgress * 100);
					wormholeLabel.textContent = `Entering • ${pct}%`;
				} else {
					wormholeLabel.textContent = "Hold to enter";
				}
			}

			const rotSpeed = 0.5 + this.chargeProgress * 3.8;
			this.rotation += rotSpeed * dt;
		},

		initiateTraversal() {
			this.isTraversing = true;
			figure.classList.remove("bk-wormhole--charging");
			figure.classList.add("bk-wormhole--traversing");
			figure.style.removeProperty("--charge-p");
			figure.style.transform = "none";
			clearGravitationalObjectWarp(figure);

			if (navigator.vibrate) {
				try {
					navigator.vibrate([30, 50, 100]);
				} catch (_) {}
			}

			const fullscreen =
				figure.fullscreenEl || figure.querySelector(".bk-world-fullscreen");
			if (fullscreen && fullscreen.parentElement !== document.body) {
				fullscreen.__figure = figure;
				figure.fullscreenEl = fullscreen;
				document.body.appendChild(fullscreen);
			}

			const slot = fullscreen?.querySelector(".bk-world-frame-slot");
			const template = fullscreen?.querySelector(".bk-world-frame-template");
			const flightCanvas = fullscreen?.querySelector(".bk-world-flight-canvas");

			if (
				fullscreen &&
				slot &&
				template &&
				flightCanvas &&
				this.transition.traverse
			) {
				fullscreen.setAttribute("aria-hidden", "false");
				fullscreen.classList.add("bk-world--active", "bk-world--flying");
				figure.classList.add("bk-world--active");
				activeWorldFigure = figure;
				document.body.style.overflow = "hidden";
				document.body.classList.add("bk-world-immersive");
				attachTopbarWorldControls(figure);

				if (slot.children.length === 0) {
					slot.appendChild(template.content.cloneNode(true));
				}

				const startRect = portal.getBoundingClientRect();
				this.transition.traverse({
					fullscreen,
					slot,
					flightCanvas,
					portal,
					startRect,
					onComplete: () => {
						slot.style.position = "";
						slot.style.left = "";
						slot.style.top = "";
						slot.style.width = "";
						slot.style.height = "";
						slot.style.zIndex = "";
						slot.style.transform = "";
						slot.style.transformOrigin = "";
						slot.style.clipPath = "";
						slot.style.pointerEvents = "";
						fullscreen.classList.remove("bk-world--flying");
						this.isTraversing = false;
						this.resetHold();

						const iframe = fullscreen.querySelector("iframe");
						if (iframe?.contentWindow) {
							iframe.contentWindow.postMessage({ type: "bk:play" }, "*");
							setTimeout(() => {
								try {
									iframe.contentWindow.focus();
								} catch (_) {}
							}, 60);
						}
					},
				});
			} else {
				bkEnterWorld(figure);
			}
		},
	};

	if (portalData.transition.initInline) {
		portalData.transition.initInline(portalData);
	}

	registeredPortals.set(figure, portalData);

	portal.addEventListener("pointermove", (e) => {
		const rect = portal.getBoundingClientRect();
		const relX = (e.clientX - rect.left) / rect.width - 0.5;
		const relY = (e.clientY - rect.top) / rect.height - 0.5;
		portalData.mouse.targetX = relX * 36;
		portalData.mouse.targetY = relY * 22;
	});

	portal.addEventListener("pointerleave", () => {
		portalData.mouse.targetX = 0;
		portalData.mouse.targetY = 0;
	});

	window.addEventListener("resize", () => {
		portalData.resize();
	});

	window.addEventListener("bk:theme-changed", () => {
		portalData.accentRgb = null;
		portalData.resize();
	});
}

/**
 * Initialize World Portals & Intersection Observer
 */
export function bkInitWorldPortals() {
	if (!worldObserver) {
		worldObserver = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					const portalData = registeredPortals.get(entry.target);
					if (portalData) {
						if (entry.isIntersecting) {
							portalData.isVisible = true;
							portalData.startLoop();
						} else {
							portalData.isVisible = false;
							portalData.stopLoop();
						}
					}
				});
			},
			{ threshold: 0.05, rootMargin: "100px 0px 100px 0px" },
		);

		document.addEventListener("visibilitychange", () => {
			if (document.hidden) {
				registeredPortals.forEach((p) => {
					p.stopLoop();
				});
			} else {
				registeredPortals.forEach((p) => {
					if (p.isVisible) p.startLoop();
				});
			}
		});
	}

	const figures = document.querySelectorAll("figure.bk-object--world");
	figures.forEach((figure) => {
		if (registeredPortals.has(figure)) return;
		setupWorldPortal(figure);
		worldObserver.observe(figure);
	});
}

/**
 * Global event wiring for Hold-to-Enter & Exit
 */
export function bkWireWorldPortals() {
	let _pointerDownTime = 0;

	document.addEventListener("pointerdown", (e) => {
		if (e.button !== 0 && e.pointerType === "mouse") return;

		const target = e.target;
		const portal = target.closest?.(".bk-world-portal");
		if (portal) {
			const figure = portal.closest(".bk-object--world");
			const portalData = registeredPortals.get(figure);
			if (portalData && !portalData.isTraversing) {
				_pointerDownTime = performance.now();
				portalData.isHolding = true;
				portalData.holdStartTime = performance.now();
				figure.classList.add("bk-wormhole--charging");
				portalData.startLoop();
			}
		}
	});

	const releaseHold = () => {
		registeredPortals.forEach((portalData) => {
			if (portalData.isHolding && !portalData.isTraversing) {
				portalData.isHolding = false;
				portalData.figure.classList.remove("bk-wormhole--charging");
				portalData.figure.style.removeProperty("--charge-p");
			}
		});
	};

	document.addEventListener("pointerup", releaseHold);
	document.addEventListener("pointercancel", releaseHold);

	// Action buttons inside world (Exit in topbar or legacy btn)
	document.addEventListener("click", (e) => {
		const target = e.target;
		const exitBtn = target.closest?.(
			".bk-world-exit-btn, #bk-world-exit-topbar-btn, .bk-world-exit-topbar-btn",
		);
		if (exitBtn) {
			e.preventDefault();
			bkExitWorld();
			return;
		}
	});

	// Global key listener: Esc to exit world cleanly from anywhere
	window.addEventListener(
		"keydown",
		(e) => {
			if (e.key === "Escape") {
				const activeFs = document.querySelector(
					".bk-world-fullscreen.bk-world--active, .bk-world-fullscreen.bk-world--flying",
				);
				if (activeFs || activeWorldFigure) {
					e.preventDefault();
					e.stopPropagation();
					bkExitWorld();
				}
				return;
			}
		},
		true,
	);

	// Keyboard accessibility: Hold Space or Enter to charge
	document.addEventListener("keydown", (e) => {
		if (e.key === " " || e.key === "Enter") {
			const focused = document.activeElement?.closest?.(".bk-world-portal");
			if (focused) {
				const figure = focused.closest(".bk-object--world");
				const portalData = registeredPortals.get(figure);
				if (portalData && !portalData.isHolding && !portalData.isTraversing) {
					e.preventDefault();
					portalData.isHolding = true;
					portalData.holdStartTime = performance.now();
					figure.classList.add("bk-wormhole--charging");
					portalData.startLoop();
				}
			}
		}
	});

	document.addEventListener("keyup", (e) => {
		if (e.key === " " || e.key === "Enter") {
			const focused = document.activeElement?.closest?.(".bk-world-portal");
			if (focused) {
				const figure = focused.closest(".bk-object--world");
				const portalData = registeredPortals.get(figure);
				if (portalData?.isHolding && !portalData.isTraversing) {
					e.preventDefault();
					portalData.isHolding = false;
					figure.classList.remove("bk-wormhole--charging");
					figure.style.removeProperty("--charge-p");
				}
			}
		}
	});

	// Window messages from simulation iframe
	window.addEventListener("message", (e) => {
		if (!e.data) return;
		if (e.data.type === "bk:world-exit") {
			bkExitWorld();
		}
	});

	window.addEventListener("bk-page-loaded", () => {
		if (activeWorldFigure) {
			bkExitWorld(activeWorldFigure);
		}
	});
}
