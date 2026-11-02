---
index: 6
title: Agent Skills
slug: agent-skills
description: Give coding agents the context and tools to build mr-md simulations.
author: Mr-Md Team
tags: [ai-agents, llm, simulations, automation]
---

# Agent Skills

Create a simulation for your lesson with the mr-md simulation skill. Start by installing it for your coding agent:

```bash
bunx mr-md skill install
```

Select your agent when prompted, then ask it to create a simulation. For example:

> “Create an interactive simulation for this lesson that lets learners explore how changing the initial velocity affects a trajectory.”

Point your agent to the lesson and any relevant course material. The skill provides the instructions, references, and starting points it needs to build simulations in all three formats: **blocks**, **steps**, and immersive **worlds**. It guides the agent to match the lesson's content and review the result.

## The details

The install command delegates to the Agent Skills CLI, which prompts you to select agents. You do not need to clone mr-md or add it as a project dependency to install the skill.

| Command | Purpose |
| --- | --- |
| `bunx mr-md skill install` | Install for selected agents. |
| `bunx mr-md skill status` | Show the installed skill and its source and targets. |

Install selects the source tag matching the mr-md package version running the command. When you change mr-md versions, run install with that version to select its matching skill. For testing an unreleased version, set `MR_MD_SKILL_REF` to the source ref.

## What the skill covers

The skill guides an agent through choosing a presentation and renderer before implementation:

- **Block simulations:** bounded experiments and diagrams with host-managed controls.
- **Steps simulations:** guided goals, instructions, hints, resets, and completion feedback.
- **Worlds:** immersive scenes in 2D with `bkSetupWorld`, or 3D with a custom renderer such as Three.js.

It includes starter files and references for each format, the runtime and UI, visual quality, context grounding, and review. The agent should check the installed framework's implementation when the runtime contract is in doubt.

## How it works with your lesson

The skill asks the agent to read the lesson and surrounding course material, identify the learning objective, and preserve the lesson's terminology, notation, formulas, units, and teaching sequence. It guides the agent to use the appropriate configuration, theme tokens, canvas helpers, and lifecycle APIs.

It also asks for visual and interactive review: check containment, contrast, responsive sizing, controls, and the simulation's behavior in the lesson. A successful build alone does not establish visual quality or scientific correctness. Review the result yourself, especially the model and its assumptions.

See [Creating Simulations](./creating-simulations.html) for the authoring formats and runtime examples.
