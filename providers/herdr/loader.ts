// Fills `agents` from `herdr api snapshot`. One filesystem root lookup per
// distinct cwd gives `root`; a cwd outside a
// repository gets null and stays in the table, because "agents outside any
// repository" is a question too.
// Boundary: this provider's tables only.
import type { Loader, LoadContext } from "../../core/loader.ts";
import { herdrCommands, herdrQueries } from "./module.ts";
import type { AgentsId } from "./solarsql.generated.ts";

type SnapshotAgent = {
  pane_id: string;
  agent: string;
  agent_status: string;
  agent_session?: { value?: string } | null;
  name?: string | null;
  focused?: boolean;
  cwd: string;
  foreground_cwd?: string | null;
  workspace_id?: string | null;
  tab_id?: string | null;
  terminal_title_stripped?: string | null;
};

export const herdrLoader: Loader = {
  name: "herdr",
  tables: ["agents"],
  after: [],
  async load(ctx) {
    const out = await ctx.exec("herdr", ["api", "snapshot"]);
    const agents = JSON.parse(out).result.snapshot.agents as SnapshotAgent[];
    const cwds = [...new Set(agents.map((a) => a.cwd))];
    const roots = new Map(await Promise.all(cwds.map(async (cwd) => [cwd, await ctx.repo.rootOf(cwd)] as const)));
    const rows = agents.map((a) => ({
      pane_id: a.pane_id as AgentsId,
      session_id: a.agent_session?.value ?? null,
      name: a.name ?? null,
      agent: a.agent,
      status: a.agent_status,
      focused: a.focused ? 1 : 0,
      cwd: a.cwd,
      foreground_cwd: a.foreground_cwd ?? null,
      root: roots.get(a.cwd) ?? null,
      workspace_id: a.workspace_id ?? null,
      tab_id: a.tab_id ?? null,
      title: a.terminal_title_stripped ?? null,
    }));
    const r = await ctx.db.run(herdrCommands.load, { rows });
    if (!r.ok) throw new Error(`agents: ${r.kind}`);
  },
  // The pane herdr gave this process, then the session id Claude Code gave
  // it, then whatever herdr has in focus. A plain shell matches none and
  // gets null.
  async self(ctx) {
    const pane = ctx.env["HERDR_PANE_ID"];
    if (pane) return pane;
    const session = ctx.env["CLAUDE_CODE_SESSION_ID"];
    if (session) {
      const row = await ctx.db.first(herdrQueries.bySession, { session_id: session });
      if (row) return row.pane_id;
    }
    return (await ctx.db.first(herdrQueries.focused))?.pane_id ?? null;
  },
};
