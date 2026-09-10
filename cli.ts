#!/usr/bin/env node
// The command line: panoram <query> [--root DIR] [--scope agents|all] [--me PANE] [--json|--tsv]
//                   panoram --sql <text> [--root DIR] [--me PANE] [--scope agents|all]
//                   panoram --help
// The JSON envelope carries the rows and the `providers` rows, so a caller
// sees which provider answered and when. TSV carries the rows only, and a
// provider that failed goes to stderr.
// Boundary: parsing arguments and printing. core/run.ts does the work.
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { catalog } from "./catalog.ts";
import { loadLoaders } from "./core/registry.ts";
import { runQuery, runSql, type ProviderRow } from "./core/run.ts";

function usage(): string {
  const width = Math.max(...Object.keys(catalog).map((k) => k.length));
  const lines = Object.entries(catalog).map(([name, q]) => `  ${name.padEnd(width)}  ${q.description}${q.params.length ? `  (--${q.params.join(", --")})` : ""}`);
  return [
    "usage: panoram <query> [--root DIR] [--scope agents|all] [--me PANE] [--json|--tsv]",
    "       panoram --sql <text> [--root DIR] [--me PANE] [--scope agents|all] [--json|--tsv]",
    "",
    "queries:",
    ...lines,
    "",
    "--scope agents (default) runs git on the repositories that have an agent; all runs it on every ghq repository.",
    "--root defaults to the git toplevel of the current directory.",
    "--me excludes one pane; by default the caller's own pane, found from the environment.",
  ].join("\n");
}

// The toplevel of a directory, or the directory itself when git refuses.
function toplevel(dir: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return dir;
  }
}

function tsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]!);
  const cell = (v: unknown) => (v === null || v === undefined ? "" : String(v).replace(/[\t\n]/g, " "));
  return [keys.join("\t"), ...rows.map((r) => keys.map((k) => cell(r[k])).join("\t"))].join("\n") + "\n";
}

function warn(providers: ProviderRow[]): void {
  for (const p of providers) if (!p.ok) process.stderr.write(`panoram: provider ${p.name} failed: ${p.error}\n`);
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      root: { type: "string" },
      scope: { type: "string", default: "agents" },
      me: { type: "string" },
      sql: { type: "string" },
      json: { type: "boolean", default: false },
      tsv: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });
  if (values.help || (positionals.length === 0 && values.sql === undefined)) {
    console.log(usage());
    return values.help ? 0 : 2;
  }
  if (values.scope !== "agents" && values.scope !== "all") {
    console.error(`panoram: --scope is agents or all, not ${values.scope}`);
    return 2;
  }
  const scope = values.scope;
  const loaders = await loadLoaders();
  const params: Record<string, unknown> = {};
  if (values.me !== undefined) params["me"] = values.me === "" ? null : values.me;

  let name: string;
  let result;
  if (values.sql !== undefined) {
    name = "sql";
    // The two flags are the two parameters a statement can name. Any other
    // `:name` is an error from the core.
    if (/:root\b/.test(values.sql)) params["root"] = toplevel(values.root ?? process.cwd());
    result = await runSql(values.sql, { loaders, scope, params });
  } else {
    name = positionals[0]!;
    const named = catalog[name];
    if (!named) {
      console.error(`panoram: no query named ${name}\n\n${usage()}`);
      return 2;
    }
    if (named.params.includes("root")) params["root"] = toplevel(values.root ?? process.cwd());
    result = await runQuery(named.query, { loaders, scope, params });
  }
  if (values.tsv) {
    process.stdout.write(tsv(result.rows));
    warn(result.providers);
  } else {
    console.log(JSON.stringify({ query: name, scope, me: result.me, rows: result.rows, providers: result.providers }, null, 2));
  }
  return 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (e) {
  // A statement that does not prepare, or a parameter with no flag. The
  // message is the whole story; a stack would point into the core.
  process.stderr.write(`panoram: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
}
