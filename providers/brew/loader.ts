// Fills the installed Homebrew inventory with two local list operations.
// Both commands must answer before the loader writes, so a partial inventory
// cannot appear as a successful observation.
// Boundary: this provider's table only.
import type { Loader } from "../../core/loader.ts";
import { brewCommands } from "./module.ts";
import type { BrewPackagesId } from "./solarsql.generated.ts";

type BrewKind = "formula" | "cask";
type BrewPackage = { id: BrewPackagesId; kind: BrewKind; name: string; version: string };

export function parseBrewList(output: string, kind: BrewKind): BrewPackage[] {
  const rows = new Map<string, BrewPackage>();
  for (const [index, raw] of output.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (line === "") continue;
    const fields = line.split(/\s+/);
    const name = fields.shift();
    if (name === undefined || fields.length === 0) {
      throw new Error(`brew ${kind} list line ${index + 1} has no installed version`);
    }
    const versions = kind === "formula" ? fields : [fields.join(" ")];
    for (const version of versions) {
      const id = `${kind}:${name}@${version}`;
      rows.set(id, { id: id as BrewPackagesId, kind, name, version });
    }
  }
  return [...rows.values()];
}

export const brewLoader: Loader = {
  name: "brew",
  tables: ["brew_packages"],
  after: [],
  async load(ctx) {
    const [formulae, casks] = await Promise.all([
      ctx.exec("brew", ["list", "--formula", "--versions"]),
      ctx.exec("brew", ["list", "--cask", "--versions"]),
    ]);
    const rows = [...parseBrewList(formulae, "formula"), ...parseBrewList(casks, "cask")];
    const loaded = await ctx.db.run(brewCommands.load, { rows });
    if (!loaded.ok) throw new Error(`brew_packages: ${loaded.kind}`);
  },
};
