# 0020. Headsign state is read from the file.

Date: 2026-09-10

Status: accepted

## Context

Headsign has no command on PATH.
Its `.headsign/state.json` file holds the current workflow state.

## Decision

The provider reads that file only.
It stores nested `attempts` and `last_failure` values as JSON text.

## Consequences

The file read costs milliseconds.
A change to the file shape reports a parse failure that names the affected root in the providers row.
