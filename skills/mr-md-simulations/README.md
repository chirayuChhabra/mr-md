# mr-md Simulations

An Agent Skill for building context-aware interactive simulations that use the
target lesson's terminology, notation, formulas, and teaching sequence together
with mr-md's generated controls, sandboxed canvas runtime, appearance system,
and lesson authoring syntax. It includes hard visual gates for containment,
contrast, host-control use, modern restrained styling, UI-mode restraint, and
screenshot review.

The skill is useful both to:

- lesson authors creating a simulation and its adjacent `.config.json`; and
- mr-md contributors changing the simulation runtime or UI contract.

Install it from the mr-md repository:

```bash
bunx mr-md skill install
```

The Skills CLI downloads it from GitHub; users do not clone mr-md or add mr-md
as a project dependency. After this one-time agent installation, the normal
lesson workflow remains `bunx mr-md dev .` or `bunx mr-md build .`.

Use `bunx mr-md skill status`, `update`, or `remove` to manage it. The mr-md
command transparently delegates to the open Agent Skills CLI.

The `assets/` directory contains a starting pair that an agent can copy into a
lesson project. It is an example, not another runtime implementation.


The skill covers block experiments, guided steps, host-managed 2D worlds, and
custom Three.js worlds. Copy the matching starter pair from `assets/`.

Install and update both select the source tag matching the running mr-md package
by re-adding that source. Updating an old mr-md package intentionally retains its
compatible skill; run the newer package to select the newer release's skill.
For local unreleased testing, `MR_MD_SKILL_REF` overrides the source ref. Publish
the updated skill in the same Git tag as its matching package release; changing
only this checkout does not update released installations.
