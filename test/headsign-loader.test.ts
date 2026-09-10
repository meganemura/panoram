// These tests prove headsign reads state files and exposes malformed roots.
// They build a temporary repository tree because the provider has no command.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import type { Exec, Loader } from "../core/loader.ts";
import { runSql } from "../core/run.ts";
import { headsignLoader } from "../providers/headsign/loader.ts";
import { herdrLoader } from "../providers/herdr/loader.ts";
import { repoLoader } from "../providers/repos/loader.ts";

const home = mkdtempSync(join(tmpdir(), "panoram-headsign-"));
const alpha = join(home, "src", "github.com", "example", "alpha");
const beta = join(home, "src", "github.com", "example", "beta");
const gamma = join(home, "src", "github.com", "example", "gamma");
const propertyRoot = join(home, "src", "github.com", "example", "property");
mkdirSync(join(alpha, ".headsign"), { recursive: true });
mkdirSync(join(gamma, ".headsign"), { recursive: true });
mkdirSync(join(propertyRoot, ".headsign"), { recursive: true });

const loaders: Loader[] = [repoLoader, herdrLoader, headsignLoader];
type State = { workflow: string; workflow_path: string; status: string; phase: string | null; attempts: Record<string, number>; total_iterations: number; last_failure: { reason: string } | null; stop_nudges: number; driver_agent: string; phase_entered_at: string };

function state(overrides: Partial<State> = {}): State {
  return { workflow: "example", workflow_path: ".headsign/example.yaml", status: "running", phase: "build", attempts: { build: 2 }, total_iterations: 3, last_failure: null, stop_nudges: 1, driver_agent: "example:pane", phase_entered_at: "2026-09-10T00:00:00+09:00", ...overrides };
}
function writeState(root: string, value: unknown): void { writeFileSync(join(root, ".headsign", "state.json"), typeof value === "string" ? value : JSON.stringify(value)); }
function execFor(roots: readonly string[]): Exec {
  return async (command, args, cwd) => {
    if (command === "ghq" && args.join(" ") === "list -p") return "";
    if (command === "herdr" && args.join(" ") === "api snapshot") return JSON.stringify({ result: { snapshot: { agents: roots.map((root, index) => ({ pane_id: `example:${index}`, agent: "claude", agent_status: "working", cwd: root })) } } });
    if (command === "git" && args.join(" ") === "rev-parse --show-toplevel") return cwd ?? "";
    throw new Error(`unexpected fake command: ${command} ${args.join(" ")}`);
  };
}

test("headsign loads rows and skips an absent state file", async () => {
  writeState(alpha, state());
  const result = await runSql("select root, workflow, phase, total_iterations, attempts from workflow_runs order by root", { loaders, exec: execFor([alpha, beta]), params: {} });
  assert.deepEqual(result.rows, [{ root: alpha, workflow: "example", phase: "build", total_iterations: 3, attempts: '{"build":2}' }]);
});

test("headsign names a broken root after it inserts valid rows", async () => {
  writeState(alpha, state());
  writeState(gamma, "not JSON");
  const result = await runSql("select root from workflow_runs", { loaders, exec: execFor([alpha, gamma]), params: {} });
  assert.deepEqual(result.rows, [{ root: alpha }]);
  const provider = result.providers.find((row) => row.name === "headsign");
  assert.equal(provider?.ok, 0);
  assert.match(provider?.error ?? "", new RegExp(gamma));
});

test("headsign preserves generated state objects", () => hegel.testAsync(async (tc) => {
  const phases = tc.draw(gs.arrays(gs.fromRegex("[a-z]{1,8}"), { minSize: 0, maxSize: 5, unique: true }));
  const attempts = Object.fromEntries(phases.map((phase) => [phase, tc.draw(gs.integers({ minValue: 0, maxValue: 100 }))]));
  const failure = tc.draw(gs.optional(gs.just({ reason: "example" })));
  const input = state({ status: tc.draw(gs.sampledFrom(["running", "complete", "blocked"] as const)), phase: tc.draw(gs.optional(gs.sampledFrom(["build", "review", "done"] as const))), attempts, total_iterations: tc.draw(gs.integers({ minValue: 0, maxValue: 1000 })), ...(failure === null ? {} : { last_failure: failure }) });
  writeState(propertyRoot, input);
  const result = await runSql("select status, phase, attempts, total_iterations, last_failure from workflow_runs", { loaders, exec: execFor([propertyRoot]), params: {} });
  const row = result.rows[0]!;
  assert.equal(row.status, input.status);
  assert.equal(row.phase, input.phase ?? null);
  assert.equal(row.total_iterations, input.total_iterations);
  assert.deepEqual(JSON.parse(row.attempts as string), attempts);
  assert.deepEqual(row.last_failure === null ? null : JSON.parse(row.last_failure as string), failure ?? null);
}));
