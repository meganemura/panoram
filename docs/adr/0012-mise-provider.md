# 0012. mise is the fourth provider.

Date: 2026-09-10

Status: accepted

## Context

panoram needs to show installed tool versions and the versions a repository requests.
mise resolves those requests relative to a directory.
A configuration file can sit above a repository root.
Its path explains why that root selects a version.

## Decision

mise is the fourth provider.
It owns `tools` for the global inventory and `tool_uses` for per-root requests.
The join key is `root`, because `mise ls --current -C <root>` answers for one directory.
`tool_uses.source` keeps the path that requested the version.

The loader runs `mise ls --json` once for `tools`.
It runs `mise ls --json --current -C <root>` for each root concurrently.
Each command took about 22 ms in the measurement.

## Consequences

The loader runs after herdr and repos, which provide the roots in scope.
A root that does not answer has no `tool_uses` rows.
The global inventory still answers when another root fails.
Report queries join `tool_uses` to agents on `root`.
