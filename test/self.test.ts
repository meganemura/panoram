// These tests prove how spacequery finds and excludes the caller's agent row.
// They do not validate the external environment that supplies these identifiers.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import { catalog } from "../catalog.ts";
import type { Exec } from "../core/loader.ts";
import { runQuery } from "../core/run.ts";
import { loaders } from "../spacequery.config.ts";
import { herdrLoader } from "../providers/herdr/loader.ts";
import { drawSnapshotAgents, fixtureRepo, generatedAgentCwds, generatedSnapshot, fakeExec, fixtureAgents, paneIds, repoForRoots, sessionIds } from "./fixture.ts";

const generatedRoots = new Map<string, string>([
  [generatedAgentCwds[0], "/root/a"],
  [generatedAgentCwds[1], "/root/b"],
]);

async function agents(options: { env: Readonly<Record<string, string | undefined>>; params?: Record<string, unknown>; noFocusedAgent?: boolean }) {
  return runQuery(catalog.agents!.query, {
    loaders,
    exec: fakeExec({ agents: options.noFocusedAgent ? fixtureAgents({ focusedPaneId: null }) : fixtureAgents() }),
    repo: fixtureRepo,
    env: options.env,
    scope: "agents",
    params: options.params ?? {},
  });
}

function paneRows(result: { rows: Record<string, unknown>[] }): string[] {
  return result.rows.map((row) => row.pane_id as string);
}

function generatedHerdrFixture(snapshot: string): Exec {
  return async (command, args, cwd) => {
    const invocation = args.join(" ");
    if (command === "herdr" && invocation === "api snapshot") return snapshot;
    throw new Error(`unexpected fake command: ${command} ${invocation} in ${cwd ?? ""}`);
  };
}

function optionalEnvironmentValue(tc: hegel.TestCase, values: readonly string[], unrelated: string): string | undefined {
  if (!tc.draw(gs.booleans())) return undefined;
  if (values.length > 0 && tc.draw(gs.booleans())) return tc.draw(gs.sampledFrom(values));
  return `${unrelated}${tc.draw(gs.text({ codec: "ascii" }))}`;
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

test("self discovery follows pane, session, and focus precedence", () => hegel.testAsync(async (tc) => {
  const snapshotAgents = drawSnapshotAgents(tc, { atMostOneFocused: true });
  const pane = optionalEnvironmentValue(tc, snapshotAgents.map((agent) => agent.pane_id), "unrelated-pane-");
  const sessions = snapshotAgents.flatMap((agent) => agent.agent_session === null ? [] : [agent.agent_session.value]);
  const session = optionalEnvironmentValue(tc, sessions, "unrelated-session-");
  const focused = snapshotAgents.find((agent) => agent.focused)?.pane_id ?? null;
  const sessionPane = session === undefined ? null : snapshotAgents.find((agent) => agent.agent_session?.value === session)?.pane_id ?? null;
  const expected = pane ?? sessionPane ?? focused;
  const env: Record<string, string | undefined> = {
    HERDR_PANE_ID: pane,
    CLAUDE_CODE_SESSION_ID: session,
  };
  const result = await runQuery(catalog.agents!.query, {
    loaders: [herdrLoader],
    exec: generatedHerdrFixture(generatedSnapshot(snapshotAgents)),
    repo: { rootOf: async (cwd) => generatedRoots.get(cwd) ?? null, originOf: async () => null },
    env,
    scope: "agents",
    params: {},
  });

  assert.equal(result.me, expected);
  for (const row of result.rows) assert.notEqual(row.pane_id, expected);
}));
