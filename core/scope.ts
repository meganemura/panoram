// The roots a repository-scoped loader may inspect. This is the single place
// where a call combines observed roots with an explicit root parameter.
// Boundary: choosing roots only. Each provider decides what it reads there.
import type { LoadContext } from "./loader.ts";
import { herdrQueries } from "../providers/herdr/public.ts";
import { repoQueries } from "../providers/repos/public.ts";

export async function rootsInScope(ctx: LoadContext): Promise<string[]> {
  const roots = new Set(ctx.roots);
  for (const row of await ctx.db.all(herdrQueries.roots)) if (row.root !== null) roots.add(row.root);
  if (ctx.scope === "all") for (const row of await ctx.db.all(repoQueries.paths)) roots.add(row.path);
  return [...roots];
}
