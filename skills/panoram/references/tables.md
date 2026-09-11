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
| `agent_status` | text | herdr's `working`, `idle`, `blocked`, or `unknown`. |
| `focused` | integer | 1 for the pane herdr has in focus. |
| `cwd` | text | The pane's working directory. |
| `foreground_cwd` | text? | The foreground process's directory when it differs. |
| `root` | text? | The git toplevel of `cwd`, or null. |
| `workspace_id`, `tab_id` | text? | Where the pane sits. |
| `title` | text? | The terminal title. |

## `sessions`, `claude_sessions`, and `codex_sessions`

`sessions` is the supertype for data both sources share. Each subtype has one row for its matching parent and keeps source column names and values.

| Column | Type | Meaning |
| --- | --- | --- |
| `session_id` | text, key | Claude Code's session id or Codex's thread id. |
| `agent` | text | `claude` or `codex`. |
| `pid` | integer? | The process. |
| `cwd`, `root` | text, text? | Where it runs. |
| `name` | text? | The name the user gave. |
| `started_at`, `updated_at` | integer? | Milliseconds since the epoch. |
| `last_turn_at` | integer? | The timestamp of the last record in the transcript. |
| `last_branch` | text? | The branch the last record names. |

`claude_sessions`: `session_id` (key and `sessions` reference), `kind?`, `entrypoint?`, `status?`, `status_updated_at?`, `name_source?`, `version?`, `pid_domain?`, `peer_protocol?`.

`codex_sessions`: `session_id` (key and `sessions` reference), `source?`, `thread_source?`, `model?`, `model_provider?`, `reasoning_effort?`, `cli_version?`, `sandbox_policy?`, `approval_mode?`, `git_branch?`, `git_origin_url?`, `title?`, `tokens_used`, `archived`.

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
The open pull requests of every repository in scope. `checks` comes from the last commit's status check rollup state. `head_repo` is the repository the head branch lives in; it differs from `repo` for a pull request from a fork, and the joins on the branch require the two to match. `updated_at` is milliseconds since the epoch.

## `review_requests` (github_reviews)

`id` (key, `owner/name#number`), `repo`, `root?`, `number`, `title`, `author?`, `updated_at`, `url`.
One search across GitHub for the pull requests that request the caller's review; `root` is null when the repository is not in scope. Its own loader, because the search costs 2 to 5 s and a query that does not read this table does not wait for it.

## `processes` and `listeners` (processes)

`processes`: `pid` (key), `ppid`, `pgid`, `cwd`, `root`, `command`, `executable`, `elapsed_s`, `rss_kb`, `cpu`.
It contains user processes whose cwd is inside a root in scope. `executable` is the basename of the first command field.

`listeners`: `id` (key, `pid:address:port`), `pid`, `address`, `port`, `cwd?`, `root?`, `command?`.
It contains every listening TCP socket of the user. A process can have rows for both IPv4 and IPv6 or for several ports. `root` is set when its cwd is inside a root in scope.

## `containers`, `container_roots`, and `container_ports` (docker)

`containers`: `id` (key), `name`, `image`, `state`, `health?`,
`created_at`, `started_at?`, `finished_at?`, `exit_code`, `oom_killed`,
`restart_count`, `compose_project?`, `compose_service?`.
It contains every container in the active Docker CLI context, including stopped
containers.
Timestamps are milliseconds since the epoch.
Docker zero timestamps become null.
`image` is Docker `Config.Image`, and `state` is Docker `State.Status`.
`health` is Docker `State.Health.Status` when Docker reports it.
`compose_project` and `compose_service` come from the canonical Compose labels.

`container_roots`: `container_id`, `root`, with the pair as the key.
It associates a container with repository roots found from bind mounts and the
optional Compose working-directory label.
A container that does not map to a repository remains in `containers` and has
no `container_roots` row.

`container_ports`: `id` (key), `container_id`, `container_port`, `protocol`,
`host_ip?`, `host_port?`.
It contains one row for each exposed container port and host binding.
An exposed port with no host binding has null host fields.
Multiple host bindings become multiple rows.

## `skills` and `plugins` (skills)

`skills`: `path` (key), `source`, `agent`, `name`, `description?`, `root?`, `plugin?`.
`source` is `claude-user`, `claude-project`, `claude-plugin`, `codex-user`,
`codex-system`, or `codex-plugin`. `root` is set for project skills. `plugin`
is set for plugin skills.

`plugins`: `id` (key), `agent`, `name`, `marketplace?`, `version?`, `path`,
`installed_at?`, `updated_at?`. Timestamps are milliseconds since the epoch.

## `issues` (beads)

`id` (key, `root issue_id`), `root`, `issue_id`, `title`, `status`,
`priority?`, `issue_type?`, `assignee?`, `labels?`, `created_at?`,
`updated_at?`, `dependency_count`, `dependent_count`, `comment_count`.
The table contains open issues from roots in scope that have `.beads`.
`labels` joins labels with commas. Timestamps are milliseconds since the epoch.

## `workflow_runs` (headsign)

`root` (key), `workflow`, `workflow_path?`, `status`, `phase?`,
`total_iterations`, `attempts?`, `last_failure?`, `end_reason?`,
`stop_nudges`, `driver_agent?`, `phase_entered_at?`.
The table contains roots in scope with a readable `.headsign/state.json`.
`attempts` and `last_failure` are JSON text. `phase_entered_at` is milliseconds
since the epoch.

## `providers` (the core)

`name` (key), `ok`, `observed_at`, `ms`, `error?`. One row per provider the call ran. A statement that reads only this table runs no provider.

## Writing a statement

- Join on `root`. `agents.root` can be null; `sessions.root` too.
- Exclude the caller with `(:me is null or a.pane_id <> :me)`; the CLI binds `:me`.
- Give every expression column a `cast(... as integer | real | text)` when you want a stable type; SQLite does not require it for a user query.
- Every table is read in full; there are no indexes, and a call holds at most a few hundred rows per table.
