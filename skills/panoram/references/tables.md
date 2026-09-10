# The tables

What each provider fills, for a user query or an ad hoc statement.
Every table is empty until a statement reads it; a statement pays only for the providers it reads.
`root` is the join key across providers: the git toplevel of a directory.

## `agents` (herdr)

| Column | Type | Meaning |
| --- | --- | --- |
| `pane_id` | text, key | herdr's pane id. |
| `session_id` | text? | The session id the agent's herdr integration reported. |
| `name` | text? | The name given in herdr. |
| `agent` | text | The detected agent: `claude`, `codex`, ... |
| `status` | text | `working`, `idle`, `blocked`, `unknown`. |
| `focused` | integer | 1 for the pane herdr has in focus. |
| `cwd` | text | The pane's working directory. |
| `foreground_cwd` | text? | The foreground process's directory when it differs. |
| `root` | text? | The git toplevel of `cwd`, or null. |
| `workspace_id`, `tab_id` | text? | Where the pane sits. |
| `title` | text? | The terminal title. |

## `sessions` (Claude Code, Codex)

| Column | Type | Meaning |
| --- | --- | --- |
| `session_id` | text, key | Claude Code's session id or Codex's thread id. |
| `agent` | text | `claude` or `codex`. |
| `pid` | integer? | The process. |
| `cwd`, `root` | text, text? | Where it runs. |
| `name` | text? | The name the user gave. |
| `kind` | text? | Claude Code's kind, or Codex's source. |
| `status` | text? | Claude Code's status; null for Codex. |
| `version` | text? | The CLI version. |
| `started_at`, `updated_at` | integer? | Milliseconds since the epoch. |
| `last_turn_at` | integer? | The timestamp of the last record in the transcript. |
| `last_branch` | text? | The branch the last record names. |

## `git_status` and `worktrees` (git)

`git_status`: `root` (key), `branch?`, `upstream?`, `ahead`, `behind`, `dirty_count`, `untracked_count`, `observed_at`.
`worktrees`: `path` (key), `repo_root`, `branch?`, `head?`. The main worktree has `path = repo_root`.

Under the default scope these hold the repositories that have an agent; under `--scope all`, every ghq repository too.

## `repos` (ghq)

`path` (key, the same string as a root), `host`, `owner`, `name`.

## `tools` and `tool_uses` (mise)

`tools`: `id` (key, `tool@version`), `tool`, `version`, `install_path?`, `installed`, `active`.
`tool_uses`: `id` (key, `root tool`), `root`, `tool`, `version`, `source?`, `installed`. One row per root in scope and tool mise activates there.

## `pull_requests` (github)

`id` (key, `owner/name#number`), `repo`, `root?`, `number`, `title`, `head_branch?`, `head_repo?`, `base_branch?`, `author?`, `is_draft`, `state`, `review_decision?`, `checks?`, `updated_at`, `url`.
The open pull requests of every repository in scope. `head_repo` is the repository the head branch lives in; it differs from `repo` for a pull request from a fork, and the joins on the branch require the two to match. `updated_at` is milliseconds since the epoch.

## `review_requests` (github_reviews)

`id` (key, `owner/name#number`), `repo`, `root?`, `number`, `title`, `author?`, `updated_at`, `url`.
One search across GitHub for the pull requests that request the caller's review; `root` is null when the repository is not in scope. Its own loader, because the search costs 2 to 5 s and a query that does not read this table does not wait for it.

## `providers` (the core)

`name` (key), `ok`, `observed_at`, `ms`, `error?`. One row per provider the call ran. A statement that reads only this table runs no provider.

## Writing a statement

- Join on `root`. `agents.root` can be null; `sessions.root` too.
- Exclude the caller with `(:me is null or a.pane_id <> :me)`; the CLI binds `:me`.
- Give every expression column a `cast(... as integer | real | text)` when you want a stable type; SQLite does not require it for a user query.
- Every table is read in full; there are no indexes, and a call holds at most a few hundred rows per table.
