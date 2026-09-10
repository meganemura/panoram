# 0014. Sessions are observed, not searched.

Date: 2026-09-10

Status: accepted

## Context

Claude Code transcripts occupied 1.2 GB across 197 files on 2026-09-10, with one file of 454 MB, and they grow.
Reading them would search history rather than observe the present, which conflicts with the fresh provider model in ADR 0002.
The agent pane already stores the session identifier from its Claude Code and Codex integrations.

## Decision

The sessions provider creates rows only for live Claude Code processes and held Codex thread locks.
It reads the final 8 KB of a live transcript or rollout for the last turn and branch, and takes the Codex cwd, source, and version from the threads table of Codex's own SQLite file, whose first rollout line runs past any fixed head size.
It joins an agent to a session through the session identifier that herdr reports.

The Claude Code and Codex sources load concurrently.
If one source fails, the provider keeps rows from the other source and reports the failed source in its provider row.
This partial result is useful because one table represents two independent tools.
ADR 0024 records how the session tables preserve each source's field names.

## Consequences

Another tool must answer questions about past sessions.
A live session without a herdr integration has no pane and remains visible through `sessions-without-pane`.
The Codex source runs one `lsof` call over its lock directory, which took about 0.5 s in the measurement.
