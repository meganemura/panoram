// These tests prove the herdr loader preserves snapshot rows and shares root lookups.
// They do not invoke herdr or git.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as hegel from "@hegeldev/hegel";
import type { Exec } from "../core/loader.ts";
import type { Repo } from "../core/repo.ts";
import { runSql } from "../core/run.ts";
import { herdrLoader } from "../providers/herdr/loader.ts";
import { drawSnapshotAgents, generatedAgentCwds, generatedSnapshot } from "./fixture.ts";

const roots = new Map<string, string>([
  [generatedAgentCwds[0], "/root/a"],
  [generatedAgentCwds[1], "/root/b"],
]);

function herdrFixture(snapshot: string): Exec {
  return async (command, args, cwd) => {
    const invocation = args.join(" ");
    if (command === "herdr" && invocation === "api snapshot") return snapshot;
    throw new Error(`unexpected fake command: ${command} ${invocation} in ${cwd ?? ""}`);
  };
}

test("herdr loader preserves snapshot rows and resolves each cwd once", () => hegel.testAsync(async (tc) => {
  const agents = drawSnapshotAgents(tc);
  const rootCalls: string[] = [];
  const repo: Repo = { rootOf: async (cwd) => { rootCalls.push(cwd); return roots.get(cwd) ?? null; }, originOf: async () => null };
  const result = await runSql("select pane_id, session_id, name, root from agents order by pane_id", {
    loaders: [herdrLoader],
    exec: herdrFixture(generatedSnapshot(agents)),
    repo,
    env: {},
    scope: "agents",
    params: {},
  });
  const expected = agents.map((agent) => ({
    pane_id: agent.pane_id,
    session_id: agent.agent_session?.value ?? null,
    name: agent.name ?? null,
    root: roots.get(agent.cwd) ?? null,
  })).sort((a, b) => a.pane_id < b.pane_id ? -1 : a.pane_id > b.pane_id ? 1 : 0);

  assert.equal(result.rows.length, agents.length);
  assert.deepEqual(result.rows, expected);
  assert.equal(rootCalls.length, new Set(agents.map((agent) => agent.cwd)).size);
}));
