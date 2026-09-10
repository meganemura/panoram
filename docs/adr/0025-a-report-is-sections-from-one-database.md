# 0025. A report is sections from one database.

Date: 2026-09-11

Status: accepted

## Context

One workflow needs nine queries about one repository root.
Separate calls run the same loaders nine times before an agent can act.

## Decision

A report is an ordered list of named catalog queries on one database.
The core resolves loaders from the union of the sections' `reads` metadata,
runs each loader once, and then runs every section query with the same bound
parameters.
`here` is the first report.
A report composes catalog entries; it is not a new kind of query.

## Consequences

One call observes each provider at most once.
The report `providers` list is the union of its section providers.
A user cannot define a report in this version.
`--expect-empty` on `here` reads its `agents` section.
