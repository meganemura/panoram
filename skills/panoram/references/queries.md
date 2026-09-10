# The queries

Every built-in query, its parameters, and its columns.
Columns marked `?` can be null.
`root` is the git toplevel of a repository, the key every join uses.

## Agents (herdr)

| Query | Parameters | Columns |
| --- | --- | --- |
| `agents` | | `pane_id`, `name?`, `agent`, `status`, `cwd`, `root?`, `workspace_id?`, `title?` |
| `in-dir` | `root` | `pane_id`, `name?`, `agent`, `status`, `cwd`, `title?` |
| `working` | | `pane_id`, `name?`, `agent`, `root?`, `cwd`, `title?` |
| `workspaces` | | `workspace_id?`, `root?`, `agents`, `working?` |

`agent` is the label herdr detected (`claude`, `codex`, ...).
`status` is herdr's reading: `working`, `idle`, `blocked`, `unknown`.
`root` is null for an agent outside any repository.
`agents`, `in-dir`, and `working` exclude `me`.

## Sessions (Claude Code, Codex)

| Query | Parameters | Columns |
| --- | --- | --- |
| `sessions` | | `session_id`, `agent`, `pid?`, `cwd`, `root?`, `name?`, `kind?`, `status?`, `version?`, `started_at?`, `updated_at?`, `last_turn_at?`, `last_branch?` |
| `idle-sessions` | | the same, plus `idle_minutes?`, ordered by `updated_at` ascending |
| `agents-with-sessions` | | `pane_id`, `agent`, `status`, `name?`, `kind?`, `started_at?`, `updated_at?`, `last_turn_at?`, `last_branch?`, `root?`, `idle_minutes?` |
| `sessions-without-pane` | | `session_id`, `agent`, `cwd`, `root?`, `name?`, `kind?`, `updated_at?` |

`name` is the name the user gave the session.
`kind` is Claude Code's kind (`interactive`, ...) or Codex's source (`cli`, `vscode`, ...).
`status` is Claude Code's own status; Codex has none.
A session joins an agent through the session id herdr's integration reports; a session without one appears in `sessions-without-pane`.

## Git

| Query | Parameters | Columns |
| --- | --- | --- |
| `dirty` | | `root`, `branch?`, `dirty_count`, `untracked_count` |
| `worktrees` | `root` | `path`, `branch?`, `head?` |
| `agents-in-dirty-repos` | | `pane_id`, `name?`, `status`, `root?`, `branch?`, `dirty_count`, `untracked_count` |
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
| `agents-outside-ghq` | | `pane_id`, `name?`, `status`, `cwd`, `root?` |

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
| `review-requests` | | `id`, `repo`, `root?`, `number`, `title`, `author?`, `updated_at`, `url`, ordered by `updated_at` descending |
| `prs-with-agents` | | `pane_id`, `name?`, `status`, `repo`, `number`, `title`, `head_branch?`, `checks?`, `review_decision?`, `is_draft`, `url` |
| `failing-checks-with-agents` | | `repo`, `number`, `title`, `head_branch?`, `checks?`, `review_decision?`, `is_draft`, `url`, `agents` |
| `review-requests-with-agents` | | `repo`, `number`, `title`, `author?`, `updated_at`, `url`, `agents` |

`repo` is the `owner/name` parsed from origin. `checks` is `pass`, `fail`, `pending`, or `none`. `prs-with-agents` and `failing-checks-with-agents` match an agent's branch to a pull request whose head lives in the same repository, so a pull request from a fork does not pair with a local branch of the same name. `agents` excludes `me`. The pull request queries take 3 to 9 seconds under the default scope; `review-requests` 2 to 5.
