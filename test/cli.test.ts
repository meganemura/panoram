// These tests prove that the command line exposes the catalog and rejects bad names.
// They do not run a query, so they cannot start a real provider tool.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import { catalog } from "../catalog.ts";
import { exitCodeFor } from "../cli.ts";
import { callCounts, recordCall } from "../core/calls.ts";

const execFileAsync = promisify(execFile);

test("help lists every catalog query", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["cli.ts", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  for (const name of Object.keys(catalog)) assert.match(stdout, new RegExp(`\\b${name}\\b`));
});

test("JSON help lists every built-in query with its parameters", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["cli.ts", "--help", "--json"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  const listed = JSON.parse(stdout) as { name: string; description: string; params: string[]; source: string }[];
  const byName = new Map(listed.map((query) => [query.name, query]));
  for (const [name, query] of Object.entries(catalog)) {
    assert.deepEqual(byName.get(name), { name, description: query.description, params: query.params, source: "built-in" });
  }
});

test("expect-empty returns 3 after it prints rows", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, ["cli.ts", "--sql", "select 1 as x", "--expect-empty"], { cwd: process.cwd(), encoding: "utf8" }),
    (error: NodeJS.ErrnoException & { code?: number; stdout?: string }) => {
      assert.equal(error.code, 3);
      assert.deepEqual(JSON.parse(error.stdout!), { query: "sql", scope: "agents", me: null, rows: [{ x: 1 }], providers: [] });
      return true;
    },
  );
});

test("expect-empty returns 0 for an empty result", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["cli.ts", "--sql", "select 1 as x where 0", "--expect-empty"], { cwd: process.cwd(), encoding: "utf8" });
  assert.deepEqual(JSON.parse(stdout), { query: "sql", scope: "agents", me: null, rows: [], providers: [] });
});

function resultForExitCode(rows: number, oks: readonly number[]) {
  return {
    rows: Array.from({ length: rows }, () => ({})),
    providers: oks.map((ok, index) => ({ name: `provider-${index}`, ok, observed_at: 0, ms: 0, error: ok === 0 ? "failed" : null })),
  };
}

test("exitCodeFor gives strict provider failure priority", () => {
  assert.equal(exitCodeFor(resultForExitCode(1, [0]), { expectEmpty: true, strict: true }), 4);
  assert.equal(exitCodeFor(resultForExitCode(1, [1]), { expectEmpty: true, strict: true }), 3);
  assert.equal(exitCodeFor(resultForExitCode(0, [0]), { expectEmpty: false, strict: true }), 4);
  assert.equal(exitCodeFor(resultForExitCode(0, [1]), { expectEmpty: false, strict: false }), 0);
});

test("exitCodeFor follows the gate contract for generated results", () => hegel.test((tc) => {
  const rows = tc.draw(gs.integers({ minValue: 0, maxValue: 20 }));
  const oks = tc.draw(gs.arrays(gs.booleans().map((ok) => ok ? 1 : 0), { maxSize: 20 }));
  const flags = { expectEmpty: tc.draw(gs.booleans()), strict: tc.draw(gs.booleans()) };
  const actual = exitCodeFor(resultForExitCode(rows, oks), flags);
  const failed = oks.some((ok) => ok === 0);

  if (flags.strict && failed) assert.equal(actual, 4);
  else if (flags.expectEmpty && rows > 0) assert.equal(actual, 3);
  else assert.equal(actual, 0);
}));

test("an unknown query exits with status 2", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, ["cli.ts", "nonesuch"], { cwd: process.cwd(), encoding: "utf8" }),
    (error: NodeJS.ErrnoException & { code?: number }) => error.code === 2,
  );
});

test("help orders queries by their call counts and does not record itself", async () => {
  const stateHome = mkdtempSync(join(tmpdir(), "panoram-cli-calls-"));
  const env = { ...process.env, XDG_STATE_HOME: stateHome };
  try {
    for (let index = 0; index < 5; index += 1) recordCall(env, "dirty");
    recordCall(env, "agents");
    const before = callCounts(env);
    const { stdout } = await execFileAsync(process.execPath, ["cli.ts", "--help"], {
      cwd: process.cwd(), encoding: "utf8", env,
    });
    assert.ok(stdout.indexOf("  dirty") < stdout.indexOf("  agents"));
    assert.deepEqual(callCounts(env), before);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("query documentation names every catalog query", async () => {
  const { readFile } = await import("node:fs/promises");
  const text = await readFile("skills/panoram/references/queries.md", "utf8");
  const names = new Set([...text.matchAll(/^\| `([^`]+)` \|/gm)].map((match) => match[1]!));
  assert.deepEqual(names, new Set(Object.keys(catalog)));
});
