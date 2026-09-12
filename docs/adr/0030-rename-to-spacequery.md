# 0030. The tool is renamed spacequery.

Date: 2026-09-12

Status: accepted

## Context

ADR 0001 named the tool panoram, the verb form of panorama, for "a wide view".
The name did not state the tool's job.
The tool answers questions about one machine's workspace: its repositories, worktrees, sessions, and tools.
The npm package `panoram@0.1.0` was live for less than 72 hours, so the owner unpublished it.
The name `spacequery` was not registered on npm.

## Decision

The tool is named `spacequery`, short for workspace query.
The npm package, the command, the skill directory, the state directory (`$XDG_STATE_HOME/spacequery`), and the user-query directory (`$XDG_CONFIG_HOME/spacequery`) take the name.
There is no compatibility path for the old directories.
The tool had no release that a user depends on.

## Consequences

ADR 0001 is superseded.
A machine that ran panoram keeps its old call log and user queries under the old directory.
The owner moves them by hand.
