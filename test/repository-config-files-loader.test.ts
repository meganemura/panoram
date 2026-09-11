// Verifies bounded configuration file inventory without interpreting file bodies.
// Boundary: the dedicated inventory scanner and query provider.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { catalog } from "../catalog.ts";
import { loaders } from "../panoram.config.ts";
import { scanRepositoryConfigFiles } from "../providers/repository-config-files/loader.ts";
import { runQuery } from "../core/run.ts";

async function withRoot(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "panoram-repository-config-files-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test("regular supported and unsupported files are listed without parsing their contents", () => withRoot(async (root) => {
  await writeFile(join(root, "package.json"), "{}");
  await writeFile(join(root, "package-lock.json"), "not JSON".repeat(300_000));
  await writeFile(join(root, "Brewfile"), "raise 'must not execute'");
  const result = await scanRepositoryConfigFiles(root);
  const byName = new Map(result.rows.filter((row) => row.observation_kind === "file").map((row) => [row.path!.split("/").at(-1), row]));
  assert.equal(byName.get("package-lock.json")!.status, "observed");
  assert.equal(byName.get("package-lock.json")!.parse_support, "supported");
  assert.equal(byName.get("Brewfile")!.status, "observed");
  assert.equal(byName.get("Brewfile")!.parse_support, "unsupported");
  assert.equal(result.failed, false);
}));

test("a malformed root package stays listed without exposing parser input", () => withRoot(async (root) => {
  const sentinel = "DO_NOT_EXPOSE_SENTINEL_7f36";
  await writeFile(join(root, "package.json"), `{ "workspaces": [${sentinel}`);
  const result = await scanRepositoryConfigFiles(root);
  assert.equal(result.failed, true);
  assert.ok(result.rows.some((row) => row.observation_kind === "file"
    && row.path?.endsWith("package.json") && row.status === "observed"));
  assert.ok(result.rows.some((row) => row.observation_kind === "discovery" && row.status === "error"));
  assert.ok(result.rows.every((row) => !row.detail?.includes(sentinel)));
}));

test("only root-declared workspaces contribute nested recognized files", () => withRoot(async (root) => {
  await mkdir(join(root, "packages", "member"), { recursive: true });
  await mkdir(join(root, "fixtures"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ workspaces: ["packages/*"] }));
  await writeFile(join(root, "packages", "member", "pyproject.toml"), "invalid is still inventory");
  await writeFile(join(root, "fixtures", "Cargo.toml"), "[package]");
  const result = await scanRepositoryConfigFiles(root);
  assert.ok(result.rows.some((row) => row.project_path === "packages/member" && row.path?.endsWith("pyproject.toml")));
  assert.ok(!result.rows.some((row) => row.path?.includes("/fixtures/")));
}));

test("file skips and workspace discovery gaps stay distinct", () => withRoot(async (root) => {
  await mkdir(join(root, "real"));
  await writeFile(join(root, "real", "package.json"), "{}");
  await symlink(join(root, "real"), join(root, "linked"));
  await writeFile(join(root, "package.json"), JSON.stringify({ workspaces: ["linked", "!private/*"] }));
  await symlink(join(root, "real", "package.json"), join(root, "package-lock.json"));
  await mkdir(join(root, "go.sum"));
  const result = await scanRepositoryConfigFiles(root);
  assert.equal(result.rows.filter((row) => row.observation_kind === "file" && row.status === "skipped").length, 2);
  assert.ok(result.rows.some((row) => row.observation_kind === "discovery" && row.status === "incomplete"));
  assert.equal(result.failed, true);
}));

test("incomplete discovery fails the provider but an unsupported regular source does not", () => withRoot(async (root) => {
  await writeFile(join(root, "package.json"), JSON.stringify({ workspaces: ["!private/*"] }));
  await writeFile(join(root, "Brewfile"), "brew 'example'");
  const incomplete = await runQuery(catalog["repository-config-files"]!.query, {
    loaders, scope: "root", params: { root }, exec: async () => { throw new Error("inventory started a process"); },
  });
  assert.equal(incomplete.providers.find((provider) => provider.name === "repository_config_files")!.ok, 0);
  await writeFile(join(root, "package.json"), "{}");
  const complete = await runQuery(catalog["repository-config-files"]!.query, {
    loaders, scope: "root", params: { root }, exec: async () => { throw new Error("inventory started a process"); },
  });
  assert.equal(complete.providers.find((provider) => provider.name === "repository_config_files")!.ok, 1);
  assert.ok(complete.rows.some((row) => String(row.path).endsWith("Brewfile") && row.parse_support === "unsupported"));
}));
