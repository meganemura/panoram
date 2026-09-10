// Fills mise's global versions and the requested versions for roots in scope.
// mise answers per directory, but its answer depends only on configuration
// files above that directory. Grouping equal file lists avoids 17 concurrent
// launches that cost about one second; two launches cost about one third.
// A failed root has no useful per-directory answer, but it must not hide the
// global inventory or another root's answer.
// Boundary: this provider's tables only.
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { LoadContext, Loader } from "../../core/loader.ts";
import { rootsInScope } from "../../core/scope.ts";
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

const miseConfigNames = ["mise.toml", ".mise.toml", "mise.local.toml", ".mise.local.toml", ".mise/config.toml", ".config/mise.toml", ".config/mise/config.toml", ".tool-versions"] as const;

function fileExists(path: string): boolean {
  try { return statSync(path).isFile(); } catch { return false; }
}

export function miseConfigFilesOf(root: string, env: Readonly<Record<string, string | undefined>>, exists: (path: string) => boolean): string[] {
  const files: string[] = [];
  for (let directory = root;; directory = dirname(directory)) {
    for (const name of miseConfigNames) {
      const path = join(directory, name);
      if (exists(path)) files.push(path);
    }
    if (dirname(directory) === directory) break;
  }
  files.push(env["MISE_CONFIG_FILE"] || join(env["HOME"] || homedir(), ".config", "mise", "config.toml"));
  return files;
}

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

    const groups = new Map<string, string[]>();
    for (const root of await rootsInScope(ctx)) {
      const key = miseConfigFilesOf(root, ctx.env, fileExists).join("\n");
      const group = groups.get(key);
      if (group === undefined) groups.set(key, [root]);
      else group.push(root);
    }
    const uses = await Promise.all([...groups.values()].map(async (rootsForConfig) => {
      const root = rootsForConfig[0]!;
      const sameRoots = rootsForConfig.slice(1);
      try {
        const document = parseDocument(await ctx.exec("mise", ["ls", "--json", "--current", "-C", root]));
        return [usesFrom(root, document), ...sameRoots.map((sameRoot) => usesFrom(sameRoot, document))];
      } catch {
        return [];
      }
    }));
    const loadedUses = await ctx.db.run(miseCommands.loadUses, { rows: uses.flat(2) });
    if (!loadedUses.ok) throw new Error(`tool_uses: ${loadedUses.kind}`);
  },
};
