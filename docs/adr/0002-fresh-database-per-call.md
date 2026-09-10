# 0002. Each call uses a fresh in-memory database.

Date: 2026-09-10

Status: accepted

## Context

panoram has no data of its own; the providers own the state.
A stored copy would need a freshness policy and an invalidation path for every provider.
No provider tells panoram when its state changed, so a copy has no moment at which to refresh.

## Decision

Each call migrates a new `:memory:` database from zero.
The migration takes 3 ms.
Required loaders fill their tables, the statement runs, and the process exits.
The process keeps no cache.
The core writes `providers` after the loaders finish.
Providers never write that table.

## Consequences

There is nothing to invalidate between calls.
A failed provider leaves its tables empty and records `ok` as `0`.
Its row includes the error text, `observed_at`, and `ms`.
A loader that runs after it sees the empty tables and is not itself a failure.
