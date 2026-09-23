# mr-md Agent Skills

This directory contains Agent Skills maintained with mr-md. Keeping these
skills in the main repository lets their instructions evolve with the runtime
and documentation they describe.

## Available skills

- `mr-md-simulations`: create, integrate, debug, and review context-aware
  interactive simulations grounded in each lesson's terminology, notation, and
  teaching sequence.

## Install

Agent Skills and the mr-md CLI use separate distribution channels:

- `bunx mr-md ...` downloads and runs the published npm CLI.
- `bunx skills add ...` teaches a compatible coding agent about mr-md.

Users do not clone the mr-md source repository for either workflow. The Skills
CLI fetches the skill directly from the public GitHub repository.

Install the skill once at user level:

```bash
bunx mr-md skill install
```

Then use mr-md normally in any lesson directory:

```bash
bunx mr-md dev .
bunx mr-md build .
```

Check the installed skill version or update it with:

```bash
bunx mr-md skill status
bunx mr-md skill update
```

`mr-md skill` delegates to the open Agent Skills CLI. The equivalent direct
installation is:

```bash
bunx skills add chirayuChhabra/mr-md --skill mr-md-simulations --global
```

During development of the skill itself, maintainers can install directly from
this checkout:

```bash
bunx skills add ./skills/mr-md-simulations --global
```

Omit `--global` only when deliberately committing an agent-specific,
project-local installation for a team.

## Publish

There is no separate package publication step. Merge the skill into the public
mr-md GitHub repository and users can install it with the command above. The
skill does not need to be included in mr-md's npm package because the Skills CLI
uses the GitHub repository as its source.

