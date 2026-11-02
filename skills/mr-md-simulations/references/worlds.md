# Immersive worlds and custom renderers

Configure `type: "world"` explicitly. `portal` supports `minimal` (default),
`wormhole`, and `pixel`. The host supplies the portal, hold-to-enter transition,
immersive container, and exit navigation. Use `.world()` in builder lessons.
Copy `assets/world.js` and its config for the host-managed 2D path.

## Host-managed 2D

Use `bkSetupWorld((ctx, world) => ...)`, never `bkSetup`. The context already has
DPR, viewport-center translation, camera translation, and zoom applied. Draw
world objects directly in world coordinates; do not apply the camera twice.
`world.width/height` are viewport dimensions, not fixed logical scene dimensions.
The host owns drag pan, cursor-centered wheel zoom, and WASD/arrow navigation.

`bkWorld.toWorld(clientX, clientY)` and `.toScreen(x, y)` convert iframe-local
viewport and world coordinates. Camera x/y are screen translation offsets;
zoom scales world units. Use `resetCamera()` and `setCamera(x, y, zoom)` rather
than inventing a second camera controller. Avoid gesture conflicts with picking
and dragging. World-space objects may leave the viewport; keep essential labels
and navigation overlays inside usable screen-space bounds. The 6% fixed-diagram
inset is not a bound on the explorable world.

## Custom WebGL / Three.js

Copy `assets/world3d.js` and its config for a minimal Three.js lifecycle
example. It requires network access for its pinned dependency.
The solar-system example uses a custom renderer; it is not a `bkSetupWorld`
template. Inspect its script, config, assets, and dependencies together. The 2D
camera helpers do not manage a Three.js camera.

A custom renderer owns one animation loop, resize/DPR, projection updates, and
paused redraws. Prevent the fallback canvas fitter by setting
`window.bkSetupCalled = true` when taking ownership. Use public theme helpers and
handle `bk:theme-changed`; render a paused frame after appearance/size changes.
Observe parent `bk:play`/`bk:pause` messages with a parent-source check. Clamp
elapsed time on resume. Do not run both a host loop and a custom loop.

The current host creates the world iframe on entry and removes it on exit;
re-entry starts a new instance. Do not promise state persistence across exits.
Pause sound and ongoing work on deactivation; release renderer resources when
tearing down a custom scene. Do not rely exclusively on `bk:world-enter/exit`
events: inspect the actual host message path for the checked-out version.

Worlds do not render the standard generated tunable panel. A world may provide
necessary scene navigation such as search, destinations, camera controls, and
sound toggles inside its iframe. Keep these keyboard accessible, responsive,
and consistent with live host appearance. Avoid duplicating the host exit UI or
adding a second controller for the same gesture. Block/steps rules prohibiting
parallel forms do not prohibit world navigation.

Dependencies load before the script. Check external library, texture, font,
and audio URLs separately: a successful HTML build does not prove offline
operation. Handle failed loads visibly and state network requirements. Keep
narration and sound opt-in where browser playback requires user interaction.

## Verify

Test portal hold and cancellation with pointer and keyboard, each selected portal
style, enter, resize, close, Escape, browser Back, and re-entry. Check that the
lesson scroll/navigation returns correctly and no audio or rendering survives
exit. Verify pan, zoom, camera reset, picking, keyboard focus, touch behavior,
search if present, theme/palette/UI changes, console errors, and asset failures.
For 3D, check camera aspect, pixel ratio, WebGL failure, and render cost. Report
which states were actually inspected; build-only verification is insufficient.

Source: `src/renderer/blocks/world.ts`, `iframe.ts`, `src/client/world.ts`,
`test/world-navigation.test.ts`, and documentation `sims/minimal.world.js` and
`sims/solarsystem.world.js`.
