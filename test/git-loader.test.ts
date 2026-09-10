// These tests prove the git loader parses porcelain output and de-duplicates worktrees.
// They do not invoke git or validate git's own porcelain format.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import type { Exec, Loader } from "../core/loader.ts";
import { loadLoaders } from "../core/registry.ts";
import { runSql } from "../core/run.ts";
import { gitLoader } from "../providers/git/loader.ts";
import { herdrLoader } from "../providers/herdr/loader.ts";
import { repoLoader } from "../providers/repos/loader.ts";
import { fakeExec, fixtureAgentsWithLinkedWorktree, paths } from "./fixture.ts";

const loaderSet: Loader[] = [repoLoader, herdrLoader, gitLoader];

type GitStatusScenario = {
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  dirtyCount: number;
  untrackedCount: number;
  output: string;
};

type WorktreeEntry = { path: string; branch: string | null; head: string };

const statusScenario = gs.composite<GitStatusScenario>((tc) => {
  const branch = tc.draw(gs.fromRegex("[A-Za-z0-9._/-]{1,20}"));
  const upstream = tc.draw(gs.optional(gs.fromRegex("[A-Za-z0-9._/-]{1,20}")));
  const ahead = upstream === null ? 0 : tc.draw(gs.integers({ minValue: 0, maxValue: 1_000_000 }));
  const behind = upstream === null ? 0 : tc.draw(gs.integers({ minValue: 0, maxValue: 1_000_000 }));
  const entries = tc.draw(gs.arrays(gs.sampledFrom(["1", "2", "u", "?", "!"] as const)));
  const output = [
    `# branch.oid ${tc.draw(gs.text({ minSize: 1, alphabet: "0123456789abcdef" }))}`,
    `# branch.head ${branch}`,
    ...(upstream === null ? [] : [`# branch.upstream ${upstream}`, `# branch.ab +${ahead} -${behind}`]),
    ...entries.map((entry) => `${entry} ${tc.draw(gs.text({ codec: "ascii", excludeCharacters: "\r\n" }))}`),
    "",
  ].join("\n");
  return {
    branch,
    upstream,
    ahead,
    behind,
    dirtyCount: entries.filter((entry) => entry === "1" || entry === "2" || entry === "u").length,
    untrackedCount: entries.filter((entry) => entry === "?").length,
    output,
  };
});

const worktreeScenario = gs.composite<WorktreeEntry[]>((tc) => {
  const paths = tc.draw(gs.arrays(gs.fromRegex("[a-z]{1,6}").map((name) => `/r/${name}`), { minSize: 1, maxSize: 8, unique: true }));
  return paths.map((path) => ({
    path,
    branch: tc.draw(gs.optional(gs.text({ minSize: 1, codec: "ascii", excludeCharacters: "\r\n" }))),
    head: tc.draw(gs.text({ minSize: 1, codec: "ascii", excludeCharacters: "\r\n" })),
  }));
});

function snapshotForRoots(roots: readonly string[]): string {
  return JSON.stringify({
    result: {
      snapshot: {
        agents: roots.map((cwd, index) => ({
          pane_id: `w${index}:p0`,
          agent: "claude",
          agent_status: "working",
          agent_session: { value: `session-${index}` },
          focused: false,
          cwd,
        })),
      },
    },
  });
}

function worktreeOutput(entries: readonly WorktreeEntry[]): string {
  return [...entries.flatMap((entry) => [
    `worktree ${entry.path}`,
    `HEAD ${entry.head}`,
    ...(entry.branch === null ? [] : [`branch refs/heads/${entry.branch}`]),
    "",
  ])].join("\n");
}

function gitFixture(status: string, worktrees: string, roots: readonly string[]): Exec {
  return async (command, args, cwd) => {
    const invocation = args.join(" ");
    if (command === "herdr" && invocation === "api snapshot") return snapshotForRoots(roots);
    if (command === "ghq" && invocation === "list -p") return "";
    if (command === "git" && invocation === "rev-parse --show-toplevel") return cwd ?? "";
    if (command === "git" && invocation === "worktree list --porcelain") return worktrees;
    if (command === "git" && invocation === "status --porcelain=2 --branch") return status;
    throw new Error(`unexpected fake command: ${command} ${invocation} in ${cwd ?? ""}`);
  };
}

function expectedWorktrees(entries: readonly WorktreeEntry[]): Record<string, unknown>[] {
  return entries.map((entry) => ({
    path: entry.path,
    repo_root: entries[0]!.path,
    branch: entry.branch,
    head: entry.head,
  })).sort((a, b) => String(a.path).localeCompare(String(b.path)));
}

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

test("git status parses every porcelain v2 entry class", () => hegel.testAsync(async (tc) => {
  const scenario = tc.draw(statusScenario);
  const root = "/r/status";
  const result = await runSql(
    "select branch, upstream, ahead, behind, dirty_count, untracked_count from git_status",
    {
      loaders: loaderSet,
      exec: gitFixture(scenario.output, `worktree ${root}\nHEAD 0\n\n`, [root]),
      env: {},
      scope: "agents",
      params: {},
    },
  );

  assert.deepEqual(result.rows, [{
    branch: scenario.branch,
    upstream: scenario.upstream,
    ahead: scenario.ahead,
    behind: scenario.behind,
    dirty_count: scenario.dirtyCount,
    untracked_count: scenario.untrackedCount,
  }]);
}));

test("git worktrees preserve the main root and ignore a duplicate listing", () => hegel.testAsync(async (tc) => {
  const entries = tc.draw(worktreeScenario);
  const output = worktreeOutput(entries);
  const expected = expectedWorktrees(entries);
  const first = await runSql("select path, repo_root, branch, head from worktrees order by path", {
    loaders: loaderSet,
    exec: gitFixture("# branch.head main\n", output, [entries[0]!.path]),
    env: {},
    scope: "agents",
    params: {},
  });

  assert.deepEqual(first.rows, expected);
  if (entries.length > 1) {
    const second = await runSql("select path, repo_root, branch, head from worktrees order by path", {
      loaders: loaderSet,
      exec: gitFixture("# branch.head main\n", output, [entries[0]!.path, entries[1]!.path]),
      env: {},
      scope: "agents",
      params: {},
    });
    assert.deepEqual(second.rows, expected);
  }
}));
