// Fills `repos` from `ghq list -p`. The path is the key: it is what
// `git rev-parse --show-toplevel` returns for a checkout ghq made.
// Boundary: this provider's table only.
import type { Loader } from "../../core/loader.ts";
import { repoCommands } from "./module.ts";
import type { ReposId } from "./solarsql.generated.ts";

export const repoLoader: Loader = {
  name: "repos",
  tables: ["repos"],
  after: [],
  async load(ctx) {
    const out = await ctx.exec("ghq", ["list", "-p"]);
    const rows = out.split("\n").filter((line) => line !== "").map((path) => {
      const [host = "", owner = "", name = ""] = path.split("/").slice(-3);
      return { path: path as ReposId, host, owner, name };
    });
    const r = await ctx.db.run(repoCommands.load, { rows });
    if (!r.ok) throw new Error(`repos: ${r.kind}`);
  },
};
