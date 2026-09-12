# 0006. CodeGraph is not a provider.

Date: 2026-09-10

Status: accepted

## Context

CodeGraph stores its index in `.codegraph/codegraph.db`, a SQLite file per repository.
Its `files.path` values are relative to the repository, so a row carries no value that joins on `root`.
SQLite attaches at most 10 databases to one connection, and the machine has more than 60 repositories.
A provider that copied every index into the in-memory database would read every repository on every call.

## Decision

CodeGraph is not a provider.
The owner confirmed on 2026-09-10 that the question a CodeGraph provider would answer, whether an index is current, is not one spacequery needs.

## Consequences

The providers read tools that describe a repository from the outside; the contents of a repository stay with the tools that index them.
