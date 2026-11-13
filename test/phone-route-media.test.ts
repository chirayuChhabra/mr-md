import { expect, test } from "bun:test";
import { phoneRouteFromHtml } from "../src/renderer/phone-app.js";

test("phone routes preserve video embeds while removing simulation runtimes", () => {
 const route = phoneRouteFromHtml(`<nav class="bk-nav"></nav><main class="bk-main">
 <figure class="bk-object"><div class="bk-embed-frame"><iframe title="Lesson video" src="https://www.youtube-nocookie.com/embed/example" loading="lazy"></iframe></div></figure>
 <figure class="bk-object"><div class="bk-phone-sim-notice">Open on desktop</div><div class="bk-embed-interactive"><iframe src="simulation.html"></iframe></div></figure>
 <iframe srcdoc="executable simulation"></iframe>
 </main>`, "Lesson", false);
 expect(route.main).toContain('title="Lesson video"');
 expect(route.main).toContain("https://www.youtube-nocookie.com/embed/example");
 expect(route.main).toContain("Open on desktop");
 expect(route.main).not.toContain("simulation.html");
 expect(route.main).not.toContain("executable simulation");
});
