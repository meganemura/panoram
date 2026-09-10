// These tests prove that the command line exposes the catalog and rejects bad names.
// They do not run a query, so they cannot start a real provider tool.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { catalog } from "../catalog.ts";
import { callCounts, recordCall } from "../core/calls.ts";

const execFileAsync = promisify(execFile);

test("help lists every catalog query", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["cli.ts", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  for (const name of Object.keys(catalog)) assert.match(stdout, new RegExp(`\\b${name}\\b`));
});

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
