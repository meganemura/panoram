# Output, flags, and exit codes

## The envelope

JSON is the default output:

```json
{
  "query": "in-dir",
  "scope": "agents",
  "me": "w3S:p1",
  "rows": [ { "pane_id": "w12:p2", "name": null, "agent": "claude", "agent_status": "idle", "cwd": "...", "title": "HQ" } ],
  "providers": [
    { "name": "herdr", "ok": 1, "observed_at": 1789038132395, "ms": 185.2, "error": null }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `query` | The query name, or `sql`. |
| `scope` | `agents` or `all`. |
| `me` | The caller's pane, or null when the environment names none. |
| `rows` | The rows, in the order the query defines. |
| `providers` | One row per provider this call ran: `ok` 1 or 0, `observed_at` in milliseconds since the epoch, `ms` the time it took, `error` the message when it failed. |

A provider that failed leaves its tables empty, so a join through them gives no rows.
Treat empty `rows` next to a failed provider as "unknown", not as "none".
A provider the query does not read is absent from `providers`.

`--tsv` prints a header line and the rows, tab separated, null as an empty cell.
A failed provider goes to standard error as `panoram: provider <name> failed: <error>`.

Times are milliseconds since the epoch (`observed_at`, `started_at`, `updated_at`, `last_turn_at`).
`idle_minutes` is computed at call time.

## Flags

| Flag | Meaning |
| --- | --- |
| `--root DIR` | The repository for a query that takes `root`. Default: the git toplevel of the current directory, or the directory itself outside a repository. |
| `--scope agents` | Default. git and mise run on the repositories that have an agent. |
| `--scope all` | git and mise run on every ghq repository as well. Several seconds. |
| `--me PANE` | The pane to exclude. Default: the caller's own pane, from `HERDR_PANE_ID`, then `CLAUDE_CODE_SESSION_ID` matched to a session, then the pane herdr has in focus. `--me ""` keeps every pane. |
| `--tsv` | Rows only, tab separated. |
| `--json` | The default. |
| `--<name> VALUE` | A parameter of a built-in or user query, bound as text. |
| `--expect-empty` | Exit 3 after output when the query returned rows. |
| `--strict` | Exit 4 after output when a provider did not answer. |
| `--help` | The built-in and user queries, with descriptions, ordered by call count. `--help --json` prints their names, descriptions, parameters, and sources as JSON. |

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
