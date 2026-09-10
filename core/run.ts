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
import { fsRepo, type Repo } from "./repo.ts";
import { loadersFor, tablesRead } from "./resolve.ts";

const execFileAsync = promisify(execFile);

// The default runner. stderr is dropped: a provider that fails reports
// through its exit code, and the error text lands in `providers.error`.
export const exec: Exec = async (command, args, cwd, options) => {
  try {
    const { stdout } = await execFileAsync(command, [...args], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  } catch (e) {
    const failure = e as { code?: unknown; stdout?: unknown };
    if (typeof failure.code === "number" && options?.exitCodes?.includes(failure.code) && typeof failure.stdout === "string") return failure.stdout;
    throw e;
  }
};

export type ProviderRow = { name: string; ok: number; observed_at: number; ms: number; error: string | null };

export type RunOptions = {
  loaders: readonly Loader[];
  scope?: Scope;
  exec?: Exec;
  env?: Readonly<Record<string, string | undefined>>;
  repo?: Repo;
  // Parameters for the statement. A string `root` also extends the roots
  // repository-scoped loaders inspect. `me` is filled by the core when the
  // statement names it and the caller did not pass it.
  params?: Record<string, unknown>;
};

export type RunResult<R> = {
  rows: R[];
  providers: ProviderRow[];
  // The caller's own row, when a provider could tell.
  me: string | null;
  // The values bound to the statement. They identify an empty observation.
  params: Record<string, unknown>;
};

export type ReportSection = readonly [name: string, query: Query<string, Entry>];

export type ReportResult = {
  sections: Record<string, Record<string, unknown>[]>;
  providers: ProviderRow[];
  me: string | null;
  params: Record<string, unknown>;
};

// A named query from a catalog.
export async function runQuery<Q extends Query<string, Entry>>(query: Q, options: RunOptions): Promise<RunResult<Record<string, unknown>>> {
  const state = await prepare(query.meta.reads, [...query.meta.params], options);
  return { rows: await state.db.all(query, state.params as never), ...state };
}

export function sqlParameterNames(sql: string): string[] {
  return [...new Set([...sql.matchAll(/:([a-zA-Z_][a-zA-Z0-9_]*)/g)].map((match) => match[1]!))];
}

// Ad hoc SQL. Parameters bind by the names the statement uses.
export async function runSql(sql: string, options: RunOptions): Promise<RunResult<Record<string, unknown>>> {
  const names = sqlParameterNames(sql);
  const state = await prepare((raw) => tablesRead(raw, sql), names, options);
  const statement = state.raw.prepare(sql);
  const bound = Object.fromEntries(names.map((name) => [name, state.params[name] ?? null]));
  const rows = statement.all(bound as Record<string, never>).map((row) => ({ ...row })) as Record<string, unknown>[];
  return { rows, ...state };
}

// A report composes named queries after one loader pass. Its sections remain
// catalog entries, so the provider cost of each section stays inspectable.
export async function runReport(sections: readonly ReportSection[], options: RunOptions): Promise<ReportResult> {
  const tables = [...new Set(sections.flatMap(([, query]) => query.meta.reads))];
  const params = [...new Set(sections.flatMap(([, query]) => query.meta.params))];
  const state = await prepare(tables, params, options);
  const values: Record<string, Record<string, unknown>[]> = Object.create(null);
  for (const [name, query] of sections) values[name] = await state.db.all(query, state.params as never);
  return { sections: values, ...state };
}

type RunState = {
  raw: DatabaseSync;
  db: Database;
  providers: ProviderRow[];
  me: string | null;
  params: Record<string, unknown>;
};

async function prepare(tables: readonly string[] | ((raw: DatabaseSync) => readonly string[]), paramNames: readonly string[], options: RunOptions): Promise<RunState> {
  const raw = new DatabaseSync(":memory:");
  migrate(raw, migrations);
  const db = node(raw);
  const root = options.params?.["root"];
  const ctx = {
    db,
    exec: options.exec ?? exec,
    scope: options.scope ?? "agents",
    roots: typeof root === "string" ? [root] : [],
    env: options.env ?? process.env,
    repo: options.repo ?? fsRepo,
  };
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
  const bound: Record<string, unknown> = {};
  for (const name of paramNames) {
    if (params[name] === undefined) throw new Error(`missing parameter: ${name}`);
    bound[name] = params[name];
  }
  return { raw, db, providers: await db.all(providerQueries.all), me, params: bound };
}

function round(ms: number): number {
  return Math.round(ms * 10) / 10;
}
