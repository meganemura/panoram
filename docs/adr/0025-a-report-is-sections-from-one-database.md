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
Measured after the change, on 2026-09-11 for this repository: `here` takes 1.1 to 1.4 s wall time (github 0.5 s, processes 0.2 to 0.4 s, mise 0.1 to 0.2 s, git 15 ms) instead of 5.4 s when every loader visited the roots of all 22 agents.
