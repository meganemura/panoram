// Which providers a statement needs. The engine tells: an authorizer set
// while the statement is prepared reports every table it reads, on the
// empty database, before any loader ran. This is the same probe solarsql's
// build uses for its boundary check, and it costs microseconds. It works for
// a named query and for ad hoc SQL alike, so both load the same way.
// Boundary: reading the statement only. run.ts orders and runs the loaders.
import { constants, type DatabaseSync } from "node:sqlite";
import type { Loader } from "./loader.ts";

// The tables a statement reads, by name, as the engine sees them.
export function tablesRead(raw: DatabaseSync, sql: string): string[] {
  const out = new Set<string>();
  raw.setAuthorizer((code: number, table: string | null) => {
    if (code === constants.SQLITE_READ && table !== null) out.add(table);
    return constants.SQLITE_OK;
  });
  try {
    raw.prepare(sql);
  } finally {
    raw.setAuthorizer(null);
  }
  return [...out];
}

// The loaders whose tables the statement reads, plus the loaders those run
// after, in an order every `after` is satisfied by. Independent loaders
// keep the order of the configuration: a `ghq list` that follows git calls
// in many repositories takes ten times longer, so repos sits before herdr
// there (ADR 0008). A table no loader declares (the core's own, or
// sqlite's) needs no loader.
export function loadersFor(loaders: readonly Loader[], tables: readonly string[]): Loader[] {
  const byName = new Map(loaders.map((l) => [l.name, l]));
  const owner = new Map<string, Loader>();
  for (const l of loaders) for (const t of l.tables) owner.set(t, l);
  const wanted = new Set<string>();
  const want = (l: Loader, trail: readonly string[]) => {
    if (trail.includes(l.name)) throw new Error(`loader cycle: ${[...trail, l.name].join(" -> ")}`);
    if (wanted.has(l.name)) return;
    wanted.add(l.name);
    for (const dep of l.after) {
      const d = byName.get(dep);
      if (!d) throw new Error(`loader ${l.name} runs after ${dep}, which is not configured`);
      want(d, [...trail, l.name]);
    }
  };
  for (const t of tables) {
    const l = owner.get(t);
    if (l) want(l, []);
  }
  // A depth-first walk in configuration order: a loader is placed after
  // the loaders it runs after, and otherwise where the configuration put it.
  const placed = new Map<string, Loader>();
  const place = (l: Loader) => {
    if (placed.has(l.name)) return;
    for (const dep of l.after) place(byName.get(dep)!);
    placed.set(l.name, l);
  };
  for (const l of loaders) if (wanted.has(l.name)) place(l);
  return [...placed.values()];
}
