# 0024. Columns take the source name, and subtypes hold the rest.

Date: 2026-09-11

Status: accepted

## Context

panoram names a column after its source field and keeps that source's values.
The old `sessions.kind` held Claude Code `kind` values and Codex `source` values.
The old `sessions.status` applied only to Claude Code.
The old `sessions.version` held Codex `cli_version` values.
That shape concealed different meanings and created null columns.

## Decision

`sessions` is the supertype for values shared by live Claude Code sessions and Codex threads.
`claude_sessions` and `codex_sessions` hold one source-specific row for each parent session.

For every provider, a column named after a source field keeps that name and its values.
A column that panoram computes uses a panoram name.

## Consequences

The schema has two additional session tables and the catalog has three additional session queries.
`agents.agent_status` uses the name in herdr's snapshot.
panoram does not unify values across sources.
A query that compares source values states that distinction.
