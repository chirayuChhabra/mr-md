window.bkSetup((context, width, height) => {
	context.fillStyle = window.bkColor("bg");
	context.fillRect(0, 0, width, height);
	context.strokeStyle = window.bkColor("line-strong");
	context.lineWidth = 2;
	context.beginPath();
	context.moveTo(width * 0.15, height * 0.5);
	context.lineTo(width * 0.85, height * 0.5);
	context.stroke();
	const position = Number(window.__simProps.position ?? 50) / 100;
	context.fillStyle = window.bkColor("accent");
	context.beginPath();
	context.arc(width * (0.15 + position * 0.7), height * 0.5, 18, 0, Math.PI * 2);
	context.fill();
	context.fillStyle = window.bkColor("text");
	context.font = "20px sans-serif";
	context.textAlign = "center";
	context.fillText(`Position: ${Math.round(position * 100)}%`, width * 0.5, height * 0.75);
}, { width: 800, height: 360 });
