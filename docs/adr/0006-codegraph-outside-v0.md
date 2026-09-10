# 0006. CodeGraph is not a provider in v0.

Date: 2026-09-10

Status: accepted

## Context

CodeGraph stores its index in `.codegraph/codegraph.db`, a SQLite file per repository.
Its `files.path` values are relative to the repository, so a row carries no value that joins on `root`.
SQLite attaches at most 10 databases to one connection, and the machine has 65 repositories.
A provider that copied every index into the in-memory database would read every repository on every call.

## Decision

CodeGraph is not a provider in v0.

## Consequences

The v0 providers are herdr, git, and ghq.
A CodeGraph provider needs a loader that adds the repository root to each row it copies, and a scope that keeps the copy small.
