// These tests prove statement-to-loader resolution from migrated schema metadata.
// They do not execute a provider or inspect a provider's output.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { catalog } from "../catalog.ts";
import type { Loader } from "../core/loader.ts";
import { loadersFor, tablesRead } from "../core/resolve.ts";
import { migrations } from "../migrations/index.ts";
import { migrate } from "solarsql/node";

function migratedDatabase(): DatabaseSync {
  const raw = new DatabaseSync(":memory:");
  migrate(raw, migrations);
  return raw;
}

test("tablesRead finds every catalog query's declared tables", () => {
  const raw = migratedDatabase();
  try {
    const expected: Record<keyof typeof catalog, string[]> = {
      agents: ["agents"],
      "in-dir": ["agents"],
      working: ["agents"],
      workspaces: ["agents"],
      dirty: ["git_status"],
      worktrees: ["worktrees"],
      repos: ["repos"],
      "agents-in-dirty-repos": ["agents", "git_status"],
      "crowded-repos": ["agents", "git_status"],
      "idle-worktrees": ["agents", "worktrees"],
      "agents-outside-ghq": ["agents", "repos"],
      "dirty-unattended": ["agents", "git_status"],
      "behind-upstream-with-agents": ["agents", "git_status"],
    };
    for (const [name, named] of Object.entries(catalog) as [keyof typeof catalog, (typeof catalog)[keyof typeof catalog]][]) {
      assert.deepEqual(tablesRead(raw, named.query.sql).sort(), expected[name]);
    }
  } finally {
    raw.close();
  }
});

test("loadersFor includes dependencies in configuration order", () => {
  const loaders: Loader[] = [
    { name: "repos", tables: ["repos"], after: [], async load() {} },
    { name: "herdr", tables: ["agents"], after: [], async load() {} },
    { name: "git", tables: ["git_status"], after: ["herdr", "repos"], async load() {} },
  ];
  assert.deepEqual(loadersFor(loaders, ["git_status"]).map((loader) => loader.name), ["repos", "herdr", "git"]);
  assert.deepEqual(loadersFor(loaders, ["agents"]).map((loader) => loader.name), ["herdr"]);
  assert.deepEqual(loadersFor(loaders, ["unknown"]).map((loader) => loader.name), []);
});

test("loadersFor rejects cycles and missing dependencies", () => {
  const cycle: Loader[] = [
    { name: "a", tables: ["a"], after: ["b"], async load() {} },
    { name: "b", tables: ["b"], after: ["a"], async load() {} },
  ];
  const missing: Loader[] = [{ name: "a", tables: ["a"], after: ["missing"], async load() {} }];
  assert.throws(() => loadersFor(cycle, ["a"]), /loader cycle: a -> b -> a/);
  assert.throws(() => loadersFor(missing, ["a"]), /loader a runs after missing, which is not configured/);
});
