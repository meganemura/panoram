# 0011. The schema uses one regenerated migration.

Date: 2026-09-10

Status: accepted

## Context

Every call creates a new database.
Migration history gives no runtime value for that database.

## Decision

The schema uses one regenerated migration.
For a schema change, delete `migrations/`.
Run `npx solarsql build spacequery.config.ts`.
Run `npx solarsql migration initial spacequery.config.ts`.
Commit the regenerated files.

## Consequences

The migration describes the current schema from zero.
The repository keeps one schema artifact for each version.
