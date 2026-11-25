const sky = "#8adaff";
const orange = "#ff884d";

function trajectory(speed) {
	// The launch radius is 1 and the local escape speed is 1, so μ is 1/2.
	const semilatus = 2 * speed * speed;
	const eccentricity = semilatus - 1;
	const points = [];

	for (let step = 0; step <= 360; step += 2) {
		const angle = step * Math.PI / 180;
		const denominator = 1 + eccentricity * Math.cos(angle);
		const radius = semilatus / denominator;
		if (denominator <= 0 || radius > 3) break;
		points.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
	}
	return points;
}

function drawMap(canvas, points, progress) {
	const context = canvas.getContext("2d");
	const { width, height } = canvas.getBoundingClientRect();
	const pixelRatio = window.devicePixelRatio || 1;
	const pixelWidth = Math.round(width * pixelRatio);
	const pixelHeight = Math.round(height * pixelRatio);
	if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
	if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
	context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

	const originX = width / 2;
	const originY = height / 2;
	const radius = Math.min(width, height) / 6.6;
	const screen = ([x, y]) => [originX + x * radius, originY - y * radius];
	context.fillStyle = "#070d1c";
	context.fillRect(0, 0, width, height);
	for (let dot = 0; dot < 92; dot++) {
		const x = ((dot * 739) % 997) * width / 997;
		const y = ((dot * 431) % 991) * height / 991;
		context.fillStyle = dot % 7 === 0 ? "#496681" : "#233852";
		context.fillRect(x, y, dot % 7 === 0 ? 2 : 1, 1);
	}

	context.strokeStyle = "#243653";
	context.lineWidth = 1;
	context.beginPath();
	context.moveTo(0, originY);
	context.lineTo(width, originY);
	context.moveTo(originX, 0);
	context.lineTo(originX, height);
	context.stroke();
	for (let ring = 1; ring <= 3; ring++) {
		context.beginPath();
		context.arc(originX, originY, radius * ring, 0, Math.PI * 2);
		context.stroke();
	}

	const globeRadius = radius * .38;
	const globe = context.createRadialGradient(
		originX - globeRadius * .38, originY - globeRadius * .45, 0,
		originX, originY, globeRadius,
	);
	globe.addColorStop(0, "#59caff");
	globe.addColorStop(.55, "#1f70aa");
	globe.addColorStop(1, "#102948");
	context.fillStyle = globe;
	context.strokeStyle = "#6dbce7";
	context.beginPath();
	context.arc(originX, originY, globeRadius, 0, Math.PI * 2);
	context.fill();
	context.stroke();

	function trace(length, color, dash) {
		context.setLineDash(dash);
		context.strokeStyle = color;
		context.lineWidth = 2;
		context.beginPath();
		context.moveTo(...screen(points[0]));
		for (let index = 1; index < length; index++) {
			context.lineTo(...screen(points[index]));
		}
		context.stroke();
		context.setLineDash([]);
	}
	const visiblePoints = 1 + Math.floor((points.length - 1) * progress);
	trace(points.length, orange, [5, 6]);
	trace(visiblePoints, sky, []);

	const [shipX, shipY] = screen(points[visiblePoints - 1]);
	context.fillStyle = progress ? sky : orange;
	context.beginPath();
	context.moveTo(shipX, shipY - 6);
	context.lineTo(shipX + 5, shipY);
	context.lineTo(shipX, shipY + 6);
	context.lineTo(shipX - 5, shipY);
	context.closePath();
	context.fill();
}

for (const deck of document.querySelectorAll("[data-flight-deck]")) {
	const canvas = deck.querySelector("canvas");
	const speed = deck.querySelector("input");
	const output = deck.querySelector("[data-speed-readout]");
	const launch = deck.querySelector("[data-fire-burn]");
	const reset = deck.querySelector("[data-reset-burn]");
	const status = deck.querySelector("[data-burn-result]");
	const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
	let points;
	let progress = 0;
	let frame = 0;

	function draw() {
		drawMap(canvas, points, progress);
	}

	function ready() {
		cancelAnimationFrame(frame);
		launch.disabled = false;
		progress = 0;
		const value = speed.valueAsNumber;
		points = trajectory(value);
		output.value = value.toFixed(2) + "×";
		speed.setAttribute("aria-valuetext", value.toFixed(2) + " times local escape speed");
		status.textContent = "Ready to fire.";
		draw();
	}

	speed.addEventListener("input", ready);
	reset.addEventListener("click", () => {
		speed.value = speed.defaultValue;
		ready();
	});
	launch.addEventListener("click", () => {
		const escapes = speed.valueAsNumber >= 1;
		status.textContent = "Burn in progress.";
		launch.disabled = true;
		const startedAt = performance.now();

		function advance(now) {
			progress = motion.matches ? 1 : Math.min((now - startedAt) / 1500, 1);
			draw();
			if (progress < 1) {
				frame = requestAnimationFrame(advance);
				return;
			}
			status.textContent = escapes ? "Escapes." : "Stays in orbit.";
			launch.disabled = false;
		}

		frame = requestAnimationFrame(advance);
	});

	ready();
	new ResizeObserver(draw).observe(canvas);
}
