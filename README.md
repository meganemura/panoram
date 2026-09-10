# panoram

panoram answers questions about one developer's machine: which coding agents run where, which repositories are dirty, which worktrees have nobody in them.
It is a query layer with no data of its own.
Providers fill their tables when a call needs them.
Named queries join those tables.
Each call uses a fresh in-memory SQLite database, so panoram keeps no cache.

## Requirements

Use Node 24.10 or later.
The build and the provider resolver use `setAuthorizer` from `node:sqlite`.
Keep `herdr`, `ghq`, `git`, and `mise` on `PATH`.
If a provider cannot run, its tables are empty for that call.
The result includes a `providers` row that describes the failure.

## Install and run

```sh
npm install
node cli.ts <query>
```

The package exposes `cli.ts` as the `panoram` bin.

## Usage

```text
panoram <query> [--root DIR] [--scope agents|all] [--me PANE] [--json|--tsv]
panoram --sql <text> [--root DIR] [--me PANE] [--scope agents|all] [--json|--tsv]
panoram --help
```

| Argument | Purpose |
| --- | --- |
| `<query>` | Runs a named query from the catalog. |
| `--sql <text>` | Runs ad hoc SQL for a person at a shell. `:root` and `:me` in the text bind from the flags. |
| `--scope agents\|all` | Selects the repository scope. `agents` is the default. |
| `--root DIR` | Sets the repository for a query that takes `root`. The default is the Git top level of the current directory. panoram uses the directory if Git cannot resolve a top level. |
| `--me PANE` | Excludes a pane from a query that takes `me`. An empty value keeps every pane. |
| `--json` | Selects JSON output, which is the default. |
| `--tsv` | Selects TSV output. |
| `--help`, `-h` | Prints the usage text. |

With `--scope agents`, Git loads repositories that have an agent.
With `--scope all`, Git also loads every repository that `ghq` manages.

## Result format

JSON output has this envelope:

```text
{
  "query": "<query name>",
  "scope": "agents" | "all",
  "me": "<pane id>" | null,
  "rows": [],
  "providers": [
    {
      "name": "<provider name>",
      "ok": 1,
      "observed_at": 0,
      "ms": 0,
      "error": null
    }
  ]
}
```

Each `providers` item has `name`, `ok`, `observed_at`, `ms`, and `error`.
Read those items before you use `rows`: a provider with `ok` 0 left its tables empty in this call, and `observed_at` says when each provider ran.
TSV output prints rows only and writes provider failures to standard error.

## Queries

| Name | Result |
| --- | --- |
| `agents` | Every agent herdr hosts, with its repository root. |
| `in-dir` | The agents in one repository, by its root. |
| `working` | The agents that work right now. |
| `workspaces` | Which workspace holds agents of which repository. |
| `dirty` | Repositories with uncommitted changes, dirtiest first. |
| `worktrees` | The worktrees of one repository, by its root. |
| `repos` | Every repository ghq manages. |
| `tools` | Every tool version mise has installed. |
| `tools-in-dir` | The tools mise activates in one repository, by its root. |
| `agents-in-dirty-repos` | Agents that work in a repository with uncommitted changes. |
| `crowded-repos` | Repositories with more than one agent, and their dirt. |
| `idle-worktrees` | Linked worktrees with no agent in them. |
| `agents-outside-ghq` | Agents whose repository is not one ghq manages, or no repository at all. |
| `dirty-unattended` | Repositories with uncommitted changes and no agent. |
| `behind-upstream-with-agents` | Repositories behind their upstream that have an agent in them. |
| `missing-tools-with-agents` | Repositories with an agent where a requested tool is not installed. |
| `tool-versions-split` | Tools whose active version differs between repositories with an agent. |

Agents can use [the panoram skill](skills/panoram/SKILL.md).
The design records are in [docs](docs/README.md).

## License

MIT
