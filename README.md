# ⛰️ panoram

[日本語](README.ja.md)

panoram answers questions about one developer's machine: which coding agents run where and what they do, which repositories are dirty, which worktrees have nobody in them, which sessions sit idle, which tool versions a repository activates.
It is a query layer with no data of its own.
Each call observes the providers at that moment, joins them in an in-memory SQLite database, and prints rows.
It is written for a coding agent that reads a skill, and for the human who works beside it.

```sh
panoram in-dir --tsv
panoram agents-with-sessions
panoram --help
```

## Why panoram

**It answers questions that cross tools.** herdr knows which pane runs an agent, git knows which checkout is dirty, and gh knows which branch has failing checks; none of them can say "an agent works on a branch whose checks fail". panoram joins their records on one key, the repository root, so `failing-checks-with-agents`, `agents-in-dirty-repos`, `idle-worktrees`, and `sessions-without-pane` are one query each.

**It answers for the agent that asks.** The command resolves the caller's own pane from the environment and leaves it out, so `panoram in-dir --tsv` from the repository an agent sits in reads as "who else is here". The skill, not the README, is the documentation an agent reads first.

**Every answer is the present, and it says what it could not see.** Each call builds a fresh in-memory database and keeps no cache. The `providers` rows of the envelope carry `ok`, `observed_at`, and the error of every provider the query touched, so empty rows next to `ok` 0 mean "unknown", not "none". Sessions are observed, not searched: live processes only, the last 8 KB of a transcript, never the gigabyte of history.

**A question pays only for what it reads.** The tables a statement reads decide which providers run. `dirty` runs git on the repositories that have an agent and nothing else; `review-requests` runs one GitHub search and no `git status`. Ad hoc SQL through `--sql`, and a SQL file of your own under `~/.config/panoram/queries/`, resolve the same way and appear in `--help`.

**The shape of every row is a type, and the tables are documented for your own questions.** Each provider is one solarsql module that owns its tables, and the report module holds every join. The build asks SQLite for the type of every column and refuses a query that reaches into another module's tables. The tables and their columns are in [tables.md](skills/panoram/references/tables.md), so a new question is one SQL file, not a change to panoram.

**What it is not.** Not a dashboard: each call prints rows and exits. Not an actions tool: it never writes to a provider, and the tools that own the state keep the verbs. Not a history: past sessions, closed issues, and merged pull requests are other tools' work.

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
