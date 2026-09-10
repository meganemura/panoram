# The queries

Every built-in query, its parameters, and its columns.
Columns marked `?` can be null.
`root` is the git toplevel of a repository, the key every join uses.

## Reports

`here` runs these ordered sections for one `root`: `agents` (`in-dir`), `git`
(`git-status`), `worktrees`, `pull_requests` (`branch-pull-requests`), `ports`
(`ports-in-dir`), `processes` (`processes-in-dir`), `tools` (`tools-in-dir`),
`issues`, and `workflow`.

## Agents (herdr)

| Query | Parameters | Columns |
| --- | --- | --- |
| `agents` | | `pane_id`, `name?`, `agent`, `agent_status`, `cwd`, `root?`, `workspace_id?`, `title?` |
| `find` | `q` | `pane_id`, `agent`, `agent_status`, `name?`, `title?`, `root?`, `cwd`, `session_name?` |
| `in-dir` | `root` | `pane_id`, `name?`, `agent`, `agent_status`, `cwd`, `title?` |
| `working` | | `pane_id`, `name?`, `agent`, `agent_status`, `root?`, `cwd`, `title?` |
| `workspaces` | | `workspace_id?`, `root?`, `agents`, `working?` |

`agent` is the label herdr detected (`claude`, `codex`, ...).
`agent_status` is herdr's field and uses herdr's values: `working`, `idle`, `blocked`, `unknown`.
`root` is null for an agent outside any repository.
`agents`, `find`, `in-dir`, and `working` exclude `me`.

## Sessions (Claude Code, Codex)

| Query | Parameters | Columns |
| --- | --- | --- |
| `sessions` | | `session_id`, `agent`, `pid?`, `cwd`, `root?`, `name?`, `started_at?`, `updated_at?`, `last_turn_at?`, `last_branch?` |
| `idle-sessions` | | the same, plus `idle_minutes?`, ordered by `updated_at` ascending |
| `claude-sessions` | | `session_id`, `cwd`, `root?`, `name?`, `updated_at?`, `kind?`, `entrypoint?`, `status?`, `status_updated_at?`, `name_source?`, `version?`, `pid_domain?`, `peer_protocol?` |
| `codex-sessions` | | `session_id`, `cwd`, `root?`, `name?`, `updated_at?`, `model?`, `reasoning_effort?`, `source?`, `thread_source?`, `model_provider?`, `cli_version?`, `sandbox_policy?`, `approval_mode?`, `git_branch?`, `git_origin_url?`, `title?`, `tokens_used`, `archived` |
| `agents-with-sessions` | | `pane_id`, `agent`, `agent_status`, `name?`, `claude_status?`, `kind?`, `model?`, `source?`, `started_at?`, `updated_at?`, `last_turn_at?`, `last_branch?`, `root?`, `idle_minutes?` |
| `sessions-without-pane` | | `session_id`, `agent`, `cwd`, `root?`, `name?`, `updated_at?` |
| `codex-threads-with-agents` | | `pane_id`, `root?`, `model?`, `reasoning_effort?`, `source?`, `tokens_used`, `updated_at?` |

`name` is the name the user gave the session.
`kind` and `claude_status` are Claude Code values. `source` is a Codex value.
A session joins an agent through the session id herdr's integration reports.
`agents-with-sessions` keeps an agent with no session and returns null session columns.
A session without a pane appears in `sessions-without-pane`.

## Git

| Query | Parameters | Columns |
| --- | --- | --- |
| `dirty` | | `root`, `branch?`, `dirty_count`, `untracked_count` |
| `git-status` | `root` | `root`, `branch?`, `upstream?`, `ahead`, `behind`, `dirty_count`, `untracked_count` |
| `worktrees` | `root` | `path`, `branch?`, `head?` |
| `agents-in-dirty-repos` | | `pane_id`, `name?`, `agent_status`, `root?`, `branch?`, `dirty_count`, `untracked_count` |
| `crowded-repos` | | `root?`, `agents`, `working?`, `dirty_count` |
| `idle-worktrees` | | `path`, `branch?`, `repo_root` |
| `dirty-unattended` | | `root`, `branch?`, `dirty_count`, `untracked_count` |
| `behind-upstream-with-agents` | | `root`, `branch?`, `upstream?`, `behind`, `ahead`, `agents` |

`dirty_count` counts tracked files with changes (staged or not, renames, conflicts); `untracked_count` counts untracked files.
`worktrees` takes the main root; a linked worktree has `path <> repo_root`.
`agents` in `behind-upstream-with-agents` counts agents other than `me`.

## Repositories (ghq)

| Query | Parameters | Columns |
| --- | --- | --- |
| `repos` | | `path`, `host`, `owner`, `name` |
| `agents-outside-ghq` | | `pane_id`, `name?`, `agent_status`, `cwd`, `root?` |

## Tools (mise)

| Query | Parameters | Columns |
| --- | --- | --- |
| `tools` | | `tool`, `version`, `install_path?`, `installed`, `active` |
| `tools-in-dir` | `root` | `tool`, `version`, `source?`, `installed` |
| `missing-tools-with-agents` | | `root`, `tool`, `version`, `source?`, `agents` |
| `tool-versions-split` | | `tool`, `versions`, `version_list?` |

`source` is the path of the mise file that requested the version; a file above the repository counts.
`active` in `tools` is relative to the directory panoram ran from.

## GitHub (gh)

| Query | Parameters | Columns |
| --- | --- | --- |
| `pull-requests` | `root` | `id`, `repo`, `root?`, `number`, `title`, `head_branch?`, `head_repo?`, `base_branch?`, `author?`, `is_draft`, `state`, `review_decision?`, `checks?`, `updated_at`, `url` |
| `branch-pull-requests` | `root` | `repo`, `number`, `title`, `head_branch?`, `checks?`, `review_decision?`, `is_draft`, `url` |
| `review-requests` | | `id`, `repo`, `root?`, `number`, `title`, `author?`, `updated_at`, `url`, ordered by `updated_at` descending |
| `prs-with-agents` | | `pane_id`, `name?`, `agent_status`, `repo`, `number`, `title`, `head_branch?`, `checks?`, `review_decision?`, `is_draft`, `url` |
| `failing-checks-with-agents` | | `repo`, `number`, `title`, `head_branch?`, `checks?`, `review_decision?`, `is_draft`, `url`, `agents` |
| `review-requests-with-agents` | | `repo`, `number`, `title`, `author?`, `updated_at`, `url`, `agents` |

`repo` is the `owner/name` parsed from origin. The list holds at most 50 open pull requests per repository, the newest first; a repository with more can answer "no pull request" for an older branch. `checks` comes from the last commit's status check rollup state: `SUCCESS` is `pass`; `FAILURE` and `ERROR` are `fail`; `PENDING` and `EXPECTED` are `pending`; a null rollup or no commit is `none`. `prs-with-agents` and `failing-checks-with-agents` match an agent's branch to a pull request whose head lives in the same repository, so a pull request from a fork does not pair with a local branch of the same name. `agents` excludes `me`. The pull request query takes 2.2 to 2.8 seconds for 18 repositories; `review-requests` takes 2 to 5 seconds.

## Processes (ps, lsof)

| Query | Parameters | Columns |
| --- | --- | --- |
| `processes-in-dir` | `root` | `pid`, `ppid`, `executable`, `command`, `cwd`, `elapsed_s`, `rss_kb`, `cpu` |
| `listening-ports` | | `pid`, `address`, `port`, `cwd?`, `root?`, `command?` |
| `ports-in-dir` | `root` | `pid`, `address`, `port`, `cwd?`, `root?`, `command?` |
| `servers-with-agents` | | `root`, `port`, `address`, `pid`, `command?`, `agents` |
| `long-running-without-agents` | | `root`, `pid`, `executable`, `elapsed_s`, `rss_kb` |

`elapsed_s` is process age in seconds. `rss_kb` is resident memory in KiB. `cpu` is the current CPU percentage from ps. A listener can have null location fields when lsof cannot examine its cwd or it is outside the roots in scope. `agents` excludes `me`.

## Skills and plugins (Claude Code, Codex)

| Query | Parameters | Columns |
| --- | --- | --- |
| `skills` | | `path`, `source`, `agent`, `name`, `description?`, `root?`, `plugin?` |
| `skills-in-dir` | `root` | the same columns, for skills an agent can use in that repository |
| `plugins` | | `id`, `agent`, `name`, `marketplace?`, `version?`, `path`, `installed_at?`, `updated_at?` |
| `duplicate-skill-names` | | `agent`, `name`, `sources`, `source_list` |
| `skills-in-one-agent` | | `name`, `agent` |
| `project-skills-with-agents` | | `root`, `name`, `description?`, `agents` |

`source` identifies a user, project, plugin, or Codex system skill. Claude
plugins come from installed registry entries, so an older cache copy is absent.
Codex records enabled plugin IDs but no installed version, so each cached
version of an enabled plugin appears. A Codex plugin ID starts with `codex:`
to keep it distinct from a Claude Code plugin with the same marketplace ID.

## Issues (beads)

| Query | Parameters | Columns |
| --- | --- | --- |
| `issues` | `root` | `id`, `root`, `issue_id`, `title`, `status`, `priority?`, `issue_type?`, `assignee?`, `labels?`, `created_at?`, `updated_at?`, `dependency_count`, `dependent_count`, `comment_count` |
| `issues-with-agents` | | `root`, `open_issues`, `top_priority?`, `agents` |
| `issues-unattended` | | `root`, `open_issues`, `top_priority?` |

`issues` reads open beads issues only. `labels` joins label values with commas.
`agents` excludes `me`.

## Workflows (headsign)

| Query | Parameters | Columns |
| --- | --- | --- |
| `workflow` | `root` | `root`, `workflow`, `workflow_path?`, `status`, `phase?`, `total_iterations`, `attempts?`, `last_failure?`, `end_reason?`, `stop_nudges`, `driver_agent?`, `phase_entered_at?` |
| `workflows` | | the same columns, ordered by `status`, `root` |
| `running-workflows-with-agents` | | `root`, `workflow`, `phase?`, `total_iterations`, `phase_entered_at?`, `agents` |
| `running-workflows-unattended` | | `root`, `workflow`, `phase?`, `phase_entered_at?` |
| `stopped-workflows` | | `root`, `workflow`, `phase?`, `status`, `end_reason?`, `last_failure?` |

`attempts` and `last_failure` hold JSON text from the state file. `agents`
excludes `me`.
