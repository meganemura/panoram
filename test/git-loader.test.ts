// These tests prove the git loader parses porcelain output and de-duplicates worktrees.
// They do not invoke git or validate git's own porcelain format.
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadLoaders } from "../core/registry.ts";
import { runSql } from "../core/run.ts";
import { fakeExec, fixtureAgentsWithLinkedWorktree, paths } from "./fixture.ts";

test("git status preserves branch divergence and dirty counts", async () => {
  const alpha = await runSql(
    "select branch, upstream, ahead, behind, dirty_count, untracked_count from git_status where root = :root",
    {
      loaders: await loadLoaders(),
      exec: fakeExec(),
      env: {},
      scope: "all",
      params: { root: paths.alpha },
    },
  );
  assert.deepEqual(alpha.rows, [
    { branch: "main", upstream: "origin/main", ahead: 2, behind: 3, dirty_count: 2, untracked_count: 1 },
  ]);

  const gamma = await runSql("select upstream from git_status where root = :root", {
    loaders: await loadLoaders(),
    exec: fakeExec(),
    env: {},
    scope: "all",
    params: { root: paths.gamma },
  });
  assert.deepEqual(gamma.rows, [{ upstream: null }]);
});

test("a linked worktree root does not duplicate worktree rows", async () => {
  const result = await runSql("select path, repo_root, branch, head from worktrees order by path", {
    loaders: await loadLoaders(),
    exec: fakeExec({ agents: fixtureAgentsWithLinkedWorktree() }),
    env: {},
    scope: "agents",
    params: {},
  });
  assert.deepEqual(result.rows, [
    { path: paths.alpha, repo_root: paths.alpha, branch: "main", head: "abc" },
    { path: paths.alphaWorktree, repo_root: paths.alpha, branch: "feature", head: "def" },
    { path: paths.beta, repo_root: paths.beta, branch: "main", head: "beta" },
  ]);
});
