// Provider: git. The loader runs `git worktree list --porcelain` and
// `git status --porcelain=2 --branch` on each repository root in scope.
// Boundary: the two tables, their loading commands, and single-table
// queries. Joins with other providers live in the report module.
import { commands, queries, table } from "solarsql";
import { generated } from "./solarsql.generated.ts";

export const worktrees = table(`
  create table worktrees (
    path text primary key not null,
    repo_root text not null,
    branch text,
    head text
  ) strict
`);

export const git_status = table(`
  create table git_status (
    root text primary key not null,
    branch text,
    upstream text,
    ahead integer not null default 0,
    behind integer not null default 0,
    dirty_count integer not null default 0,
    untracked_count integer not null default 0,
    observed_at integer not null
  ) strict
`);

export const gitQueries = queries(generated, {
  // Repositories with uncommitted changes, dirtiest first.
  dirty: `
    select root, branch, dirty_count, untracked_count
    from git_status where dirty_count > 0 order by dirty_count desc, root`,
  // The worktrees of one repository, by its main root.
  worktreesOf: `
    select path, branch, head from worktrees where repo_root = :root order by path`,
});

export const gitCommands = commands(generated, {
  // `insert or ignore`: a linked worktree is itself a root in scope, and
  // listing from it names the same set again.
  loadWorktrees: {
    plan: [
      `insert or ignore into worktrees (path, repo_root, branch, head)
       select value ->> 'path', value ->> 'repo_root', value ->> 'branch', value ->> 'head' from json_each(:rows)`,
    ],
  },
  loadStatus: {
    plan: [
      `insert or ignore into git_status (root, branch, upstream, ahead, behind, dirty_count, untracked_count, observed_at)
       select value ->> 'root', value ->> 'branch', value ->> 'upstream', value ->> 'ahead', value ->> 'behind',
              value ->> 'dirty_count', value ->> 'untracked_count', value ->> 'observed_at' from json_each(:rows)`,
    ],
  },
});
