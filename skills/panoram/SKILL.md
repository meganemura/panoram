---
name: panoram
description: Use when an agent needs to find agents, dirty repositories, or idle worktrees before it starts work in a repository another agent may use.
---

# panoram

Run panoram from its checkout:

```sh
node cli.ts <query>
```

Use `panoram <query>` when the package bin is linked.

| Query | Parameter | Result |
| --- | --- | --- |
| `agents` | None | Lists every agent and its repository root. |
| `in-dir` | `--root DIR` | Lists agents in one repository. |
| `working` | None | Lists agents whose status is `working`. |
| `workspaces` | None | Groups agents by workspace and repository root. |
| `dirty` | None | Lists repositories with uncommitted changes. |
| `worktrees` | `--root DIR` | Lists worktrees for one repository. |
| `repos` | None | Lists repositories that ghq manages. |
| `tools` | None | Lists every tool version mise has installed. |
| `tools-in-dir` | `--root DIR` | Lists the tools mise activates in one repository. |
| `sessions` | None | Lists Claude Code and Codex sessions alive now. |
| `idle-sessions` | None | Lists sessions by idle time. |
| `agents-in-dirty-repos` | None | Lists agents in dirty repositories. |
| `crowded-repos` | None | Lists repositories with more than one agent. |
| `idle-worktrees` | None | Lists linked worktrees without an agent. |
| `agents-outside-ghq` | None | Lists agents outside repositories that ghq manages. |
| `dirty-unattended` | None | Lists dirty repositories without an agent. |
| `behind-upstream-with-agents` | None | Lists repositories behind upstream with an agent. |
| `missing-tools-with-agents` | None | Lists repositories with an agent where a requested tool is not installed. |
| `tool-versions-split` | None | Lists tools whose active version differs between repositories with an agent. |
| `agents-with-sessions` | None | Lists agents with session details and last activity. |
| `sessions-without-pane` | None | Lists live sessions that do not have an agent pane. |

User queries appear in `--help` with their descriptions.
An agent can call a user query like a built-in query.

JSON output has `query`, `scope`, `me`, `rows`, and `providers`.
Each provider row has `name`, `ok`, `observed_at`, `ms`, and `error`.
Read `ok` and `observed_at` before you trust `rows`.
An `ok` value of `0` means that provider left its tables empty in this call.

`--scope agents` is the default and loads Git data for repositories with an agent.
`--scope all` also loads Git data for every repository that ghq manages.
`--root` defaults to the Git top level of the current directory.
panoram uses the directory when Git cannot resolve a top level.
The core identifies `me` as the caller's pane by default.
Queries that take `me` exclude that pane unless you set `--me` to an empty value.
