# Output, flags, and exit codes

## The envelope

JSON is the default output:

```json
{
  "query": "in-dir",
  "scope": "agents",
  "me": "w3S:p1",
  "params": { "root": "/workspace/example", "me": "w3S:p1" },
  "rows": [ { "pane_id": "w12:p2", "name": null, "agent": "claude", "agent_status": "idle", "cwd": "...", "title": "HQ" } ],
  "providers": [
    { "name": "herdr", "ok": 1, "observed_at": 1789038132395, "ms": 185.2, "error": null }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `query` | The query name, or `sql`. |
| `scope` | `root`, `agents`, or `all`. |
| `me` | The caller's pane, or null when the environment names none. |
| `params` | Every value the statement bound. |
| `rows` | The rows, in the order the query defines. |
| `providers` | One row per provider this call ran: `ok` 1 or 0, `observed_at` in milliseconds since the epoch, `ms` the time it took, `error` the message when it failed. |

A provider that failed leaves its tables empty, so a join through them gives no rows.
Treat empty `rows` next to a failed provider as "unknown", not as "none".
A provider the query does not read is absent from `providers`.

A report has a report envelope instead of `query` and `rows`:

```json
{
  "report": "here",
  "root": "/workspace/example",
  "scope": "agents",
  "me": "w3S:p1",
  "params": { "root": "/workspace/example", "me": "w3S:p1" },
  "sections": { "agents": [], "git": [] },
  "providers": []
}
```

`root` is the resolved root. `sections` keeps the report order and each value
is the rows of its named query.

`--tsv` prints a header line and the rows, tab separated, null as an empty cell.
A failed provider goes to standard error as `panoram: provider <name> failed: <error>`.
For a report, TSV prints `# <section>` before each non-empty section's TSV
table and an empty line after that table. An empty section prints only its
`# <section>` line.

Times are milliseconds since the epoch (`observed_at`, `started_at`, `updated_at`, `last_turn_at`).
`idle_minutes` is computed at call time.

Read activity in this order: `agent_status` from herdr describes the present.
`updated_at` and `last_turn_at` belong to the session record. `idle_minutes`
derives from `updated_at`.

## Flags

| Flag | Meaning |
| --- | --- |
| `--root DIR` | The repository for a query or report that takes `root`. Default: the git toplevel of the current directory, or the directory itself outside a repository. A query that takes `--root` runs the loaders on that root alone by default (`--scope root`); `--scope agents` widens to every repository with an agent, `--scope all` to every ghq repository. |
| `--scope root` | Repository-scoped loaders run on the root bound to the query. |
| `--scope agents` | Repository-scoped loaders run on the repositories that have an agent. |
| `--scope all` | git, mise, processes, beads, headsign, skills, and github also run on every ghq repository. Several seconds. |
| `--me PANE` | The pane to exclude. Default: the caller's own pane, from `HERDR_PANE_ID`, then `CLAUDE_CODE_SESSION_ID` matched to a session, then the pane herdr has in focus. `--me ""` keeps every pane. |
| `--tsv` | Rows only, tab separated. A report prints named sections. |
| `--json` | The default. |
| `--<name> VALUE` | A parameter of a built-in or user query, bound as text. |
| `--expect-empty` | Exit 3 after output when the query returned rows. For `here`, it reads the `agents` section only. |
| `--strict` | Exit 4 after output when a provider did not answer. |
| `--help` | The built-in and user queries, then reports, with descriptions. `--help --json` prints their names, descriptions, parameters, sources, and report sections as JSON. |

A query that takes `--root` runs the loaders on that root alone by default (`--scope root`); `--scope agents` widens to every repository with an agent, `--scope all` to every ghq repository.

panoram records call counts in `$XDG_STATE_HOME/panoram/calls.jsonl`, or `~/.local/state/panoram/calls.jsonl` when the variable is unset.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | The query ran. A failed provider does not change the code; read `providers`. |
| 1 | The statement did not run: a missing parameter, a statement that does not prepare. The message is one line on standard error. |
| 2 | Usage: an unknown query name, a bad `--scope`, no query given. |
| 3 | `--expect-empty` and the query returned rows. |
| 4 | `--strict` and a provider did not answer. |

## Self

`me` is the caller.
Queries that list agents exclude `me`, so "who else is here" is the default reading.
When a query counts agents (`crowded-repos`, `workspaces`), `me` is counted.
