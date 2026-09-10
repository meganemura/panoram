# 0023. A call log orders help by use.

Date: 2026-09-11

Status: accepted

## Context

panoram has 45 named queries.
The order of use is the order that helps a caller choose one.
panoram has no data of its own, and this log is the one exception.

## Decision

panoram appends one JSON line for each completed query to `$XDG_STATE_HOME/panoram/calls.jsonl`.
It uses `~/.local/state/panoram/calls.jsonl` when `XDG_STATE_HOME` is unset.
Each line holds a query name and a millisecond timestamp.
It holds no parameters, roots, or result rows.
`--help` sorts built-in queries and user queries by descending call count.
Ties keep catalog order.
The skill table lists the queries named by its workflow.

## Consequences

The first `--help` uses catalog order.
The log grows by one line per call and reads from its tail.
Deleting the file resets the order.
The log is not a cache, and no query reads it.
