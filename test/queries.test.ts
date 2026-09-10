// These tests prove the v0 catalog joins against one fixed machine snapshot.
// They do not test command-line rendering or a real provider installation.
import assert from "node:assert/strict";
import { test } from "node:test";
import { catalog } from "../catalog.ts";
import type { Scope } from "../core/loader.ts";
import { runQuery } from "../core/run.ts";
import { loaders } from "../panoram.config.ts";
import { fakeExec, fixtureRepo, paneIds, paths } from "./fixture.ts";

async function query(name: keyof typeof catalog, scope: Scope = "agents", params: Record<string, unknown> = {}) {
  return runQuery(catalog[name]!.query, {
    loaders,
    exec: fakeExec(),
    repo: fixtureRepo,
    env: {},
    scope,
    params,
  });
}

test("agent catalog queries use repository roots and exclude the focused caller", async () => {
  assert.deepEqual((await query("agents")).rows, [
    {
      pane_id: paneIds.alphaWorking,
      name: "Alpha working",
      agent: "claude",
      status: "working",
      cwd: paths.alpha,
      root: paths.alpha,
      workspace_id: "workspace-alpha",
      title: "alpha working",
    },
    {
      pane_id: paneIds.alphaIdle,
      name: null,
      agent: "claude",
      status: "idle",
      cwd: paths.alphaSubdirectory,
      root: paths.alpha,
      workspace_id: "workspace-alpha",
      title: "alpha idle",
    },
    {
      pane_id: paneIds.scratchIdle,
      name: "Scratch idle",
      agent: "claude",
      status: "idle",
      cwd: paths.scratch,
      root: null,
      workspace_id: "workspace-scratch",
      title: "scratch idle",
    },
  ]);
  assert.deepEqual((await query("in-dir", "agents", { root: paths.alpha })).rows, [
    {
      pane_id: paneIds.alphaWorking,
      name: "Alpha working",
      agent: "claude",
      status: "working",
      cwd: paths.alpha,
      title: "alpha working",
    },
    {
      pane_id: paneIds.alphaIdle,
      name: null,
      agent: "claude",
      status: "idle",
      cwd: paths.alphaSubdirectory,
      title: "alpha idle",
    },
  ]);
  assert.deepEqual((await query("working")).rows, [
    {
      pane_id: paneIds.alphaWorking,
      name: "Alpha working",
      agent: "claude",
      root: paths.alpha,
      cwd: paths.alpha,
      title: "alpha working",
    },
  ]);
  assert.deepEqual((await query("workspaces")).rows, [
    { workspace_id: "workspace-alpha", root: paths.alpha, agents: 2, working: 1 },
    { workspace_id: "workspace-beta", root: paths.beta, agents: 1, working: 1 },
    { workspace_id: "workspace-scratch", root: null, agents: 1, working: 0 },
  ]);
});

test("repository catalog queries preserve their ordered rows", async () => {
  assert.deepEqual((await query("dirty")).rows, [
    { root: paths.alpha, branch: "main", dirty_count: 2, untracked_count: 1 },
  ]);
  assert.deepEqual((await query("dirty", "all")).rows, [
    { root: paths.alpha, branch: "main", dirty_count: 2, untracked_count: 1 },
    { root: paths.gamma, branch: "gamma", dirty_count: 1, untracked_count: 0 },
  ]);
  assert.deepEqual((await query("worktrees", "agents", { root: paths.alpha })).rows, [
    { path: paths.alpha, branch: "main", head: "abc" },
    { path: paths.alphaWorktree, branch: "feature", head: "def" },
  ]);
  assert.deepEqual((await query("repos")).rows, [
    { path: paths.alpha, host: "github.com", owner: "o", name: "alpha" },
    { path: paths.beta, host: "github.com", owner: "o", name: "beta" },
    { path: paths.gamma, host: "github.com", owner: "o", name: "gamma" },
  ]);
  assert.deepEqual((await query("tools")).rows, [
    { tool: "node", version: "22.1.0", install_path: "/home/u/.local/share/mise/installs/node/22.1.0", installed: 1, active: 1 },
    { tool: "node", version: "24.10.0", install_path: "/home/u/.local/share/mise/installs/node/24.10.0", installed: 1, active: 0 },
    { tool: "ruby", version: "4.0.6", install_path: null, installed: 0, active: 0 },
  ]);
  assert.deepEqual((await query("tools-in-dir", "agents", { root: paths.alpha })).rows, [
    { tool: "node", version: "24.10.0", source: "/home/u/.config/mise/config.toml", installed: 1 },
    { tool: "ruby", version: "4.0.6", source: "/home/u/src/github.com/o/mise.toml", installed: 0 },
  ]);
});

test("report catalog queries join the fixture tables", async () => {
  assert.deepEqual((await query("agents-in-dirty-repos")).rows, [
    {
      pane_id: paneIds.alphaWorking,
      name: "Alpha working",
      status: "working",
      root: paths.alpha,
      branch: "main",
      dirty_count: 2,
      untracked_count: 1,
    },
    {
      pane_id: paneIds.alphaIdle,
      name: null,
      status: "idle",
      root: paths.alpha,
      branch: "main",
      dirty_count: 2,
      untracked_count: 1,
    },
  ]);
  assert.deepEqual((await query("crowded-repos")).rows, [
    { root: paths.alpha, agents: 2, working: 1, dirty_count: 2 },
  ]);
  assert.deepEqual((await query("idle-worktrees")).rows, [
    { path: paths.alphaWorktree, branch: "feature", repo_root: paths.alpha },
  ]);
  assert.deepEqual((await query("agents-outside-ghq")).rows, [
    { pane_id: paneIds.scratchIdle, name: "Scratch idle", status: "idle", cwd: paths.scratch, root: null },
  ]);
  assert.deepEqual((await query("dirty-unattended", "all")).rows, [
    { root: paths.gamma, branch: "gamma", dirty_count: 1, untracked_count: 0 },
  ]);
  assert.deepEqual((await query("behind-upstream-with-agents")).rows, [
    { root: paths.alpha, branch: "main", upstream: "origin/main", behind: 3, ahead: 2, agents: 2 },
  ]);
  assert.deepEqual((await query("behind-upstream-with-agents", "agents", { me: paneIds.alphaWorking })).rows, [
    { root: paths.alpha, branch: "main", upstream: "origin/main", behind: 3, ahead: 2, agents: 1 },
  ]);
  assert.deepEqual((await query("missing-tools-with-agents")).rows, [
    { root: paths.alpha, tool: "ruby", version: "4.0.6", source: "/home/u/src/github.com/o/mise.toml", agents: 2 },
  ]);
  assert.deepEqual((await query("missing-tools-with-agents", "agents", { me: paneIds.alphaWorking })).rows, [
    { root: paths.alpha, tool: "ruby", version: "4.0.6", source: "/home/u/src/github.com/o/mise.toml", agents: 1 },
    { root: paths.beta, tool: "ruby", version: "4.0.6", source: "/home/u/src/github.com/o/mise.toml", agents: 1 },
  ]);
  const split = await query("tool-versions-split");
  assert.deepEqual(split.rows, []);
});
