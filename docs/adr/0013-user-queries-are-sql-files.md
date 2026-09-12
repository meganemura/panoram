# 0013. User queries are SQL files.

Date: 2026-09-10

Status: accepted

## Context

ADR 0010 says a question a person asks more than once becomes a named query.
The repository was the only place to keep that query.
A person needs a local name without a build.

## Decision

spacequery reads one SQL file for each user query from `$XDG_CONFIG_HOME/spacequery/queries`.
It uses `~/.config/spacequery/queries` when `XDG_CONFIG_HOME` is unset.
The file name gives the query name.
The first line gives the description when it starts with `-- `.
The command binds parameters from flags.
The built in catalog wins when names match.

## Consequences

A user query needs no build step.
A user query has no types.
`--help` is the catalog an agent reads.
A broken statement fails at call time with the engine message.
