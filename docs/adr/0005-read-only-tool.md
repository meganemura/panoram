# 0005. panoram reads provider state.

Date: 2026-09-10

Status: accepted

## Context

panoram reports the current state of providers.
Provider tools own the actions that change that state.

## Decision

panoram has no write verb.
Actions stay with the provider tools that own the state.
The `exec` function drops standard error and uses the exit code for failure reporting.

## Consequences

A query cannot alter an agent, repository, worktree, or provider setting.
Provider failures appear in the `providers` rows.
