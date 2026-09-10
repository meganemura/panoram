---
name: panoram
license: MIT
description: Use when an agent wants to know the state of the developer's machine before it acts. Which agents run where and what they do, which repositories are dirty or behind, which worktrees have nobody in them, which sessions are idle, which tool versions a repository activates. Also use when the user names panoram, a panoram query, or asks to add a query.
---

# panoram

panoram answers questions about one developer's machine.
Each call observes the providers (herdr, git, ghq, mise, gh, ps, lsof, beads, headsign state files, the session records, skill and plugin files) at that moment, joins them in an in-memory database, and prints rows.
Nothing is cached, and panoram never writes to a provider.

Call it from anywhere:

```sh
panoram <query> [--root DIR] [--scope root|agents|all] [--me PANE] [--tsv]
```

`panoram` is on PATH after `npm link` in the checkout; `node /path/to/panoram/cli.ts` is the same command without the link.

The JSON envelope carries `rows` and `providers`.
Read `providers` before you trust `rows`: a provider with `ok` 0 left its tables empty in this call.
The rules of the envelope, the flags, and the exit codes: [references/output.md](references/output.md).

## Workflow

1. **Before you start work in a repository**: `here` (one call: who else is here with `in-dir`, the checkout with `git-status` and `worktrees`, its pull request with `branch-pull-requests`, ports with `ports-in-dir`, processes with `processes-in-dir`, tools with `tools-in-dir`, issues, and the workflow). The rows exclude your own pane. As a gate: `panoram here --expect-empty --strict` exits 0 only when nobody else is here and every provider answered.
2. **When the user asks what is going on**: `agents-with-sessions` (names, idle time), `working`, `idle-sessions`, `workspaces`.
3. **When you look for a place to work**: `idle-worktrees` (a worktree with nobody in it), `dirty-unattended` (changes nobody is tending).
4. **When a tool is missing or the wrong version**: `tools-in-dir`, `missing-tools-with-agents`, `tool-versions-split`.
5. **When no query fits**: read the tables in [references/tables.md](references/tables.md) and ask the user to add a query file; how: [references/user-queries.md](references/user-queries.md). A user query shows up in `--help` with its description and is called like a built-in.
6. **Before you push or open a pull request**: `prs-with-agents` for the branch you are on, then `failing-checks-with-agents`. These read GitHub and take several seconds. Do not use `--scope all` for this check.
7. **Before you start a server, a watcher, or a build**: `ports-in-dir` and `processes-in-dir`; use `servers-with-agents` for the whole picture.
8. **When you wonder which skill applies here, or whether a name collides**: `skills-in-dir`, `duplicate-skill-names`.
9. **When you pick up a repository**: `issues` and `workflow` for its root; use `running-workflows-unattended` and `issues-unattended` for work nobody holds.

Every query, its parameters, and its columns: [references/queries.md](references/queries.md).

## Queries

The table lists the queries the workflow names. Every query, with its parameters and columns, is in [references/queries.md](references/queries.md); `--help` lists them all, most used first. `--help --json` gives the list as data.

| Query | Parameter | Answers |
| --- | --- | --- |
| `here` | `--root` | Everything about one repository, in sections. |
| `in-dir` | `--root` | The agents in one repository. |
| `crowded-repos` | | Repositories with more than one agent, and their dirt. |
| `dirty` | | Repositories with uncommitted changes, dirtiest first. |
| `behind-upstream-with-agents` | | Repositories behind their upstream that have an agent in them. |
| `agents-with-sessions` | | Agents with the name, start time, and last activity of their session. |
| `working` | | The agents that work right now. |
| `idle-sessions` | | Sessions ordered by how long they have been idle. |
| `workspaces` | | Which workspace holds agents of which repository. |
| `idle-worktrees` | | Linked worktrees with no agent in them. |
| `dirty-unattended` | | Repositories with uncommitted changes and no agent. |
| `tools-in-dir` | `--root` | The tools mise activates in one repository. |
| `missing-tools-with-agents` | | Repositories with an agent where a requested tool is not installed. |
| `tool-versions-split` | | Tools whose active version differs between repositories with an agent. |
| `prs-with-agents` | | Agents whose branch has an open pull request, with its checks. |
| `failing-checks-with-agents` | | Open pull requests with failing checks in repositories where an agent works. |
| `processes-in-dir` | `--root` | Processes whose working directory is inside one repository. |
| `ports-in-dir` | `--root` | Listening ports of processes inside one repository. |
| `servers-with-agents` | | Listening processes in repositories where an agent works. |
| `skills-in-dir` | `--root` | The skills an agent can use in one repository. |
| `duplicate-skill-names` | | Skill names that come from more than one source. |
| `issues` | `--root` | Open beads issues of one repository. |
| `workflow` | `--root` | The headsign run of one repository. |
| `running-workflows-unattended` | | Running headsign workflows with no agent in the repository. |
| `issues-unattended` | | Repositories with open beads issues and no agent. |

`--root` defaults to the git toplevel of the current directory.
A query that takes `--root` looks at that repository only. `--scope all` runs each repository-scoped provider on every ghq repository instead of the repositories with an agent; it takes a few seconds.

## Where the reasoning is

The design records in `docs/adr/` of the repository hold the decisions and the measurements behind them.
