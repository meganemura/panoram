// Fills mise's global versions and the requested versions for roots in scope.
// A failed root has no useful per-directory answer, but it must not hide the
// global inventory or another root's answer.
// Boundary: this provider's tables only.
import type { LoadContext, Loader } from "../../core/loader.ts";
import { herdrQueries } from "../herdr/public.ts";
import { repoQueries } from "../repos/public.ts";
import { miseCommands } from "./module.ts";
import type { ToolUsesId, ToolsId } from "./solarsql.generated.ts";

type MiseSource = { type: string; path: string };
type MiseVersion = {
  version: string;
  install_path?: string | null;
  installed: boolean;
  active: boolean;
  source?: MiseSource;
};
type MiseDocument = Record<string, MiseVersion[]>;

type Tool = { id: ToolsId; tool: string; version: string; install_path: string | null; installed: number; active: number };
type ToolUse = { id: ToolUsesId; root: string; tool: string; version: string; source: string | null; installed: number };

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseDocument(output: string): MiseDocument {
  const document = object(JSON.parse(output));
  if (document === null) throw new Error("mise returned invalid JSON");
  const result: MiseDocument = {};
  for (const [tool, values] of Object.entries(document)) {
    if (!Array.isArray(values)) throw new Error("mise returned invalid JSON");
    result[tool] = values.map((value) => {
      const entry = object(value);
      if (entry === null || typeof entry.version !== "string" || (entry.install_path !== null && typeof entry.install_path !== "undefined" && typeof entry.install_path !== "string") || typeof entry.installed !== "boolean" || typeof entry.active !== "boolean") {
        throw new Error("mise returned invalid JSON");
      }
      const sourceValue = entry.source === undefined ? null : object(entry.source);
      if (entry.source !== undefined && (sourceValue === null || typeof sourceValue.type !== "string" || typeof sourceValue.path !== "string")) {
        throw new Error("mise returned invalid JSON");
      }
      const source = sourceValue === null ? null : { type: sourceValue.type as string, path: sourceValue.path as string };
      return {
        version: entry.version,
        ...(entry.install_path === undefined ? {} : { install_path: entry.install_path as string | null }),
        installed: entry.installed,
        active: entry.active,
        ...(source === null ? {} : { source }),
      };
    });
  }
  return result;
}

function toolsFrom(document: MiseDocument): Tool[] {
  return Object.entries(document).flatMap(([tool, values]) => values.map((value) => ({
    id: `${tool}@${value.version}` as ToolsId,
    tool,
    version: value.version,
    install_path: value.install_path ?? null,
    installed: value.installed ? 1 : 0,
    active: value.active ? 1 : 0,
  })));
}

function usesFrom(root: string, document: MiseDocument): ToolUse[] {
  return Object.entries(document).flatMap(([tool, values]) => values.map((value) => ({
    id: `${root} ${tool}` as ToolUsesId,
    root,
    tool,
    version: value.version,
    source: value.source?.path ?? null,
    installed: value.installed ? 1 : 0,
  })));
}

export const miseLoader: Loader = {
  name: "mise",
  tables: ["tools", "tool_uses"],
  after: ["herdr", "repos"],
  async load(ctx) {
    const tools = toolsFrom(parseDocument(await ctx.exec("mise", ["ls", "--json"])));
    const loadedTools = await ctx.db.run(miseCommands.loadTools, { rows: tools });
    if (!loadedTools.ok) throw new Error(`tools: ${loadedTools.kind}`);

    const roots = new Set<string>();
    for (const row of await ctx.db.all(herdrQueries.roots)) if (row.root !== null) roots.add(row.root);
    if (ctx.scope === "all") for (const row of await ctx.db.all(repoQueries.paths)) roots.add(row.path);
    const uses = await Promise.all([...roots].map(async (root) => {
      try {
        return usesFrom(root, parseDocument(await ctx.exec("mise", ["ls", "--json", "--current", "-C", root])));
      } catch {
        return [];
      }
    }));
    const loadedUses = await ctx.db.run(miseCommands.loadUses, { rows: uses.flat() });
    if (!loadedUses.ok) throw new Error(`tool_uses: ${loadedUses.kind}`);
  },
};
