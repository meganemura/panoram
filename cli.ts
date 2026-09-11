#!/usr/bin/env node
// The command line: panoram <query|report> [--root DIR] [--scope root|agents|all] [--me PANE] [--json|--tsv] [--expect-empty] [--strict]
//                   panoram --sql <text> [--root DIR] [--me PANE] [--scope root|agents|all] [--expect-empty] [--strict]
//                   panoram --help
// The JSON envelope carries the rows and the `providers` rows, so a caller
// sees which provider answered and when. TSV carries the rows only, and a
// provider that failed goes to stderr.
// Boundary: parsing arguments and printing. core/run.ts does the work.
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import { catalog, reportParams, reports } from "./catalog.ts";
import { callCounts, callsPath, recordCall } from "./core/calls.ts";
import type { Scope } from "./core/loader.ts";
import { runQuery, runReport, runSql, type ProviderRow, type ReportResult, type RunResult } from "./core/run.ts";
import { loadUserQueries, type UserQuery } from "./core/user-queries.ts";
import { loaders } from "./panoram.config.ts";

const commandOptions = new Set(["root", "scope", "me", "sql", "json", "tsv", "help", "expect-empty", "strict"]);

type HelpQuery = { name: string; description: string; params: readonly string[]; source: "built-in" | "user" };
type HelpReport = { name: string; description: string; params: readonly string[]; sections: readonly (readonly [string, string])[]; source: "report" };

function queriesForHelp(userQueries: readonly UserQuery[], env: Readonly<Record<string, string | undefined>>): HelpQuery[] {
  const counts = callCounts(env);
  const byUse = <T extends { name: string }>(queries: readonly T[]): T[] => queries
    .map((query, index) => ({ query, index }))
    .sort((a, b) => (counts.get(b.query.name) ?? 0) - (counts.get(a.query.name) ?? 0) || a.index - b.index)
    .map(({ query }) => query);
  const builtIn = Object.entries(catalog).map(([name, query]) => ({ name, description: query.description, params: query.params, source: "built-in" as const }));
  const user = userQueries.map((query) => ({ name: query.name, description: query.description, params: query.params, source: "user" as const }));
  return [...byUse(builtIn), ...byUse(user)];
}

function reportsForHelp(): HelpReport[] {
  return Object.entries(reports).map(([name, report]) => ({
    name,
    description: report.description,
    params: reportParams(report),
    sections: report.sections,
    source: "report",
  }));
}

function usage(userQueries: readonly UserQuery[], env: Readonly<Record<string, string | undefined>>): string {
  const queries = queriesForHelp(userQueries, env);
  const reportEntries = reportsForHelp();
  const width = Math.max(...[...queries, ...reportEntries].map((query) => query.name.length));
  const lines = queries.filter((query) => query.source === "built-in").map((query) => queryLine(query.name, query.description, query.params, width));
  const userLines = queries.filter((query) => query.source === "user").map((query) => queryLine(query.name, query.description, query.params, width));
  const reportLines = reportEntries.map((report) => queryLine(report.name, report.description, report.params, width));
  return [
    "usage: panoram <query|report> [--root DIR] [--scope root|agents|all] [--me PANE] [--json|--tsv] [--expect-empty] [--strict]",
    "       panoram --sql <text> [--root DIR] [--me PANE] [--scope root|agents|all] [--json|--tsv] [--expect-empty] [--strict]",
    "",
    "queries:",
    ...lines,
    ...(userQueries.length === 0 ? [] : ["", `user queries (${dirname(userQueries[0]!.path)}):`, ...userLines]),
    "",
    "reports:",
    ...reportLines,
    "",
    "A root-bound query defaults to --scope root. --scope agents uses roots with an agent; --scope all also uses every ghq root.",
    "--root defaults to the git toplevel of the current directory.",
    "--me excludes one pane; by default the caller's own pane, found from the environment.",
    "--expect-empty exits 3 after it prints rows when the query returned rows.",
    "--strict exits 4 after it prints rows when a provider did not answer.",
    `queries are listed by how often you called them (the count is in ${callsPath(env)})`,
  ].join("\n");
}

function queryLine(name: string, description: string, params: readonly string[], width: number): string {
  return `  ${name.padEnd(width)}  ${description}${params.length ? `  (--${params.join(", --")})` : ""}`;
}

function optionsFor(userQueries: readonly UserQuery[]): ParseArgsOptionsConfig {
  // SQL permits parameter names that also name inherited JavaScript properties.
  const options: ParseArgsOptionsConfig = Object.create(null);
  options["root"] = { type: "string" };
  options["scope"] = { type: "string" };
  options["me"] = { type: "string" };
  options["sql"] = { type: "string" };
  options["json"] = { type: "boolean" };
  options["tsv"] = { type: "boolean" };
  options["help"] = { type: "boolean", short: "h" };
  options["expect-empty"] = { type: "boolean" };
  options["strict"] = { type: "boolean" };
  for (const query of [...Object.values(catalog), ...Object.values(reports).map((report) => ({ params: reportParams(report) })), ...userQueries]) {
    for (const parameter of query.params) {
      if (!Object.hasOwn(options, parameter)) options[parameter] = { type: "string" };
    }
  }
  return options;
}

function textOption(values: Record<string, unknown>, name: string): string | undefined {
  const value = values[name];
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  throw new Error(`--${name} needs a value`);
}

function isScope(value: string | undefined): value is Scope | undefined {
  return value === undefined || value === "root" || value === "agents" || value === "all";
}

function validateQueryOptions(values: Record<string, unknown>, userQueries: readonly UserQuery[], parameters: readonly string[], name: string): void {
  const accepted = new Set(parameters);
  const discovered = new Set([...Object.values(catalog), ...Object.values(reports).map((report) => ({ params: reportParams(report) })), ...userQueries].flatMap((query) => query.params));
  for (const parameter of discovered) {
    if (!commandOptions.has(parameter) && values[parameter] !== undefined && !accepted.has(parameter)) {
      throw new Error(`query ${name} does not take --${parameter}`);
    }
  }
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

function reportTsv(sections: Record<string, Record<string, unknown>[]>): string {
  return Object.entries(sections).map(([name, rows]) => rows.length === 0
    ? `# ${name}\n`
    : `# ${name}\n${tsv(rows)}\n`).join("");
}

function warn(providers: ProviderRow[]): void {
  for (const p of providers) if (!p.ok) process.stderr.write(`panoram: provider ${p.name} failed: ${p.error}\n`);
}

export function reportJson(name: string, result: ReportResult): Record<string, unknown> {
  return {
    report: name,
    root: result.params["root"],
    scope: result.scope,
    me: result.me,
    params: result.params,
    sections: result.sections,
    section_status: result.sectionStatus,
    providers: result.providers,
  };
}

export type ExitFlags = { expectEmpty: boolean; strict: boolean };

// A failed provider makes every negative gate result unknown, so it wins.
export function exitCodeFor(result: Pick<RunResult<unknown>, "rows" | "providers">, flags: ExitFlags): 0 | 3 | 4 {
  if (flags.strict && result.providers.some((provider) => provider.ok === 0)) return 4;
  if (flags.expectEmpty && result.rows.length > 0) return 3;
  return 0;
}

async function main(argv: string[]): Promise<number> {
  const userQueries = loadUserQueries(process.env);
  const { values, positionals } = parseArgs({
    args: argv,
    options: optionsFor(userQueries),
    allowPositionals: true,
  });
  const sql = textOption(values, "sql");
  const root = textOption(values, "root");
  const scope = textOption(values, "scope");
  const me = textOption(values, "me");
  const help = values["help"] === true;
  const requestedName = positionals[0];
  const report = sql === undefined && requestedName !== undefined && Object.hasOwn(reports, requestedName)
    ? reports[requestedName as keyof typeof reports]
    : undefined;
  const named = report === undefined && sql === undefined && requestedName !== undefined && Object.hasOwn(catalog, requestedName)
    ? catalog[requestedName]
    : undefined;
  const userQuery = report === undefined && sql === undefined && requestedName !== undefined
    ? userQueries.find((query) => query.name === requestedName)
    : undefined;
  validateQueryOptions(values, userQueries, report === undefined ? named?.params ?? userQuery?.params ?? [] : reportParams(report), requestedName ?? "sql");
  if (help || (positionals.length === 0 && sql === undefined)) {
    if (help && values["json"] === true) console.log(JSON.stringify([...queriesForHelp(userQueries, process.env), ...reportsForHelp()]));
    else console.log(usage(userQueries, process.env));
    return help ? 0 : 2;
  }
  if (!isScope(scope)) {
    console.error(`panoram: --scope is root, agents, or all, not ${scope}`);
    return 2;
  }
  // Keep the same parameter names intact when the CLI passes them to SQLite.
  const params: Record<string, unknown> = Object.create(null);
  if (me !== undefined) params["me"] = me === "" ? null : me;

  let name: string;
  let result: RunResult<Record<string, unknown>> | undefined;
  let reportResult: ReportResult | undefined;
  if (sql !== undefined) {
    name = "sql";
    // The two flags are the two parameters a statement can name. Any other
    // `:name` is an error from the core.
    if (/:root\b/.test(sql)) params["root"] = toplevel(root ?? process.cwd());
    result = await runSql(sql, { loaders, scope, params });
  } else {
    name = requestedName!;
    if (!report && !named && !userQuery) {
      console.error(`panoram: no query named ${name}\n\n${usage(userQueries, process.env)}`);
      return 2;
    }
    if (report) {
      const parameters = reportParams(report);
      if (parameters.includes("root")) params["root"] = toplevel(root ?? process.cwd());
      for (const parameter of parameters) {
        if (parameter === "root" || parameter === "me") continue;
        const value = textOption(values, parameter);
        if (value !== undefined) params[parameter] = value;
      }
      reportResult = await runReport(report.sections.map(([section, query]) => [section, catalog[query]!.query] as const), { loaders, scope, params });
    } else if (userQuery) {
      if (userQuery.params.includes("root")) params["root"] = toplevel(root ?? process.cwd());
      for (const parameter of userQuery.params) {
        if (parameter === "root" || parameter === "me") continue;
        const value = textOption(values, parameter);
        if (value !== undefined) params[parameter] = value;
      }
      result = await runSql(userQuery.sql, { loaders, scope, params });
    } else if (named) {
      if (named.params.includes("root")) params["root"] = toplevel(root ?? process.cwd());
      for (const parameter of named.params) {
        if (parameter === "root" || parameter === "me") continue;
        const value = textOption(values, parameter);
        if (value !== undefined) params[parameter] = value;
      }
      result = await runQuery(named.query, { loaders, scope, params });
    } else {
      throw new Error(`no query named ${name}`);
    }
  }
  recordCall(process.env, name);
  if (reportResult !== undefined) {
    if (values["tsv"] === true) process.stdout.write(reportTsv(reportResult.sections));
    else console.log(JSON.stringify(reportJson(name, reportResult), null, 2));
    warn(reportResult.providers);
    return exitCodeFor({ rows: reportResult.sections["agents"] ?? [], providers: reportResult.providers }, { expectEmpty: values["expect-empty"] === true, strict: values["strict"] === true });
  }
  if (result === undefined) throw new Error(`no result for ${name}`);
  if (values["tsv"] === true) {
    process.stdout.write(tsv(result.rows));
    warn(result.providers);
  } else {
    console.log(JSON.stringify({ query: name, scope: result.scope, me: result.me, params: result.params, rows: result.rows, providers: result.providers }, null, 2));
  }
  return exitCodeFor(result, { expectEmpty: values["expect-empty"] === true, strict: values["strict"] === true });
}

// A reader that stops early (`panoram agents | head`) closes the pipe; that
// is the reader's choice, not a failure of panoram.
process.stdout.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code === "EPIPE") process.exit(0);
  throw e;
});

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (e) {
    // A statement that does not prepare, or a parameter with no flag. The
    // message is the whole story; a stack would point into the core.
    process.stderr.write(`panoram: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  }
}
