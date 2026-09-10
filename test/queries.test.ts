// These tests prove the v0 catalog joins against one fixed machine snapshot.
// They do not test command-line rendering or a real provider installation.
import assert from "node:assert/strict";
import { test } from "node:test";
import { catalog } from "../catalog.ts";
import type { Exec, Loader, Scope } from "../core/loader.ts";
import { runQuery } from "../core/run.ts";
import { loaders } from "../panoram.config.ts";
import { sessionCommands } from "../providers/sessions/module.ts";
import type { SessionsId } from "../providers/sessions/solarsql.generated.ts";
import { fakeExec, fixtureRepo, paneIds, paths, sessionIds } from "./fixture.ts";

const sessionFixtureLoader: Loader = {
  name: "sessions",
  tables: ["sessions", "claude_sessions", "codex_sessions"],
  after: [],
  async load(ctx) {
    const recorded = await ctx.db.run(sessionCommands.load, {
      rows: [{
        session_id: sessionIds.alphaWorking as SessionsId,
        agent: "claude",
        pid: null,
        cwd: paths.alpha,
        root: paths.alpha,
        name: "session needle",
        started_at: null,
        updated_at: null,
        last_turn_at: null,
        last_branch: null,
      }],
    });
    if (!recorded.ok) throw new Error(`sessions: ${recorded.kind}`);
  },
};

const fixtureLoaders = loaders.map((loader) => loader.name === "sessions" ? sessionFixtureLoader : loader);

async function query(name: keyof typeof catalog, scope: Scope | undefined = undefined, params: Record<string, unknown> = {}, exec: Exec = fakeExec()) {
  const options = {
    loaders: fixtureLoaders,
    exec,
    repo: fixtureRepo,
    env: {},
    params,
  };
  return runQuery(catalog[name]!.query, scope === undefined ? options : { ...options, scope });
}

function gitStatusExec(cwds: string[]): Exec {
  const base = fakeExec();
  return async (command, args, cwd, options) => {
    if (command === "git" && args[0] === "--no-optional-locks" && args[1] === "status") cwds.push(cwd!);
    return base(command, args, cwd, options);
  };
}

function githubExec(fork = false): Exec {
  const base = fakeExec();
  return async (command, args, cwd, options) => {
    if (command === "gh" && args[0] === "api" && args[1] === "graphql") {
      const aliases = [...(args[3] ?? "").matchAll(/r(\d+): repository\(owner: "([^"]+)", name: "([^"]+)"\)/g)];
      const data = Object.fromEntries(aliases.map(([, index, owner, name]) => {
        const repo = `${owner}/${name}`;
        const number = repo === "example/alpha" ? 7 : 8;
        return [`r${index}`, {
          pullRequests: {
            nodes: [{
              number,
              title: repo === "example/alpha" ? "Alpha" : "Beta",
              headRefName: "main",
              headRepository: { nameWithOwner: fork ? "example/fork" : repo },
              baseRefName: "trunk",
              author: { login: "octo" },
              isDraft: false,
              state: "OPEN",
              reviewDecision: "APPROVED",
              updatedAt: "2026-09-10T00:00:00Z",
              url: `https://example.test/${repo}/${number}`,
              commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] },
            }],
          },
        }];
      }));
      return JSON.stringify({ data });
    }
    return base(command, args, cwd, options);
  };
}

test("agent catalog queries use repository roots and exclude the focused caller", async () => {
  assert.deepEqual((await query("agents")).rows, [
    {
      pane_id: paneIds.alphaWorking,
      name: "Alpha working",
      agent: "claude",
      agent_status: "working",
      cwd: paths.alpha,
      root: paths.alpha,
      workspace_id: "workspace-alpha",
      title: "alpha working",
    },
    {
      pane_id: paneIds.alphaIdle,
      name: null,
      agent: "claude",
      agent_status: "idle",
      cwd: paths.alphaSubdirectory,
      root: paths.alpha,
      workspace_id: "workspace-alpha",
      title: "alpha idle",
    },
    {
      pane_id: paneIds.scratchIdle,
      name: "Scratch idle",
      agent: "claude",
      agent_status: "idle",
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
      agent_status: "working",
      cwd: paths.alpha,
      title: "alpha working",
    },
    {
      pane_id: paneIds.alphaIdle,
      name: null,
      agent: "claude",
      agent_status: "idle",
      cwd: paths.alphaSubdirectory,
      title: "alpha idle",
    },
  ]);
  assert.deepEqual((await query("working")).rows, [
    {
      pane_id: paneIds.alphaWorking,
      name: "Alpha working",
      agent: "claude",
      agent_status: "working",
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

test("find matches an agent name, title, root, session name, or no agent", async () => {
  const find = async (q: string) => (await query("find", "agents", { q, me: null })).rows;
  assert.deepEqual(await find("Alpha working"), [{
    pane_id: paneIds.alphaWorking,
    agent: "claude",
    agent_status: "working",
    name: "Alpha working",
    title: "alpha working",
    root: paths.alpha,
    cwd: paths.alpha,
    session_name: "session needle",
  }]);
  assert.deepEqual(await find("alpha idle"), [{
    pane_id: paneIds.alphaIdle,
    agent: "claude",
    agent_status: "idle",
    name: null,
    title: "alpha idle",
    root: paths.alpha,
    cwd: paths.alphaSubdirectory,
    session_name: null,
  }]);
  assert.deepEqual(await find(paths.beta), [{
    pane_id: paneIds.betaWorking,
    agent: "claude",
    agent_status: "working",
    name: "Beta working",
    title: "beta working",
    root: paths.beta,
    cwd: paths.beta,
    session_name: null,
  }]);
  assert.deepEqual(await find("session needle"), [{
    pane_id: paneIds.alphaWorking,
    agent: "claude",
    agent_status: "working",
    name: "Alpha working",
    title: "alpha working",
    root: paths.alpha,
    cwd: paths.alpha,
    session_name: "session needle",
  }]);
  assert.deepEqual(await find("not in this fixture"), []);
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
  assert.deepEqual((await query("git-status", "agents", { root: paths.gamma })).rows, [
    { root: paths.gamma, branch: "gamma", upstream: null, ahead: 0, behind: 0, dirty_count: 1, untracked_count: 0 },
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

test("a root-bound query runs git status on that root only by default", async () => {
  const cwds: string[] = [];
  await query("git-status", undefined, { root: paths.alpha }, gitStatusExec(cwds));
  assert.deepEqual(cwds, [paths.alpha]);
});

test("a query without root still runs git status on every agent root", async () => {
  const cwds: string[] = [];
  await query("dirty", undefined, {}, gitStatusExec(cwds));
  assert.deepEqual(cwds, [paths.alpha, paths.beta]);
});

test("the agents scope overrides a root-bound query default", async () => {
  const cwds: string[] = [];
  await query("git-status", "agents", { root: paths.alpha }, gitStatusExec(cwds));
  assert.deepEqual(cwds, [paths.alpha, paths.beta]);
});

test("report catalog queries join the fixture tables", async () => {
  assert.deepEqual((await query("agents-in-dirty-repos")).rows, [
    {
      pane_id: paneIds.alphaWorking,
      name: "Alpha working",
      agent_status: "working",
      root: paths.alpha,
      branch: "main",
      dirty_count: 2,
      untracked_count: 1,
    },
    {
      pane_id: paneIds.alphaIdle,
      name: null,
      agent_status: "idle",
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
    { pane_id: paneIds.scratchIdle, name: "Scratch idle", agent_status: "idle", cwd: paths.scratch, root: null },
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
  assert.deepEqual((await query("agents-with-sessions")).rows, [
    {
      pane_id: paneIds.alphaWorking,
      agent: "claude",
      agent_status: "working",
      name: "session needle",
      claude_status: null,
      kind: null,
      model: null,
      source: null,
      started_at: null,
      updated_at: null,
      last_turn_at: null,
      last_branch: null,
      root: paths.alpha,
      idle_minutes: null,
    },
    {
      pane_id: paneIds.alphaIdle,
      agent: "claude",
      agent_status: "idle",
      name: null,
      claude_status: null,
      kind: null,
      model: null,
      source: null,
      started_at: null,
      updated_at: null,
      last_turn_at: null,
      last_branch: null,
      root: paths.alpha,
      idle_minutes: null,
    },
    {
      pane_id: paneIds.scratchIdle,
      agent: "claude",
      agent_status: "idle",
      name: null,
      claude_status: null,
      kind: null,
      model: null,
      source: null,
      started_at: null,
      updated_at: null,
      last_turn_at: null,
      last_branch: null,
      root: null,
      idle_minutes: null,
    },
  ]);
  assert.deepEqual((await query("branch-pull-requests", "agents", { root: paths.alpha }, githubExec())).rows, [
    { repo: "example/alpha", number: 7, title: "Alpha", head_branch: "main", checks: "pass", review_decision: "APPROVED", is_draft: 0, url: "https://example.test/example/alpha/7" },
  ]);
  assert.deepEqual((await query("branch-pull-requests", "agents", { root: paths.alpha }, githubExec(true))).rows, []);
});
