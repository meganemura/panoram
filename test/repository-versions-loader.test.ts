// These tests prove that static repository evidence stays separate and that
// repository content cannot make the provider start a process.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import { catalog, reports } from "../catalog.ts";
import { runQuery, runReport } from "../core/run.ts";
import { loaders } from "../panoram.config.ts";
import { packageJsonRows, packageLockRows, scanRepositoryVersions } from "../providers/repository-versions/loader.ts";

async function withRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "panoram-repository-versions-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

async function observe(root: string, scope: "root" | "agents" = "root") {
  return runQuery(catalog["repository-versions"]!.query, {
    loaders,
    scope,
    params: { root },
    exec: async () => { throw new Error("repository version provider started a process"); },
    env: {},
  });
}

test("declarations and duplicate npm lock locations remain separate evidence", () => withRoot(async (root) => {
  await mkdir(join(root, ".git"));
  await mkdir(join(root, "packages", "app"), { recursive: true });
  await writeFile(join(root, ".node-version"), "22.11.0\n");
  await writeFile(join(root, ".tool-versions"), "node $(touch-marker)\npython 3.13.1\n");
  await writeFile(join(root, "package.json"), JSON.stringify({
    workspaces: ["packages/*"],
    scripts: { postinstall: "touch SHOULD_NOT_EXIST" },
    engines: { node: ">=22" },
    dependencies: { alpha: "^1.0.0", local: "workspace:*" },
  }));
  await writeFile(join(root, "package-lock.json"), JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": { dependencies: { alpha: "^1.0.0" } },
      "node_modules/alpha": { version: "1.2.0", resolved: "https://registry.npmjs.org/alpha/-/alpha-1.2.0.tgz" },
      "node_modules/other/node_modules/alpha": { version: "2.0.0" },
      "node_modules/alias": { name: "actual", version: "3.0.0" },
      "packages/app": { name: "app", version: "1.0.0" },
      "packages/app/node_modules/local": { link: true, resolved: "packages/local" },
    },
  }));
  await writeFile(join(root, "packages", "app", "package.json"), JSON.stringify({ devDependencies: { alpha: "~2.0.0" } }));

  const result = await observe(root);
  assert.deepEqual(result.providers.map(({ name, ok }) => ({ name, ok })), [{ name: "repository_versions", ok: 1 }]);
  const alpha = result.rows.filter((entry) => entry.name === "alpha");
  assert.deepEqual(alpha.map((entry) => [entry.project_path, entry.requested, entry.locked, entry.locator]), [
    [".", null, "1.2.0", "/packages/node_modules~1alpha"],
    [".", null, "2.0.0", "/packages/node_modules~1other~1node_modules~1alpha"],
    [".", "^1.0.0", null, "/dependencies/alpha"],
    ["packages/app", "~2.0.0", null, "/devDependencies/alpha"],
  ]);
  assert.equal(result.rows.find((entry) => entry.name === "local" && String(entry.source).endsWith("package.json"))!.status, "unresolved");
  assert.equal(result.rows.find((entry) => entry.name === "local" && String(entry.source).endsWith("package-lock.json"))!.status, "unresolved");
  assert.equal(result.rows.find((entry) => entry.name === "node" && String(entry.source).endsWith(".tool-versions"))!.status, "unresolved");
  assert.equal(result.rows.find((entry) => entry.name === "app")!.status, "unresolved");
  assert.equal(result.rows.find((entry) => entry.name === "actual")!.status, "unresolved");
}));

test("Gemfile.lock keeps registry locks and marks executable or unsupported sources", () => withRoot(async (root) => {
  await writeFile(join(root, "Gemfile"), "raise 'must not run'\n");
  await writeFile(join(root, "mise.toml"), "[tools]\nnode = { path = 'must-not-resolve' }\n");
  await writeFile(join(root, "Gemfile.lock"), [
    "GEM", "  remote: https://example.invalid/", "  specs:", "    rack (3.1.0)",
    "GIT", "  remote: https://secret.invalid/repo", "  revision: deadbeef", "  specs:", "    private_gem (1.0.0)",
    "DEPENDENCIES", "  rack (~> 3.0)", "  private_gem!", "",].join("\n"));

  const result = await observe(root);
  assert.equal(result.providers[0]!.ok, 1);
  assert.ok(result.rows.some((entry) => entry.name === "rack" && entry.locked === "3.1.0" && entry.status === "observed"));
  assert.ok(result.rows.some((entry) => entry.name === "private_gem" && entry.locked === null && entry.status === "unresolved"));
  assert.ok(result.rows.some((entry) => entry.name === "Gemfile" && entry.status === "unsupported"));
  assert.ok(result.rows.some((entry) => entry.name === "mise.toml" && entry.status === "unsupported"));
  assert.ok(result.rows.every((entry) => !String(entry.detail).includes("secret.invalid")));
}));

test("a source symlink is not followed", () => withRoot(async (root) => {
  const outside = join(root, "outside.json");
  await writeFile(outside, JSON.stringify({ dependencies: { escaped: "1.0.0" } }));
  await symlink(outside, join(root, "package.json"));
  const result = await observe(root);
  assert.equal(result.providers[0]!.ok, 1);
  assert.ok(result.rows.some((entry) => entry.name === "package.json" && entry.status === "unsupported"));
  assert.ok(!result.rows.some((entry) => entry.name === "escaped"));
}));

test("parse errors remain rows and mark the provider incomplete", () => withRoot(async (root) => {
  await writeFile(join(root, "package.json"), "{ invalid");
  const result = await observe(root);
  assert.equal(result.providers[0]!.ok, 0);
  assert.equal(result.rows[0]!.status, "error");
  assert.match(result.providers[0]!.error!, /incomplete/);
}));

test("malformed Gemfile.lock entries preserve valid rows and fail the provider", () => withRoot(async (root) => {
  await writeFile(join(root, "Gemfile.lock"), ["GEM", "  specs:", "    good (1.0.0)", "    lost ???", "DEPENDENCIES", "  good", "  lost must"].join("\n"));
  const result = await observe(root);
  assert.equal(result.providers[0]!.ok, 0);
  assert.ok(result.rows.some((entry) => entry.name === "good" && entry.locked === "1.0.0"));
  assert.equal(result.rows.filter((entry) => entry.status === "error").length, 2);
}));

test("invalid UTF-8 is an explicit read error", () => withRoot(async (root) => {
  await writeFile(join(root, ".node-version"), Buffer.from([0x32, 0x32, 0x2e, 0xff, 0x2e, 0x30]));
  const result = await observe(root);
  assert.equal(result.providers[0]!.ok, 0);
  assert.equal(result.rows[0]!.status, "error");
}));

test("a structural package error fails the provider", () => withRoot(async (root) => {
  await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: [] }));
  const result = await observe(root);
  assert.equal(result.providers[0]!.ok, 0);
  assert.ok(result.rows.some((entry) => entry.status === "error" && entry.locator === "/dependencies"));
}));

test("the per-file byte cap stops before a large version file becomes evidence", () => withRoot(async (root) => {
  await writeFile(join(root, ".node-version"), Buffer.alloc(2 * 1024 * 1024 + 1, 0x31));
  const result = await observe(root);
  assert.equal(result.providers[0]!.ok, 0);
  assert.match(String(result.rows[0]!.detail), /exceeds/);
}));

test("scan budgets produce explicit incomplete diagnostics", () => withRoot(async (root) => {
  await mkdir(join(root, "deep", "one"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ workspaces: ["deep/**"] }));
  await writeFile(join(root, "deep", "one", "package.json"), JSON.stringify({ dependencies: { alpha: "1" } }));
  await writeFile(join(root, ".node-version"), "22");
  await writeFile(join(root, ".ruby-version"), "3.4");
  const byDepth = await scanRepositoryVersions(root, { depth: 0, entries: 20, totalBytes: 1_000, rows: 20 });
  assert.equal(byDepth.failed, true);
  assert.ok(byDepth.rows.some((entry) => String(entry.locator).startsWith("workspace:")));
  const byEntries = await scanRepositoryVersions(root, { depth: 6, entries: 1, totalBytes: 1_000, rows: 20 });
  assert.equal(byEntries.failed, true);
  assert.ok(byEntries.rows.some((entry) => entry.locator === "workspace-entry-limit"));
  const byBytes = await scanRepositoryVersions(root, { depth: 6, entries: 20, totalBytes: 1, rows: 20 });
  assert.equal(byBytes.failed, true);
  assert.ok(byBytes.rows.some((entry) => entry.locator === "scan-byte-limit"));
  const byRows = await scanRepositoryVersions(root, { depth: 6, entries: 20, totalBytes: 1_000, rows: 1 });
  assert.equal(byRows.failed, true);
  assert.ok(byRows.rows.some((entry) => entry.locator === "scan-row-limit"));
}));

test("malformed sources still consume the whole-scan byte budget", () => withRoot(async (root) => {
  await writeFile(join(root, "package.json"), "{ malformed");
  const result = await scanRepositoryVersions(root, { depth: 6, entries: 20, totalBytes: 4, rows: 20 });
  assert.equal(result.failed, true);
  assert.ok(result.rows.some((entry) => entry.locator === "scan-byte-limit"));
  assert.ok(!result.rows.some((entry) => /JSON/.test(String(entry.detail))));
}));

test("only root-declared workspaces contribute nested manifests", () => withRoot(async (root) => {
  await mkdir(join(root, "packages", "member"), { recursive: true });
  await mkdir(join(root, "fixtures", "nested"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ workspaces: { packages: ["packages/*"] } }));
  await writeFile(join(root, "packages", "member", "package.json"), JSON.stringify({ devDependencies: { shared: "^2" }, workspaces: ["../../fixtures/*"] }));
  await writeFile(join(root, "fixtures", "nested", "package.json"), JSON.stringify({ dependencies: { fixture_only: "1" } }));
  const result = await observe(root);
  assert.ok(result.rows.some((entry) => entry.name === "shared" && entry.project_path === "packages/member" && entry.dependency_role === "development"));
  assert.ok(!result.rows.some((entry) => entry.name === "fixture_only"));
}));

test("unsupported workspace patterns and symlink members stay explicit", () => withRoot(async (root) => {
  await mkdir(join(root, "real"));
  await writeFile(join(root, "real", "package.json"), JSON.stringify({ dependencies: { escaped: "1" } }));
  await symlink(join(root, "real"), join(root, "linked"));
  await writeFile(join(root, "package.json"), JSON.stringify({ workspaces: ["!private/*", "{apps,packages}/*", "bad\0path", "linked"] }));
  const result = await observe(root);
  assert.equal(result.rows.filter((entry) => entry.status === "unsupported").length, 4);
  assert.ok(!result.rows.some((entry) => entry.name === "escaped"));
}));

test("workspace discovery errors fail the observation", () => withRoot(async (root) => {
  await writeFile(join(root, "package.json"), JSON.stringify({ workspaces: false }));
  const result = await observe(root);
  assert.equal(result.providers.find((provider) => provider.name === "repository_versions")!.ok, 0);
  assert.ok(result.rows.some((entry) => entry.locator === "/workspaces" && entry.status === "error"));
}));

test("an empty root remains visible in source coverage", () => withRoot(async (root) => {
  const result = await observe(root);
  assert.deepEqual(result.rows.map((entry) => [entry.project_path, entry.kind, entry.locator, entry.status]), [[".", "source", "no-known-source", "unsupported"]]);
}));

test("a literal workspace path does not enumerate unrelated siblings", () => withRoot(async (root) => {
  await mkdir(join(root, "packages", "app"), { recursive: true });
  for (let index = 0; index < 8; index += 1) await mkdir(join(root, `unrelated-${index}`));
  await writeFile(join(root, "package.json"), JSON.stringify({ workspaces: ["packages/app"] }));
  await writeFile(join(root, "packages", "app", "package.json"), JSON.stringify({ dependencies: { alpha: "1" } }));
  const result = await scanRepositoryVersions(root, { depth: 6, entries: 2, totalBytes: 1_000, rows: 20 });
  assert.equal(result.failed, false);
  assert.ok(result.rows.some((entry) => entry.name === "alpha"));
}));

test("non-registry npm references remain unresolved", () => {
  const rows = packageJsonRows("/repo", "/repo/package.json", JSON.stringify({ dependencies: {
    shorthand: "owner/repo#main", relative: "./lib", tarball: "pkg.tgz", alias: "npm:actual@1", tag: "latest", range: "^1.2.3",
  } }));
  for (const name of ["shorthand", "relative", "tarball", "alias"]) assert.equal(rows.find((row) => row.name === name)!.status, "unresolved");
  for (const name of ["tag", "range"]) assert.equal(rows.find((row) => row.name === name)!.status, "observed");
});

test("shared dependency queries count repositories, projects, roles, and request strings", () => withRoot(async (base) => {
  const first = join(base, "first");
  const second = join(base, "second");
  await mkdir(join(first, "packages", "app"), { recursive: true });
  await mkdir(second);
  await writeFile(join(first, "package.json"), JSON.stringify({
    workspaces: ["packages/*"], dependencies: { alpha: "^1", local: "./lib" }, devDependencies: { alpha: "^1" },
  }));
  await writeFile(join(first, "packages", "app", "package.json"), JSON.stringify({ optionalDependencies: { alpha: "~1" } }));
  await writeFile(join(second, "package.json"), JSON.stringify({ peerDependencies: { alpha: "^2" }, dependencies: { local: "owner/repo#main" } }));
  const invocations: string[] = [];
  const exec = async (command: string) => {
    invocations.push(command);
    if (command === "herdr") return JSON.stringify({ result: { snapshot: { agents: [
      { pane_id: "a", agent: "codex", agent_status: "working", cwd: first },
      { pane_id: "b", agent: "codex", agent_status: "working", cwd: second },
    ] } } });
    throw new Error(`unexpected process: ${command}`);
  };
  const options = { loaders, scope: "agents" as const, exec, env: {}, repo: { async rootOf(path: string) { return path; }, async originOf() { return null; } } };
  const summary = await runQuery(catalog["shared-dependencies"]!.query, options);
  assert.deepEqual(invocations, ["herdr"]);
  assert.deepEqual(summary.rows, [{
    ecosystem: "npm", name: "alpha", repository_count: 2, checkout_count: 2, project_count: 3, declaration_count: 4,
    request_string_count: 3, requested_versions: '["^1","^2","~1"]', roles: '["development","optional","peer","runtime"]',
  }]);
  const details = await runQuery(catalog["shared-dependency-details"]!.query, { ...options, exec });
  assert.equal(details.rows.length, 4);
  assert.ok(details.rows.every((entry) => entry.source && entry.locator && entry.project_path));
  assert.ok(!summary.rows.some((entry) => entry.name === "local"));
  invocations.length = 0;
  const report = reports["dependency-report"];
  const snapshot = await runReport(report.sections.map(([section, name]) => [section, catalog[name]!.query] as const), options);
  assert.deepEqual(invocations, ["herdr"]);
  assert.deepEqual(Object.keys(snapshot.sections), ["shared", "coverage", "sources"]);
  assert.equal(snapshot.sections.shared!.length, 1);
  assert.ok(snapshot.sections.coverage!.length >= 3);
  assert.ok(snapshot.sections.sources!.some((entry) => entry.name === "local" && entry.status === "unresolved"));
}));

test("shared dependencies count repositories separately from linked checkouts", () => withRoot(async (base) => {
  const main = join(base, "main");
  const linked = join(base, "linked");
  const clone = join(base, "clone");
  const unknown = join(base, "unknown");
  for (const [root, version] of [[main, "^1"], [linked, "^2"], [clone, "^3"]] as const) {
    await mkdir(root);
    await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { alpha: version } }));
  }
  await mkdir(unknown);
  await writeFile(join(unknown, "package.json"), JSON.stringify({ devDependencies: { alpha: "^99" } }));
  const agents = [main, linked, clone, unknown].map((cwd, index) => ({ pane_id: String(index), agent: "codex", agent_status: "working", cwd }));
  const repo = {
    async rootOf(path: string) { return path; },
    async originOf() { return null; },
    async repositoryIdOf(root: string) {
      if (root === unknown) return { id: null, error: "Git metadata is invalid." };
      return { id: root === clone ? "clone" : "shared-common-dir", error: null };
    },
  };
  const result = await runQuery(catalog["shared-dependencies"]!.query, {
    loaders, scope: "agents", repo, env: {},
    exec: async (command) => command === "herdr" ? JSON.stringify({ result: { snapshot: { agents } } }) : Promise.reject(new Error(`unexpected process: ${command}`)),
  });
  assert.deepEqual(result.rows, [{
    ecosystem: "npm", name: "alpha", repository_count: 2, checkout_count: 3, project_count: 3,
    declaration_count: 3, request_string_count: 3, requested_versions: '["^1","^2","^3"]', roles: '["runtime"]',
  }]);
  assert.equal(result.providers.at(-1)!.ok, 0);
  const details = await runQuery(catalog["shared-dependency-details"]!.query, {
    loaders, scope: "agents", repo, env: {},
    exec: async (command) => command === "herdr" ? JSON.stringify({ result: { snapshot: { agents } } }) : Promise.reject(new Error(`unexpected process: ${command}`)),
  });
  assert.equal(details.rows.length, 3);
  assert.ok(details.rows.every((entry) => entry.requested !== "^99" && entry.dependency_role !== "development"));
  const linkedOnly = await runQuery(catalog["shared-dependencies"]!.query, {
    loaders, scope: "agents", repo, env: {},
    exec: async (command) => command === "herdr" ? JSON.stringify({ result: { snapshot: { agents: agents.slice(0, 2) } } }) : Promise.reject(new Error(`unexpected process: ${command}`)),
  });
  assert.deepEqual(linkedOnly.rows, []);
}));

test("an unknown repository identity retains evidence and fails the provider", () => withRoot(async (root) => {
  await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { alpha: "1" } }));
  const result = await runQuery(catalog["repository-version-sources"]!.query, {
    loaders, scope: "agents", env: {},
    repo: {
      async rootOf(path: string) { return path; },
      async originOf() { return null; },
      async repositoryIdOf() { return { id: null, error: "Git metadata is invalid." }; },
    },
    exec: async (command) => command === "herdr" ? JSON.stringify({ result: { snapshot: { agents: [{ pane_id: "a", agent: "codex", agent_status: "working", cwd: root }] } } }) : Promise.reject(new Error(`unexpected process: ${command}`)),
  });
  assert.equal(result.providers.at(-1)!.ok, 0);
  assert.ok(result.rows.some((entry) => entry.locator === "repository-identity" && entry.status === "error"));
}));

test("wide discovery failures stay visible beside the static provider", () => withRoot(async (root) => {
  await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { alpha: "1" } }));
  const result = await runQuery(catalog["dependency-coverage"]!.query, {
    loaders, scope: "all", env: {}, repo: { async rootOf(path: string) { return path; }, async originOf() { return null; } },
    exec: async (command) => {
      if (command === "herdr") return JSON.stringify({ result: { snapshot: { agents: [{ pane_id: "a", agent: "codex", agent_status: "working", cwd: root }] } } });
      if (command === "ghq") throw new Error("ghq unavailable");
      throw new Error(`unexpected process: ${command}`);
    },
  });
  assert.ok(result.rows.some((entry) => entry.root === root));
  assert.deepEqual(result.providers.map(({ name, ok }) => [name, ok]), [["herdr", 1], ["repos", 0], ["repository_versions", 1]]);
}));

test("root scope without a root fails instead of returning an empty observation", async () => {
  const result = await runQuery(catalog["dependency-coverage"]!.query, { loaders, scope: "root", env: {}, exec: async () => { throw new Error("unexpected process"); } });
  assert.deepEqual(result.rows, []);
  assert.equal(result.providers[0]!.name, "repository_versions");
  assert.equal(result.providers[0]!.ok, 0);
  assert.match(result.providers[0]!.error!, /requires one root/);
});

test("npm declarations and locks always occupy separate evidence columns", () => hegel.test((tc) => {
  const name = tc.draw(gs.text({ alphabet: "abcdefghijklmnopqrstuvwxyz", minSize: 1, maxSize: 20 }));
  const major = tc.draw(gs.integers({ minValue: 0, maxValue: 1_000 }));
  const requested = `^${major}.0.0`;
  const locked = `${major}.1.0`;
  const declarations = packageJsonRows("/repo", "/repo/package.json", JSON.stringify({ dependencies: { [name]: requested } }));
  const locks = packageLockRows("/repo", "/repo/package-lock.json", JSON.stringify({ lockfileVersion: 3, packages: { [`node_modules/${name}`]: { version: locked } } }));
  assert.ok(declarations.every((entry) => entry.requested !== null && entry.locked === null));
  assert.ok(locks.every((entry) => entry.requested === null && entry.locked !== null));
}));
