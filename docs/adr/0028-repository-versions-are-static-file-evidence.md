# 0028. Repository versions are static file evidence.

Date: 2026-09-11

Status: accepted

## Context

A repository can request runtime and library versions in files.
Some files are data, while other files are programs or complex configuration languages.
A package manager or version manager can execute repository code, install plugins, contact a service, or change local state.
A lock file records an earlier resolver result.
It does not prove which library or runtime is installed now.

Monorepos can contain several manifests and several copies of one package.
An npm lock can contain different versions of one package at different locations.
A dependency request does not identify one lock entry without package manager resolution.

## Decision

The repository versions provider reads files as data.
It starts no process and performs no resolution, import, install, or network request.
Declaration rows and lock rows stay separate.
Each row names its source file and a locator inside that file.
The provider keeps duplicate lock versions at their package locations.

The `repository-versions` query supports one root only.
Its command finds the root from Git metadata files instead of running Git.
Cross-repository queries use roots from herdr under the default scope.
An explicit `--scope all` also uses roots from ghq.
The provider records each discovery failure in the call's provider status.
The wide queries reject root scope because they have no root parameter.

The reader supports fixed `.node-version`, `.python-version`, `.ruby-version`, and `.tool-versions` values.
It supports `package.json`, npm lock files at versions 2 and 3, and bounded `Gemfile.lock` sections.
It reports known program, TOML, and unsupported lock formats as unsupported sources.
Dynamic values and local, workspace, alias, Git, URL, tarball, or linked npm references stay unresolved.
The reader does not parse `Gemfile`, because that file is Ruby code.

The reader inspects known source names at the root.
It also inspects npm projects selected by the root `workspaces` field.
Workspace selection supports literal segments, `*`, `?`, and `**`.
Other pattern syntax produces an unsupported row.
Nested workspace declarations do not add projects.

Workspace discovery visits at most 2,000 entries through depth 12.
It accepts at most 100 patterns and 500 projects.
One root emits at most 50,000 evidence rows.
A row-limit failure adds one final diagnostic row.
It skips generated, vendor, cache, and agent work directories.
It accepts at most 2 MiB from one regular file and 16 MiB in one scan.
It reads one extra byte to detect each overflow.
It follows no symbolic link.
An incomplete scan, read error, or parse error records an error row and fails the provider.
Unsupported formats and unresolved values keep a successful provider status.

Dependency rows record the manifest section as a role.
They also record whether the evidence came from a manifest or a lock file.
Cross-repository summaries use observed npm manifest declarations.
They exclude lock evidence and unresolved references.
The summary counts repositories, checkouts, projects, declarations, and distinct request strings.
An opaque identity from the validated common Git directory joins linked worktrees for the repository count.
The identity reader accepts only small regular `.git` and `commondir` metadata files and validated directory targets.
It follows no symbolic metadata path and starts no process.
It keeps the common directory path internal and does not read Git configuration or hooks.
A directory without Git metadata gets an isolated root identity.
Malformed or unreadable Git metadata produces an error row and an incomplete provider result.
Rows with an unknown identity remain evidence but do not contribute to shared totals.
Separate clones remain separate local repositories, including clones with the same origin URL.
The scope still supplies checkout roots from agents or ghq. The provider does not add registered worktrees.
It keeps sorted request strings as JSON text.
These strings are requests and do not state compatibility.
The dependency report returns its summary and source coverage from one provider load.
Its empty-result gate uses the shared summary section.

## Consequences

`repository-versions` shows what repository files request or lock.
It does not show an active runtime, an installed package, or a resolved dependency graph.
The separate rows prevent a false match between a declaration and a nested lock entry.
The declared workspace list prevents an unrelated fixture manifest from becoming project evidence.
The bounds make the result incomplete when a repository exceeds them, and the provider reports that condition.
