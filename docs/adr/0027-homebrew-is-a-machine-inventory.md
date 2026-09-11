# 0027. Homebrew is a machine inventory.

Date: 2026-09-11

Status: accepted

## Context

mise reports installed tool versions and the version requests for each repository.
Homebrew also installs command-line tools and applications, but its package names do not identify their executable names.
A Homebrew package is installed for the machine and has no repository root.

`brew list --versions --json` gives structured local data through the fast Bash path, but it requires `jq`.
`brew list --formula --versions` and `brew list --cask --versions` read the local installation without that extra runtime requirement.

## Decision

The brew provider owns `brew_packages`.
It records one row for each installed formula or cask version.
The loader starts both local list commands and writes rows only after both commands answer.

`installed-software` combines installed mise versions and Homebrew packages with a source column.
It does not join their names or infer executable identity.

## Consequences

A failed formula or cask list leaves the table empty and records a failed provider row.
The provider does not check for newer versions and does not contact a remote service.
The provider cannot answer which executable came from a package.
