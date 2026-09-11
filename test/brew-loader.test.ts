// These tests prove that the brew loader preserves the local package inventory
// and cannot expose a partial observation when either list command fails.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Exec, Loader } from "../core/loader.ts";
import { runSql } from "../core/run.ts";
import { runQuery } from "../core/run.ts";
import { brewQueries } from "../providers/brew/module.ts";
import { brewLoader, parseBrewList } from "../providers/brew/loader.ts";
import { fixtureRepo } from "./fixture.ts";

const loaders: Loader[] = [brewLoader];

function execWith(formulae: string, casks: string): Exec {
  return async (command, args) => {
    assert.equal(command, "brew");
    if (args.join(" ") === "list --formula --versions") return formulae;
    if (args.join(" ") === "list --cask --versions") return casks;
    throw new Error(`unexpected brew command: ${args.join(" ")}`);
  };
}

test("brew stores formulae with multiple versions and cask version text", async () => {
  const result = await runSql(
    "select id, kind, name, version from brew_packages order by kind, name, version",
    { loaders, exec: execWith("openssl@3 3.6.1 3.6.3\n", "visual-studio-code 1.104.2,1758661640\n"), repo: fixtureRepo, env: {}, params: {} },
  );
  assert.deepEqual(result.rows, [
    { id: "cask:visual-studio-code@1.104.2,1758661640", kind: "cask", name: "visual-studio-code", version: "1.104.2,1758661640" },
    { id: "formula:openssl@3@3.6.1", kind: "formula", name: "openssl@3", version: "3.6.1" },
    { id: "formula:openssl@3@3.6.3", kind: "formula", name: "openssl@3", version: "3.6.3" },
  ]);
});

test("brew accepts empty formula and cask inventories", async () => {
  const result = await runSql("select * from brew_packages", { loaders, exec: execWith("", "\n"), repo: fixtureRepo, env: {}, params: {} });
  assert.deepEqual(result.rows, []);
  assert.equal(result.providers[0]?.ok, 1);
});

test("brew rejects a list line without a version", () => {
  assert.throws(() => parseBrewList("broken\n", "formula"), /line 1 has no installed version/);
});

test("malformed brew output leaves the package table empty", async () => {
  const result = await runSql(
    "select * from brew_packages",
    { loaders, exec: execWith("jq 1.8.1\n", "broken\n"), repo: fixtureRepo, env: {}, params: {} },
  );
  assert.deepEqual(result.rows, []);
  assert.equal(result.providers[0]?.ok, 0);
  assert.match(result.providers[0]?.error ?? "", /brew cask list line 1 has no installed version/);
});

test("brew ignores duplicate package identities", () => {
  assert.deepEqual(parseBrewList("jq 1.8.1\njq 1.8.1\n", "formula"), [
    { id: "formula:jq@1.8.1", kind: "formula", name: "jq", version: "1.8.1" },
  ]);
});

test("a failed second brew command leaves no partial package inventory", async () => {
  const exec: Exec = async (_command, args) => {
    if (args.includes("--formula")) return "jq 1.8.1\n";
    throw new Error("brew cask list failed");
  };
  const result = await runSql("select * from brew_packages", { loaders, exec, repo: fixtureRepo, env: {}, params: {} });
  assert.deepEqual(result.rows, []);
  assert.equal(result.providers[0]?.ok, 0);
  assert.match(result.providers[0]?.error ?? "", /brew cask list failed/);
});

test("the direct brew query resolves only the brew provider", async () => {
  const result = await runQuery(brewQueries.installed, { loaders, exec: execWith("jq 1.8.1\n", ""), repo: fixtureRepo, env: {}, params: {} });
  assert.deepEqual(result.providers.map((provider) => provider.name), ["brew"]);
});
