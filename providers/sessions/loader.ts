// Fills sessions from live Claude Code processes and held Codex thread locks.
// Each source can fail independently because they are separate tools behind
// one table; rows from a working source remain useful and the provider row
// reports the failed source.
// Boundary: this provider's table only.
import { open, readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { LoadContext, Loader } from "../../core/loader.ts";
import { sessionCommands } from "./module.ts";
import type { SessionsId } from "./solarsql.generated.ts";

const tailBytes = 8 * 1024;

type SessionRow = {
  session_id: SessionsId;
  agent: "claude" | "codex";
  pid: number | null;
  cwd: string;
  root: string | null;
  name: string | null;
  kind: string | null;
  status: string | null;
  version: string | null;
  started_at: number | null;
  updated_at: number | null;
  last_turn_at: number | null;
  last_branch: string | null;
};

type TranscriptTail = { timestamp: number | null; gitBranch: string | null };

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function milliseconds(value: unknown): number | null {
  const date = string(value);
  if (date === null) return null;
  const result = Date.parse(date);
  return Number.isFinite(result) ? result : null;
}

// The first chunk can start in the middle of a JSON line. Skip that fragment,
// then read backward so a damaged final record cannot hide an earlier answer.
export function parseTranscriptTail(chunk: string, startsAtZero: boolean): TranscriptTail {
  const lines = chunk.split("\n");
  const complete = startsAtZero ? lines : lines.slice(1);
  for (let index = complete.length - 1; index >= 0; index -= 1) {
    try {
      const entry = object(JSON.parse(complete[index]!));
      if (entry === null) continue;
      const timestamp = milliseconds(entry.timestamp);
      if (timestamp !== null) return { timestamp, gitBranch: string(entry.gitBranch) };
    } catch {
      // A partial or non-JSON line cannot describe a completed turn.
    }
  }
  return { timestamp: null, gitBranch: null };
}

async function tailOf(path: string): Promise<TranscriptTail> {
  const handle = await open(path, "r");
  try {
    const size = (await handle.stat()).size;
    const length = Math.min(size, tailBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, Math.max(0, size - length));
    return parseTranscriptTail(buffer.toString("utf8"), size <= tailBytes);
  } finally {
    await handle.close();
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

async function rootOf(ctx: LoadContext, cwd: string): Promise<string | null> {
  try {
    return (await ctx.exec("git", ["rev-parse", "--show-toplevel"], cwd)).trim();
  } catch {
    return null;
  }
}

function claudeSlug(cwd: string): string {
  return cwd.replace(/[/.]/g, "-");
}

async function loadClaude(home: string): Promise<SessionRow[]> {
  const directory = join(home, ".claude", "sessions");
  const names = (await readdir(directory)).filter((name) => name.endsWith(".json"));
  const rows = await Promise.all(names.map(async (name) => {
    const record = object(JSON.parse(await readFile(join(directory, name), "utf8")));
    if (record === null) throw new Error(`Claude registry ${name} is not an object`);
    const pid = number(record.pid);
    const sessionId = string(record.sessionId);
    const cwd = string(record.cwd);
    if (pid === null || sessionId === null || cwd === null) throw new Error(`Claude registry ${name} is invalid`);
    if (!isAlive(pid)) return null;
    const transcript = join(home, ".claude", "projects", claudeSlug(cwd), `${sessionId}.jsonl`);
    let tail: TranscriptTail = { timestamp: null, gitBranch: null };
    try {
      tail = await tailOf(transcript);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return {
      session_id: sessionId as SessionsId,
      agent: "claude" as const,
      pid,
      cwd,
      root: null,
      name: string(record.name),
      kind: string(record.kind),
      status: string(record.status),
      version: string(record.version),
      started_at: number(record.startedAt),
      updated_at: number(record.updatedAt),
      last_turn_at: tail.timestamp,
      last_branch: tail.gitBranch,
    };
  }));
  return rows.filter((row) => row !== null);
}

function lockedThreads(output: string, locks: string): Map<string, number> {
  const result = new Map<string, number>();
  let pid: number | null = null;
  for (const line of output.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    if (!line.startsWith("n") || pid === null || !Number.isSafeInteger(pid)) continue;
    const path = line.slice(1);
    if (!path.startsWith(`${locks}/`) || !path.endsWith(".lock")) continue;
    result.set(basename(path, ".lock"), pid);
  }
  return result;
}

// The threads table already names the rollout file, the cwd, the source, and
// the CLI version, so the rollout is read for its tail only. Its first line
// holds the base instructions and runs past any fixed head size.
async function loadCodex(ctx: LoadContext, home: string): Promise<SessionRow[]> {
  const locks = join(home, ".codex", "thread-writer-locks");
  const held = lockedThreads(await ctx.exec("lsof", ["-F", "pn", "+D", locks], undefined, { exitCodes: [1] }), locks);
  if (held.size === 0) return [];
  const database = new DatabaseSync(join(home, ".codex", "state_5.sqlite"), { readOnly: true });
  type Thread = { id: string; cwd: string; rollout_path: string | null; source: string | null; cli_version: string | null; name: string | null; created_at_ms: number; updated_at_ms: number };
  let threads: Thread[];
  try {
    const placeholders = [...held.keys()].map(() => "?").join(", ");
    threads = database.prepare(`select id, cwd, rollout_path, source, cli_version, name, created_at_ms, updated_at_ms from threads where id in (${placeholders})`).all(...held.keys()) as Thread[];
  } finally {
    database.close();
  }
  return Promise.all(threads.map(async (thread) => {
    const tail = thread.rollout_path === null ? { timestamp: null, gitBranch: null } : await tailOf(thread.rollout_path).catch(() => ({ timestamp: null, gitBranch: null }));
    return {
      session_id: thread.id as SessionsId,
      agent: "codex" as const,
      pid: held.get(thread.id) ?? null,
      cwd: thread.cwd,
      root: null,
      name: thread.name === "" ? null : thread.name,
      kind: thread.source,
      status: null,
      version: thread.cli_version,
      started_at: thread.created_at_ms,
      updated_at: thread.updated_at_ms,
      last_turn_at: tail.timestamp,
      last_branch: tail.gitBranch,
    };
  }));
}

export const sessionsLoader: Loader = {
  name: "sessions",
  tables: ["sessions"],
  after: [],
  async load(ctx) {
    const home = ctx.env["HOME"];
    if (!home) throw new Error("sessions: HOME is not set");
    const [claude, codex] = await Promise.allSettled([loadClaude(home), loadCodex(ctx, home)]);
    const loaded = [claude, codex].flatMap((result) => result.status === "fulfilled" ? result.value : []);
    const roots = new Map(await Promise.all([...new Set(loaded.map((row) => row.cwd))].map(async (cwd) => [cwd, await rootOf(ctx, cwd)] as const)));
    for (const row of loaded) row.root = roots.get(row.cwd) ?? null;
    const inserted = await ctx.db.run(sessionCommands.load, { rows: loaded });
    if (!inserted.ok) throw new Error(`sessions: ${inserted.kind}`);
    const failures = [["claude", claude], ["codex", codex]] as const;
    const messages = failures.flatMap(([name, result]) => result.status === "rejected"
      ? [`${name}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`]
      : []);
    if (messages.length > 0) throw new Error(messages.join("; "));
  },
};
