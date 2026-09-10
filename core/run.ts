// One call of panoram: a fresh in-memory database, the loaders the
// statement needs, the statement, and the `providers` rows that say which
// loader answered. Nothing survives the call (ADR 0002).
// Boundary: scheduling and recording. What a loader runs stays with the
// provider; what a query means stays with its module.
import { execFile } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import type { Database, Entry, Query } from "solarsql";
import { migrate, node } from "solarsql/node";
import { migrations } from "../migrations/index.ts";
import { providerCommands, providerQueries, type ProvidersId } from "./providers/public.ts";
import type { Exec, Loader, Scope } from "./loader.ts";
import { loadersFor, tablesRead } from "./resolve.ts";

const execFileAsync = promisify(execFile);

// The default runner. stderr is dropped: a provider that fails reports
// through its exit code, and the error text lands in `providers.error`.
export const exec: Exec = async (command, args, cwd) => {
  const { stdout } = await execFileAsync(command, [...args], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return stdout;
};

export type ProviderRow = { name: string; ok: number; observed_at: number; ms: number; error: string | null };

export type RunOptions = {
  loaders: readonly Loader[];
  scope?: Scope;
  exec?: Exec;
  env?: Readonly<Record<string, string | undefined>>;
  // Parameters for the statement. `me` is filled by the core when the
  // statement names it and the caller did not pass it.
  params?: Record<string, unknown>;
};

export type RunResult<R> = {
  rows: R[];
  providers: ProviderRow[];
  // The caller's own row, when a provider could tell.
  me: string | null;
};

// A named query from a catalog.
export async function runQuery<Q extends Query<string, Entry>>(query: Q, options: RunOptions): Promise<RunResult<Record<string, unknown>>> {
  return run(query.meta.reads, [...query.meta.params], (db, params) => db.all(query, params as never), options);
}

export function sqlParameterNames(sql: string): string[] {
  return [...new Set([...sql.matchAll(/:([a-zA-Z_][a-zA-Z0-9_]*)/g)].map((match) => match[1]!))];
}

// Ad hoc SQL. Parameters bind by the names the statement uses.
export async function runSql(sql: string, options: RunOptions): Promise<RunResult<Record<string, unknown>>> {
  const names = sqlParameterNames(sql);
  return run((raw) => tablesRead(raw, sql), names, (_db, params, raw) => {
    const statement = raw.prepare(sql);
    const bound = Object.fromEntries(names.map((n) => [n, params[n] ?? null]));
    return Promise.resolve(statement.all(bound as Record<string, never>).map((r) => ({ ...r })) as Record<string, unknown>[]);
  }, options);
}

async function run<R>(tables: readonly string[] | ((raw: DatabaseSync) => readonly string[]), paramNames: readonly string[], read: (db: Database, params: Record<string, unknown>, raw: DatabaseSync) => Promise<R[]>, options: RunOptions): Promise<RunResult<R>> {
  const raw = new DatabaseSync(":memory:");
  migrate(raw, migrations);
  const db = node(raw);
  const ctx = { db, exec: options.exec ?? exec, scope: options.scope ?? "agents", env: options.env ?? process.env };
  const needed = loadersFor(options.loaders, typeof tables === "function" ? tables(raw) : tables);
  const providers: ProviderRow[] = [];
  // Loaders run in dependency order, one at a time. A failed loader leaves
  // its tables empty; a loader that runs after it sees the empty tables and
  // is not itself a failure.
  for (const loader of needed) {
    const started = performance.now();
    const observed_at = Date.now();
    try {
      await loader.load(ctx);
      providers.push({ name: loader.name, ok: 1, observed_at, ms: round(performance.now() - started), error: null });
    } catch (e) {
      providers.push({ name: loader.name, ok: 0, observed_at, ms: round(performance.now() - started), error: e instanceof Error ? e.message : String(e) });
    }
  }
  const recorded = await db.run(providerCommands.record, { rows: providers.map((p) => ({ ...p, name: p.name as ProvidersId })) });
  if (!recorded.ok) throw new Error(`providers: ${recorded.kind}`);
  const params = { ...(options.params ?? {}) };
  let me: string | null = null;
  if (paramNames.includes("me")) {
    if (params["me"] === undefined) {
      for (const loader of needed) {
        if (!loader.self) continue;
        me = await loader.self(ctx);
        if (me !== null) break;
      }
      params["me"] = me;
    } else {
      me = params["me"] as string | null;
    }
  }
  for (const name of paramNames) if (params[name] === undefined) throw new Error(`missing parameter: ${name}`);
  const rows = await read(db, params, raw);
  return { rows, providers: await db.all(providerQueries.all), me };
}

function round(ms: number): number {
  return Math.round(ms * 10) / 10;
}
