# Ground simulations in lesson context

A simulation is not a generic visualization attached to a lesson. It is one
step in an author's teaching sequence. Its notation, language, defaults, and
interactions must continue that sequence without forcing the learner to
translate between conventions.

## Context discovery order

Gather context in this order:

1. The user's explicit request and corrections.
2. The complete target lesson.
3. The section immediately before and after the embed location.
4. The containing chapter, course index, glossary, and notation reference.
5. Adjacent lessons that introduce prerequisites or consume the result.
6. Existing simulations and exercises in the same project.
7. General domain conventions only when local material is silent.

Do not read an entire large repository without purpose. Start from the target
lesson, follow its links and metadata, and search for the important terms and
symbols it uses.

If the target lesson cannot be identified, ask for its path or content before
building the simulation.

## Produce a context brief

Create this brief in working notes before coding. Keep it available while
reviewing all visible output.

```text
Target lesson:
Embed location:
Learning objective:
What the learner already knows:
What has not been introduced yet:

Terminology:
- exact term -> meaning and forbidden/confusing alternatives

Notation:
- symbol -> exact meaning, unit, valid range, sign/coordinate convention

Formulation:
- equation or rule exactly as taught
- assumptions and approximations

Interaction mapping:
- learner action -> model change -> expected observation

Language and voice:
- preferred phrasing, capitalization, and instruction style

Expected takeaway:
- what the following prose expects the learner to explain

Sources:
- file and section for each non-obvious decision
```

This brief is an implementation aid, not necessarily a new committed file.
Commit it only when the project maintains such design records.

## Preserve the author's conceptual vocabulary

Technical synonyms are often not pedagogical synonyms. Examples:

| Do not casually interchange | Why |
| --- | --- |
| distance / displacement | Scalar path length versus directed change |
| speed / velocity | Scalar versus vector |
| mass / weight | Intrinsic quantity versus force |
| accuracy / precision | Different measurement properties |
| heat / temperature | Energy transfer versus state variable |
| `y = mx + b` / `y = mx + c` | Equivalent convention, different local notation |
| clockwise-positive / counterclockwise-positive | Changes signs and interpretation |

The project may also use deliberately personal names for stages, objects,
operations, or mental models. Preserve them exactly. Do not "correct" them to a
standard textbook term unless the user asks.

## Match formulas and notation

For every formula used by the simulation:

1. Find the formula in the target material.
2. Use the same variables, subscripts, superscripts, coordinate system, and
   rearrangement.
3. Match units and default values.
4. Preserve stated assumptions and approximations.
5. Avoid displaying derived quantities that have not been introduced yet.

Generated mr-md control labels are escaped plain text. Prefer readable Unicode
notation such as:

```text
Initial velocity (v₀)
Angular displacement (θ)
Acceleration (m/s²)
Change in temperature (ΔT)
```

Use lesson Markdown and LaTeX for expressions that cannot be represented
clearly in a short plain-text control label.

Code identifiers may be more implementation-friendly, but keep a clear mapping:

```js
// Lesson notation: initial velocity v₀, measured in m/s.
const initialVelocity = Number(window.__simProps.initialVelocity);
```

## Match the teaching sequence

Read what appears before and after the simulation:

- Before: determines vocabulary, prior knowledge, and permitted controls.
- Simulation: lets the learner manipulate the relationship just introduced.
- After: determines the observation or explanation the simulation must make
  possible.

Do not add every scientifically available parameter. Expose only variables the
lesson is currently teaching or explicitly holding for comparison. Keep fixed
quantities visible in a legend or caption when the learner needs them to reason
about the outcome.

Defaults should reproduce the lesson's worked example when one exists. Reset
should return to that pedagogically meaningful state, not arbitrary round
numbers.

## Resolve conflicts without guessing

Use this precedence:

1. The user's latest explicit clarification.
2. The target lesson at the embed location.
3. A project glossary or notation standard.
4. The containing chapter.
5. Neighboring lessons.
6. General scientific or mathematical convention.

When higher-priority instructions conflict with the target lesson in a way the
learner will notice, ask a focused question instead of silently choosing.

Example:

> The lesson defines clockwise angles as positive, but the requested control
> says counterclockwise-positive. Which convention should the simulation use?

## Context review

Before completion, compare the running simulation against the brief:

- control labels;
- canvas text and legends;
- equations and symbols;
- units and numeric formatting;
- defaults, bounds, and reset state;
- colors or shapes with domain meaning;
- captions and gesture instructions; and
- the causal statement implied by the animation.

Report which source files or lesson sections established non-obvious terms and
model choices.
