# panoram

panoram answers questions about one developer's machine: which coding agents run where and what they do, which repositories are dirty, which worktrees have nobody in them, which sessions sit idle, which tool versions a repository activates.
It is a query layer with no data of its own.
Each call observes the providers at that moment, joins them in an in-memory SQLite database, and prints rows.
It is written for a coding agent that reads a skill, and for the human who works beside it.

```sh
node cli.ts in-dir --tsv
node cli.ts agents-with-sessions
node cli.ts --help
```

## Requirements

Node 24.10 or later, because the build and the ad hoc resolver use `setAuthorizer` of node:sqlite.
On `PATH`: `herdr`, `git`, `ghq`, `mise`, `gh` (logged in), `lsof`, and `bd` for beads rows.
Headsign rows need no command on `PATH`.
The session provider reads the records under `~/.claude` and `~/.codex`; the join between a pane and a session needs herdr's Claude Code and Codex integrations.
A provider that is missing gives an empty table and a `providers` row that says so.

## Install

```sh
npm install
npm link
panoram --help
```

`npm link` puts the `panoram` command on the PATH of the current Node; without it, `node cli.ts <query>` from the checkout does the same.

## Read next

The usage documentation is a skill, written for an agent first: [skills/panoram/SKILL.md](skills/panoram/SKILL.md) is the workflow, and its references hold the rules.
Point AGENTS.md of a project at it.

| To | Read |
|---|---|
| choose a query; the workflow before you act in a repository | [SKILL.md](skills/panoram/SKILL.md) |
| every query, its parameters, and its columns | [queries.md](skills/panoram/references/queries.md) |
| the JSON envelope, `providers`, the flags, `me`, the exit codes | [output.md](skills/panoram/references/output.md) |
| the tables each provider fills, for your own statements | [tables.md](skills/panoram/references/tables.md) |
| add a named query as one SQL file | [user-queries.md](skills/panoram/references/user-queries.md) |

## Design

The design decisions are in [docs/](docs/README.md), one ADR each, with the measurements they rest on.
A provider is one solarsql module that owns its tables; the report module holds every join.

## License

MIT
