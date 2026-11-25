import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./simulation.css", import.meta.url), "utf8");
const js = readFileSync(new URL("./simulation-client.js", import.meta.url), "utf8");

export default {
	render({ block }) {
		const speed = Number(block.props?.speed);
		const initial = speed >= 0.75 && speed <= 1.25 ? speed.toFixed(2) : "0.85";
		return {
			css,
			js,
			navItems: [{ id: "flight-deck", label: "Flight deck", kind: "simulation" }],
			html: `<section class="flight-deck" id="flight-deck" data-flight-deck aria-labelledby="flight-deck-title">
				<header class="flight-deck-bar">
					<h3 id="flight-deck-title">Flight deck</h3>
					<span><i aria-hidden="true"></i> Orbit plot online</span>
				</header>
				<div class="flight-deck-body">
					<figure class="flight-map">
						<canvas aria-hidden="true"></canvas>
						<figcaption><span>Trajectory projection</span><span>Top-down · 3 launch radii</span></figcaption>
					</figure>
					<div class="flight-controls">
						<div>
							<label for="mission-speed">Burn speed</label>
							<output for="mission-speed" data-speed-readout>${initial}×</output>
							<input id="mission-speed" type="range" min="0.75" max="1.25" step="0.01" value="${initial}" aria-describedby="mission-speed-units">
							<div class="flight-scale" aria-hidden="true"><span>0.75×</span><span>1.00×</span><span>1.25×</span></div>
							<p id="mission-speed-units">Set the speed after the burn. 1.00× is the local escape speed.</p>
						</div>
						<button type="button" data-fire-burn>Fire burn <span aria-hidden="true">↗</span></button>
						<button type="button" data-reset-burn>Reset</button>
						<p class="flight-result" role="status" data-burn-result>Ready to fire.</p>
					</div>
				</div>
			</section>`,
		};
	},
};
