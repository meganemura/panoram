// These tests prove that the local history only ranks names. Boundary: the
// CLI decides when a completed query records one entry.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import { callCounts, callsPath, recordCall } from "../core/calls.ts";

function withStateHome(run: (env: Record<string, string>) => void): void {
  const stateHome = mkdtempSync(join(tmpdir(), "panoram-calls-"));
  try {
    run({ XDG_STATE_HOME: stateHome });
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
}

test("call counts retain each recorded name", () => withStateHome((env) => {
  recordCall(env, "in-dir");
  recordCall(env, "dirty");
  recordCall(env, "in-dir");
  assert.deepEqual(callCounts(env), new Map([["in-dir", 2], ["dirty", 1]]));
}));

test("call counts skip a malformed line", () => withStateHome((env) => {
  const path = callsPath(env);
  mkdirSync(join(env.XDG_STATE_HOME!, "panoram"), { recursive: true });
  writeFileSync(path, "not json\n{\"name\":\"dirty\"}\n");
  assert.deepEqual(callCounts(env), new Map([["dirty", 1]]));
}));

test("a missing call log has no counts", () => withStateHome((env) => {
  assert.deepEqual(callCounts(env), new Map());
}));

test("call counts equal the recorded name multiset", () => hegel.test((tc) => {
  const names = tc.draw(gs.arrays(gs.sampledFrom(["agents", "dirty", "in-dir", "working"] as const), { maxSize: 200 }));
  withStateHome((env) => {
    for (const name of names) recordCall(env, name);
    const expected = new Map<string, number>();
    for (const name of names) expected.set(name, (expected.get(name) ?? 0) + 1);
    assert.deepEqual(callCounts(env), expected);
  });
}));
