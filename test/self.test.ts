// These tests prove how panoram finds and excludes the caller's agent row.
// They do not validate the external environment that supplies these identifiers.
import assert from "node:assert/strict";
import { test } from "node:test";
import { catalog } from "../catalog.ts";
import { loadLoaders } from "../core/registry.ts";
import { runQuery } from "../core/run.ts";
import { fakeExec, fixtureAgents, paneIds, sessionIds } from "./fixture.ts";

async function agents(options: { env: Readonly<Record<string, string | undefined>>; params?: Record<string, unknown>; noFocusedAgent?: boolean }) {
  return runQuery(catalog.agents!.query, {
    loaders: await loadLoaders(),
    exec: fakeExec({ agents: options.noFocusedAgent ? fixtureAgents({ focusedPaneId: null }) : fixtureAgents() }),
    env: options.env,
    scope: "agents",
    params: options.params ?? {},
  });
}

function paneRows(result: { rows: Record<string, unknown>[] }): string[] {
  return result.rows.map((row) => row.pane_id as string);
}

test("HERDR_PANE_ID identifies and excludes the caller", async () => {
  const result = await agents({ env: { HERDR_PANE_ID: paneIds.alphaWorking } });
  assert.equal(result.me, paneIds.alphaWorking);
  assert.deepEqual(paneRows(result), [paneIds.alphaIdle, paneIds.betaWorking, paneIds.scratchIdle]);
});

test("CLAUDE_CODE_SESSION_ID identifies and excludes the caller", async () => {
  const result = await agents({ env: { CLAUDE_CODE_SESSION_ID: sessionIds.alphaIdle } });
  assert.equal(result.me, paneIds.alphaIdle);
  assert.deepEqual(paneRows(result), [paneIds.alphaWorking, paneIds.betaWorking, paneIds.scratchIdle]);
});

test("the focused agent identifies the caller when the environment is empty", async () => {
  const result = await agents({ env: {} });
  assert.equal(result.me, paneIds.betaWorking);
  assert.deepEqual(paneRows(result), [paneIds.alphaWorking, paneIds.alphaIdle, paneIds.scratchIdle]);
});

test("no focused agent keeps every row", async () => {
  const result = await agents({ env: {}, noFocusedAgent: true });
  assert.equal(result.me, null);
  assert.deepEqual(paneRows(result), [paneIds.alphaWorking, paneIds.alphaIdle, paneIds.betaWorking, paneIds.scratchIdle]);
});

test("caller parameters override environment discovery", async () => {
  const keepEveryone = await agents({ env: { HERDR_PANE_ID: paneIds.alphaWorking }, params: { me: null } });
  assert.equal(keepEveryone.me, null);
  assert.deepEqual(paneRows(keepEveryone), [paneIds.alphaWorking, paneIds.alphaIdle, paneIds.betaWorking, paneIds.scratchIdle]);

  const excludeScratch = await agents({ env: {}, params: { me: paneIds.scratchIdle } });
  assert.equal(excludeScratch.me, paneIds.scratchIdle);
  assert.deepEqual(paneRows(excludeScratch), [paneIds.alphaWorking, paneIds.alphaIdle, paneIds.betaWorking]);
});
