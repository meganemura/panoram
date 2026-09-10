# 0010. Ad hoc SQL is for a person at a shell.

Date: 2026-09-10

Status: accepted

## Context

A named query has a name the skill can promise to an agent, and the catalog keeps that promise.
A query text has no such name.
A person at a shell needs to inspect a relation the catalog does not have yet.

## Decision

`--sql` accepts ad hoc SQL and resolves its providers the same way a named query does.
`:root` and `:me` in the text bind from the same flags a named query uses; any other `:name` is an error.
The skill for agents lists the named queries and leaves `--sql` out.

## Consequences

An ad hoc statement pays only for the providers it reads.
Nothing stops an agent from calling `--sql`; the skill is where the boundary lives.
A question that a person asks more than once becomes a named query.
