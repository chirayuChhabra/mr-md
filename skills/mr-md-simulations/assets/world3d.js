// Minimal custom-renderer lifecycle example; replace the solid with lesson content.
window.bkSetupCalled = true;
const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 0, 5);
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshBasicMaterial();
const solid = new THREE.Mesh(geometry, material);
scene.add(solid);
let playing = false, frame = null, previous = performance.now();
function draw() {
  renderer.setClearColor(window.bkColor("bg"));
  material.color.set(window.bkColor("accent"));
  renderer.render(scene, camera);
}
function resize() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
  camera.updateProjectionMatrix();
  draw();
}
function stop() {
  playing = false;
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
}
function tick(now) {
  frame = null;
  if (!playing) return;
  solid.rotation.y += Math.min(0.05, Math.max(0, (now - previous) / 1000));
  previous = now;
  draw();
  frame = requestAnimationFrame(tick);
}
function start() {
  if (playing) return;
  playing = true; previous = performance.now();
  frame = requestAnimationFrame(tick);
}
window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  if (event.data?.type === "bk:play") start();
  if (event.data?.type === "bk:pause") stop();
});
window.addEventListener("resize", resize);
window.addEventListener("bk:theme-changed", draw);
window.addEventListener("pagehide", () => {
  stop(); geometry.dispose(); material.dispose(); renderer.dispose();
});
resize();
// The iframe is mounted only on world entry; do not depend on an early play message.
start();
