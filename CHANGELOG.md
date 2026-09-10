# Changelog

The format follows Keep a Changelog, and the versions follow SemVer. Before 1.0 a minor version may change the queries, the tables, or the flags; the entry says what changed.

## 0.1.0 (unreleased)

The first release.

- A query layer over one developer's machine: each call observes the providers, joins them in an in-memory SQLite database, and prints rows. No cache, no writes to a provider.
- Providers: herdr (agents and panes), git (status and worktrees), ghq (repositories), mise (tools and the versions a root activates), sessions (Claude Code and Codex sessions alive now), GitHub through gh (open pull requests, requested reviews), processes (ps and lsof: processes and listening ports in scope), skills and plugins of Claude Code and Codex, beads (open issues), headsign (workflow state).
- 45 named queries; the joins live in one report module, and every join is on the repository root.
- The caller's own pane is resolved from the environment and excluded (`me`).
- The JSON envelope carries `rows` and `providers` (`ok`, `observed_at`, `ms`, `error` per provider); `--tsv` prints rows only.
- A query pays only for the tables it reads: a named query through its generated metadata, ad hoc SQL (`--sql`) through an authorizer probe.
- User-defined queries: one SQL file per query under `$XDG_CONFIG_HOME/panoram/queries/`, parameters bound from flags, listed in `--help`.
- The usage documentation is a skill, `skills/panoram/SKILL.md` with references, shipped in the package and installable with `gh skill install`.
- Tests on node:test with hegel property tests; every provider runs through an injectable exec, so no test runs a real tool.
