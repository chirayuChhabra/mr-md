# Damped spring oscillator

A spring pulls a mass toward equilibrium while damping opposes its motion. The total force is $F=-kx-cv$: $x$ is signed displacement from equilibrium in metres, $v$ is velocity in metres per second, $k$ is spring stiffness, and $c$ is the damping coefficient. Positive displacement and velocity point right.

Drag the mass to stretch or compress the spring, then release it. You can also focus the scene and use the left and right arrow keys. Change mass, stiffness, or damping while it moves and compare the measurements over time. Mechanical energy combines spring potential energy and kinetic energy; damping removes energy from this model.

![Explore a damped spring oscillator](./spring.js)

Dragging does work on the mass. Changing mass or spring stiffness changes the
model's mechanical energy; damping removes energy during free motion. Select
measurements to keep their spatial guides visible across resets.

The initial scene guides and graph windows are configured in `spring.config.json`.
The velocity graph compares velocity with displacement; the other graphs use
elapsed time. Routine equilibrium crossings stay in Timeline without a toast.
Notifications are reserved for a large restoring force and nearly settled motion.


## Try another outcome from the same state

Open the lab and let the mass oscillate. Save a snapshot near an equilibrium
crossing using the Capture snapshot button, then let the trial continue. In
Timeline, click that saved node. The mass returns to its saved displacement,
velocity, and elapsed time, and the scene displays a snapshot viewing cue.

- **To return without branching**: Click **Back to live** in the Timeline panel.
  The simulation returns to the present moment without altering history.
- **To branch from an earlier ancestor**: Increase damping, adjust stiffness, drag the
  mass, or click Resume. Modifying an earlier milestone creates a new branch
  rail automatically. The original future remains on its own rail; click any of
  its milestones to revisit it.
- **To extend the active head**: If you inspect the latest snapshot of the current
  run and resume or interact, playback continues along the existing branch
  without creating unnecessary branch rails.

Students can predict whether stronger damping changes the rate of energy loss,
then test that prediction from the exact same initial state. Authors can use a saved
crossing as a discussion point: the mass has nearly zero displacement but can
still have substantial kinetic energy.
