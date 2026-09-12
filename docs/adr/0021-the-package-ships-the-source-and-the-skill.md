# 0021. The package ships the TypeScript source and the skill, and the skill installs from the repository.

Date: 2026-09-11

Status: accepted

## Context

spacequery is a command, not a library.
Node 24 runs TypeScript by type stripping, and every file of spacequery is written for it: `.ts` imports, no enums, no decorators.
The usage documentation is the skill (ADR 0015), and an agent needs it on the machine, not only in the repository.
`gh skill install` reads `skills/*/SKILL.md` from a repository or a local directory and copies it into the agent's skill directory.

## Decision

The npm package ships the source as it is: `cli.ts`, the catalog, the configuration, `core/`, `providers/`, `migrations/`, and `skills/`, with the READMEs, the changelog, and the license.
There is no build output and no `dist/`.
`bin` points at `cli.ts`, and `engines` says Node 24.10 or later.
The skill is installed with `gh skill install` from the repository or from the checkout, and `gh skill publish` marks a version with a GitHub release.
`prepublishOnly` runs the build check and the tests.

## Consequences

`npm install -g spacequery` gives the command and the skill files under `node_modules/spacequery/skills/`; an agent still needs `gh skill install` for the skill to be in its own directory.
A user on Node 22 cannot run the package, and the engines field says so.
The test directory is not in the package.
