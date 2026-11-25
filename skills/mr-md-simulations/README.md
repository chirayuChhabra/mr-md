# mr-md Simulations

An Agent Skill for building context-aware interactive simulations that use the
target lesson's terminology, notation, formulas, and teaching sequence together
with mr-md's generated controls, sandboxed canvas runtime, appearance system,
and lesson authoring syntax. It covers measurement graphs, scene guides, exact
saved moments, responsive workspaces, and chapter rendering with Blog Kit.

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

Use `bunx mr-md skill status` to inspect the installation. The mr-md
command transparently delegates to the open Agent Skills CLI.

Copy the matching starter pair from `assets/` for a block experiment, guided
steps, a host-managed 2D world, or a custom Three.js world.

Install selects the source tag matching the running mr-md package. Run install
with the desired package version to select its compatible skill.
For local unreleased testing, `MR_MD_SKILL_REF` overrides the source ref. Publish
the updated skill in the same Git tag as its matching package release; changing
only this checkout does not update released installations.
