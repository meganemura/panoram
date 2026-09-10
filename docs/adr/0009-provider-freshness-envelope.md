# 0009. The envelope carries provider freshness.

Date: 2026-09-10

Status: accepted

## Context

A caller wants to know how fresh the rows are before it trusts them.
Every row of one call comes from the loaders of that call, and each loader has one start time and one duration.
A provider column and a timestamp on each row would repeat one fact once per row.

## Decision

JSON output carries `providers` beside `rows`.
A provider row carries `name`, `ok`, `observed_at`, `ms`, and `error`.
Result rows do not carry a provider name or timestamp.

## Consequences

The envelope records freshness once per provider.
A row holds query data only.
TSV prints the rows only and writes a failed provider to standard error.
A caller that needs `observed_at` reads JSON.
