import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { renderSimulationControls } from "../src/renderer/markdown/controls.js";
import { renderTelemetryRows } from "../src/renderer/markdown/telemetry.js";
import { simulationConfigSchema } from "../src/simulation-config.js";

test("inspector groups preserve authored order and escape section names", () => {
 const html = renderSimulationControls({
  props: { model: "air", mass: 1, enabled: true, speed: 2 },
  tunables: {
   model: { type: "text", group: "Model <settings>" },
   mass: { type: "number", group: "Model <settings>" },
   enabled: { type: "boolean" },
   speed: { type: "range", advanced: true, group: "Dynamics" },
  },
 });
 const doc = new JSDOM(html).window.document;
 expect(Array.from(doc.querySelectorAll("legend"), el => el.textContent)).toEqual(["Model <settings>", "Options", "Dynamics"]);
 expect(Array.from(doc.querySelector("fieldset")!.querySelectorAll("[data-bk-prop]"), el => el.getAttribute("data-bk-prop"))).toEqual(["model", "mass"]);
 expect(doc.querySelector("details [data-bk-prop=speed]")).not.toBeNull();
 expect(html).toContain("Model &lt;settings&gt;");
});

test("readouts retain units and descriptions with explicit or automatic presentation", () => {
 const doc = new JSDOM(renderTelemetryRows({
  speed: { label: "Speed", unit: "m/s", display: "metric", description: "Instantaneous <speed>" },
  phase: { label: "Phase", display: "status" },
  count: { label: "Count", display: "row" },
  energy: { label: "Energy" },
 })).window.document;
 expect(doc.querySelector('[data-telemetry-key=speed]')?.getAttribute("data-telemetry-display")).toBe("metric");
 expect(doc.querySelector('.bk-telemetry-description')?.textContent).toBe("Instantaneous <speed>");
 expect(doc.querySelector('.bk-telemetry-unit')?.textContent).toBe("m/s");
 expect(doc.querySelector('[data-telemetry-key=energy]')?.getAttribute("data-telemetry-display")).toBe("auto");
 expect(doc.querySelectorAll('.bk-telemetry-num').length).toBe(4);
});

test("config validates inspector groups and readout presentation", () => {
 expect(simulationConfigSchema.safeParse({props:{mass:1},tunables:{mass:{type:"number",group:"Dynamics"}},telemetry:{speed:{display:"metric"}}}).success).toBe(true);
 expect(simulationConfigSchema.safeParse({telemetry:{speed:{display:"html"}}}).success).toBe(false);
});
