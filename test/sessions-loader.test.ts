// These tests hold small live-session records in a temporary home directory.
// They prove the loader reads bounded transcript data and keeps a useful half
// when the other session source fails.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import type { Exec } from "../core/loader.ts";
import { runSql } from "../core/run.ts";
import { sessionsLoader, parseTranscriptTail } from "../providers/sessions/loader.ts";

const claudeId = "claude-session";
const codexId = "codex-thread";
const claudeCwd = "/work/claude";
const codexCwd = "/work/codex";

function today(): string {
  const date = new Date();
  return join(String(date.getFullYear()), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0"));
}

async function fixtureHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "panoram-sessions-"));
  const transcript = join(home, ".claude", "projects", "-work-claude", `${claudeId}.jsonl`);
  const rollout = join(home, ".codex", "sessions", today(), `rollout-100000-${codexId}.jsonl`);
  await mkdir(join(home, ".claude", "sessions"), { recursive: true });
  await mkdir(join(home, ".codex", "thread-writer-locks"), { recursive: true });
  await mkdir(join(home, ".claude", "projects", "-work-claude"), { recursive: true });
  await mkdir(join(home, ".codex", "sessions", today()), { recursive: true });
  await writeFile(join(home, ".claude", "sessions", `${process.pid}.json`), JSON.stringify({
    pid: process.pid,
    sessionId: claudeId,
    cwd: claudeCwd,
    name: "Claude session",
    kind: "interactive",
    status: "idle",
    version: "2.1.0",
    startedAt: 1000,
    updatedAt: 2000,
  }));
  await writeFile(transcript, `${"x".repeat(9000)}\n${JSON.stringify({ timestamp: "2026-09-10T00:00:00.000Z", gitBranch: "main" })}\n`);
  await writeFile(rollout, [
    JSON.stringify({ type: "session_meta", payload: { id: codexId, cwd: codexCwd, cli_version: "0.1.0", originator: "cli", source: "interactive" } }),
    JSON.stringify({ timestamp: "2026-09-10T00:01:00.000Z", gitBranch: "feature" }),
  ].join("\n"));
  const state = new DatabaseSync(join(home, ".codex", "state_5.sqlite"));
  try {
    state.exec(`create table threads (
      id text primary key, rollout_path text not null, created_at integer not null, updated_at integer not null, source text not null,
      model_provider text not null, cwd text not null, title text not null, sandbox_policy text not null, approval_mode text not null,
      tokens_used integer not null default 0, has_user_event integer not null default 0, archived integer not null default 0,
      archived_at integer, git_sha text, git_branch text, git_origin_url text, cli_version text not null default '',
      first_user_message text not null default '', agent_nickname text, agent_role text, memory_mode text not null default 'enabled',
      model text, reasoning_effort text, agent_path text, created_at_ms integer, updated_at_ms integer, thread_source text,
      preview text not null default '', recency_at integer not null default 0, recency_at_ms integer not null default 0,
      history_mode text not null default 'legacy', name text, is_pinned integer not null default 0, thread_section_id text,
      section_position integer, section_entered_at_ms integer, project_id text
    ) strict`);
    state.prepare(`insert into threads (id, rollout_path, created_at, updated_at, source, model_provider, cwd, title, sandbox_policy, approval_mode, created_at_ms, updated_at_ms, cli_version)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(codexId, rollout, 3, 4, "cli", "openai", codexCwd, "", "workspace-write", "never", 3000, 4000, "0.1.0");
  } finally {
    state.close();
  }
  return home;
}

function execFor(home: string, options: { failCodex?: boolean } = {}): Exec {
  const lock = join(home, ".codex", "thread-writer-locks", `${codexId}.lock`);
  return async (command, args, cwd) => {
    if (command === "lsof") {
      if (options.failCodex) throw new Error("lsof failed");
      return `p${process.pid}\nn${lock}\n`;
    }
    if (command === "git" && args.join(" ") === "rev-parse --show-toplevel") return cwd === claudeCwd ? "/roots/claude\n" : "/roots/codex\n";
    throw new Error(`unexpected command: ${command}`);
  };
}

test("sessions loads live Claude Code and Codex rows from bounded records", async () => {
  const home = await fixtureHome();
  try {
    const result = await runSql(
      "select session_id, agent, pid, cwd, root, name, kind, status, version, started_at, updated_at, last_turn_at, last_branch from sessions order by agent",
      { loaders: [sessionsLoader], exec: execFor(home), env: { HOME: home }, params: {} },
    );
    assert.deepEqual(result.rows, [
      { session_id: claudeId, agent: "claude", pid: process.pid, cwd: claudeCwd, root: "/roots/claude", name: "Claude session", kind: "interactive", status: "idle", version: "2.1.0", started_at: 1000, updated_at: 2000, last_turn_at: Date.parse("2026-09-10T00:00:00.000Z"), last_branch: "main" },
      { session_id: codexId, agent: "codex", pid: process.pid, cwd: codexCwd, root: "/roots/codex", name: null, kind: "cli", status: null, version: "0.1.0", started_at: 3000, updated_at: 4000, last_turn_at: Date.parse("2026-09-10T00:01:00.000Z"), last_branch: "feature" },
    ]);
    assert.equal(result.providers[0]?.ok, 1);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("sessions keeps Claude rows when the Codex source fails", async () => {
  const home = await fixtureHome();
  try {
    const result = await runSql("select session_id, agent from sessions order by agent", {
      loaders: [sessionsLoader], exec: execFor(home, { failCodex: true }), env: { HOME: home }, params: {},
    });
    assert.deepEqual(result.rows, [{ session_id: claudeId, agent: "claude" }]);
    assert.deepEqual(result.providers.map(({ name, ok, error }) => ({ name, ok, error })), [{ name: "sessions", ok: 0, error: "codex: lsof failed" }]);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("the transcript tail parser returns the final timestamp record", () => hegel.test((tc) => {
  const count = tc.draw(gs.integers({ minValue: 1, maxValue: 12 }));
  const bytes = tc.draw(gs.integers({ minValue: 0, maxValue: 16000 }));
  const junk = tc.draw(gs.text({ codec: "ascii", minSize: bytes, maxSize: bytes })).replaceAll("\n", "x");
  const entries = Array.from({ length: count }, (_, index) => ({ timestamp: new Date(1000 + index * 1000).toISOString(), gitBranch: `branch-${index}` }));
  const file = `${junk}\n${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
  const chunk = file.slice(Math.max(0, file.length - 8192));
  const actual = parseTranscriptTail(chunk, file.length <= 8192);
  const expected = entries.at(-1)!;
  assert.deepEqual(actual, { timestamp: Date.parse(expected.timestamp), gitBranch: expected.gitBranch });
}));
