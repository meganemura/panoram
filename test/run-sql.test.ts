// These tests prove loader selection and parameter binding for ad hoc SQL.
// They do not parse named catalog statements.
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadLoaders } from "../core/registry.ts";
import { runSql } from "../core/run.ts";
import { fakeExec, paths } from "./fixture.ts";

function providerNames(result: { providers: { name: string }[] }): string[] {
  return result.providers.map((provider) => provider.name);
}

test("SQL that reads agents runs herdr only", async () => {
  const result = await runSql("select root from agents order by root", {
    loaders: await loadLoaders(),
    exec: fakeExec(),
    env: {},
    scope: "agents",
    params: {},
  });
  assert.deepEqual(result.rows, [
    { root: null },
    { root: paths.alpha },
    { root: paths.alpha },
    { root: paths.beta },
  ]);
  assert.deepEqual(providerNames(result), ["herdr"]);
});

test("SQL without tables runs no loader", async () => {
  const result = await runSql("select 1 as x", {
    loaders: await loadLoaders(),
    exec: fakeExec(),
    env: {},
    scope: "agents",
    params: {},
  });
  assert.deepEqual(result.rows, [{ x: 1 }]);
  assert.deepEqual(result.providers, []);
});

test("SQL binds named parameters from the caller", async () => {
  const result = await runSql("select :root as root", {
    loaders: await loadLoaders(),
    exec: fakeExec(),
    env: {},
    scope: "agents",
    params: { root: paths.alpha },
  });
  assert.deepEqual(result.rows, [{ root: paths.alpha }]);
  assert.deepEqual(result.providers, []);
});

test("SQL that reads providers does not request a loader", async () => {
  const result = await runSql("select name from providers order by name", {
    loaders: await loadLoaders(),
    exec: fakeExec(),
    env: {},
    scope: "agents",
    params: {},
  });
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.providers, []);
});
