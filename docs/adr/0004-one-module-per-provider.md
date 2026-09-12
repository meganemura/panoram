# 0004. Each provider uses one solarsql module.

Date: 2026-09-10

Status: accepted

## Context

A connector uses 40 to 80 lines.
The connector boundary matches the module boundary that solarsql enforces.
A monorepo would add packaging without useful separation.

## Decision

The repository contains one package.
Each provider uses one solarsql module.
A provider module owns its tables, loading command, and single-table queries.
The report module holds queries that join provider tables.
Solarsql permits a module to write only its own tables.

## Consequences

The core knows a loader by `name`, `tables`, `after`, `load(ctx)`, and optional `self(ctx)`.
It imports each module's `public.ts` from the module list in `spacequery.config.ts`.
Solarsql 0.2.0 writes stubs first, so the configuration imports the loaders and is the one list of providers.
