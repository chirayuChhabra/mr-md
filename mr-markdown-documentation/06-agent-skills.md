---
index: 6
title: Agent Skills
slug: agent-skills
---

# Agent Skills

`mr-md` includes a skill system that enables AI coding agents to generate high-quality, context-aware interactive simulations for your lessons.

## What is an Agent Skill?

An agent skill is a structured set of instructions, references, and templates that AI coding assistants (like GitHub Copilot, Cursor, or Antigravity) can use to understand how to work with a framework. The `mr-md` simulation skill teaches agents about the runtime API, theme system, canvas lifecycle, and visual quality standards.

## Installing the Skill

Use the `mr-md` CLI to install the simulation skill globally for your coding agents:

```bash
bunx mr-md skill install
```

The CLI will prompt you to select which coding agents to configure.

## Managing the Skill

| Command | Description |
|---------|-------------|
| `bunx mr-md skill install` | Install the simulation skill globally |
| `bunx mr-md skill update` | Update to the latest version of the skill |
| `bunx mr-md skill status` | Show installation info, version, and configured agents |
| `bunx mr-md skill remove` | Uninstall the skill |

## What the Skill Teaches Agents

Once installed, AI agents understand how to:

- Use `bkSetup()`, `bkColor()`, `bkCanvasPoint()`, and `bkFitCanvas()` correctly
- Read and respond to `window.__simProps` from `.config.json` controls
- Respect the host theme system and sync colors via `bk:theme-sync` messages
- Scale canvases properly with DPI-aware rendering
- Ground simulation content (labels, notation, units) in the lesson material being taught
- Avoid common quality issues: clipping, unreadable contrast, duplicated controls

## Quality Gates

The skill includes built-in quality gates that agents check before considering a simulation complete:

1. **No clipping** — the simulation must be fully visible without overflow
2. **Readable contrast** — all text must be legible in both light and dark themes
3. **No duplicated UI** — controls defined in `.config.json` must not be recreated inside the canvas
4. **Context grounding** — labels, units, and notation must match the surrounding lesson
5. **Responsive sizing** — the canvas must fit within the `mr-md` layout container

> [!tip]
> After installing the skill, try asking your AI agent: "Create an interactive simulation for this lesson that visualizes [concept]." The agent will use the skill to produce a simulation that integrates seamlessly with your `mr-md` project.
