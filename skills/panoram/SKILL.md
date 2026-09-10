---
name: panoram
description: Use when an agent wants to know the state of the developer's machine before it acts. Which agents run where and what they do, which repositories are dirty or behind, which worktrees have nobody in them, which sessions are idle, which tool versions a repository activates. Also use when the user names panoram, a panoram query, or asks to add a query.
---

# panoram

panoram answers questions about one developer's machine.
Each call observes the providers (herdr, git, ghq, mise, the session records) at that moment, joins them in an in-memory database, and prints rows.
Nothing is cached, and panoram never writes to a provider.

Call it from anywhere:

```sh
node /path/to/panoram/cli.ts <query> [--root DIR] [--scope agents|all] [--me PANE] [--tsv]
```

The JSON envelope carries `rows` and `providers`.
Read `providers` before you trust `rows`: a provider with `ok` 0 left its tables empty in this call.
The rules of the envelope, the flags, and the exit codes: [references/output.md](references/output.md).

## Workflow

1. **Before you start work in a repository**: `in-dir` (who else is here), `crowded-repos`, `dirty` and `behind-upstream-with-agents` (what state the checkout is in). The rows exclude your own pane.
2. **When the user asks what is going on**: `agents-with-sessions` (names, idle time), `working`, `idle-sessions`, `workspaces`.
3. **When you look for a place to work**: `idle-worktrees` (a worktree with nobody in it), `dirty-unattended` (changes nobody is tending).
4. **When a tool is missing or the wrong version**: `tools-in-dir`, `missing-tools-with-agents`, `tool-versions-split`.
5. **When no query fits**: read the tables in [references/tables.md](references/tables.md) and ask the user to add a query file; how: [references/user-queries.md](references/user-queries.md). A user query shows up in `--help` with its description and is called like a built-in.

Every query, its parameters, and its columns: [references/queries.md](references/queries.md).

## Queries

| Query | Parameter | Answers |
| --- | --- | --- |
| `agents` | | Every agent herdr hosts, with its repository root. |
| `in-dir` | `--root` | The agents in one repository. |
| `working` | | The agents that work right now. |
| `workspaces` | | Which workspace holds agents of which repository. |
| `agents-with-sessions` | | Agents with the name, start time, and last activity of their session. |
| `sessions` | | Every Claude Code and Codex session alive now. |
| `idle-sessions` | | Sessions ordered by how long they have been idle. |
| `sessions-without-pane` | | Sessions alive now that herdr does not show as an agent. |
| `dirty` | | Repositories with uncommitted changes, dirtiest first. |
| `worktrees` | `--root` | The worktrees of one repository. |
| `repos` | | Every repository ghq manages. |
| `agents-in-dirty-repos` | | Agents that work in a repository with uncommitted changes. |
| `crowded-repos` | | Repositories with more than one agent, and their dirt. |
| `idle-worktrees` | | Linked worktrees with no agent in them. |
| `agents-outside-ghq` | | Agents whose repository ghq does not manage, or no repository at all. |
| `dirty-unattended` | | Repositories with uncommitted changes and no agent. |
| `behind-upstream-with-agents` | | Repositories behind their upstream that have an agent in them. |
| `tools` | | Every tool version mise has installed. |
| `tools-in-dir` | `--root` | The tools mise activates in one repository. |
| `missing-tools-with-agents` | | Repositories with an agent where a requested tool is not installed. |
| `tool-versions-split` | | Tools whose active version differs between repositories with an agent. |

`--root` defaults to the git toplevel of the current directory.
`--scope all` runs git and mise on every ghq repository instead of the repositories with an agent; it takes a few seconds.

## Where the reasoning is

The design records in `docs/adr/` of the repository hold the decisions and the measurements behind them.
