# 0003. The repository root joins provider data.

Date: 2026-09-10

Status: accepted

## Context

Agents report a current working directory.
The same repository can have many working directories and worktrees.
Provider joins need one shared value.

## Decision

The herdr loader resolves each agent directory in-process by walking to the nearest `.git` entry.
It stores the result as `root`.
It handles both checkout directories and linked-worktree `.git` files.
Every provider join uses `root`.
A checkout that ghq creates has the same path string as its Git root.

## Consequences

An agent outside a repository keeps a null `root` and remains in `agents`.
Queries can therefore report agents outside repositories.
The git loader runs git itself. It uses `--no-optional-locks` for status so Git does not refresh the index by writing it. A separate git reader was considered and not adopted, because the two git calls a root needs are the whole of the loader.
