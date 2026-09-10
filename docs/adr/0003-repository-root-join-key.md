# 0003. The repository root joins provider data.

Date: 2026-09-10

Status: accepted

## Context

Agents report a current working directory.
The same repository can have many working directories and worktrees.
Provider joins need one shared value.

## Decision

The herdr loader resolves each agent directory with `git rev-parse --show-toplevel`.
It stores the result as `root`.
Each distinct directory takes 14 ms, and the calls run concurrently.
Every provider join uses `root`.
A checkout that ghq creates has the same path string as its Git root.

## Consequences

An agent outside a repository keeps a null `root` and remains in `agents`.
Queries can therefore report agents outside repositories.
The git loader runs git itself. A separate git reader was considered and not adopted, because the two git calls a root needs are the whole of the loader.
