# 0029. Repository configuration files are a bounded inventory.

Date: 2026-09-11

Status: accepted

## Context

An agent must identify relevant dependency, language, and tool files before it
selects detailed parsers. An arbitrary file search exposes unrelated names and
sensitive generic files. Parsing every recognized source makes inventory depend
on content validity and can consume much more data than the question requires.

The repository version reader already defines known source names, safe file
reads, workspace declarations, traversal limits, and excluded directories.
Inventory and evidence queries must use the same project boundary.

## Decision

The repository configuration file provider checks a fixed source catalog at
the repository root and in npm workspaces declared by the root package file.
It does not search other directories. It reads the root `package.json` as
bounded static data only for workspace discovery. Other listed file bodies are
not read. It never evaluates configuration or starts a
repository process.

The source catalog records a format, category, and parser capability. Parser
capability means that the repository version reader has a static parser for the
name. It does not mean that one observed file has valid content. A regular
unsupported source is still a successful file observation. `Brewfile` is an
unsupported tool configuration because Ruby evaluation is outside this reader.

File rows and discovery rows have separate observation kinds. A symbolic link
or special file produces a skipped file row. Unsupported workspace syntax and
workspace links produce incomplete discovery rows. Read and traversal failures
produce error discovery rows. Incomplete and error discovery makes the provider
fail, so strict callers cannot accept partial coverage.

The root query resolves its root from Git metadata files. It uses no external
process. A separate wide query uses agent roots by default and ghq roots only
with `--scope all`.

## Consequences

The inventory guides parser selection without exposing file content. It can
list a malformed or oversized supported source because it does not validate
that source. A version query can later report a parse or size error.

Workspace discovery retains the repository version reader's current bounds and
filesystem checks. These checks reduce risk but do not promise a race-free scan
of a hostile filesystem.
