// The named queries the CLI and the skill show. A name here is a promise
// to an agent: the skill lists it, and this file maps it to a statement.
// Boundary: the mapping only. The statements live in the modules.
import type { Entry, Query } from "solarsql";
import { herdrQueries } from "./providers/herdr/public.ts";
import { gitQueries } from "./providers/git/public.ts";
import { repoQueries } from "./providers/repos/public.ts";
import { reportQueries } from "./providers/report/public.ts";

export type Named = { query: Query<string, Entry>; description: string; params: readonly string[] };

export const catalog: Readonly<Record<string, Named>> = {
  "agents": { query: herdrQueries.all, description: "Every agent herdr hosts, with its repository root.", params: [] },
  "in-dir": { query: herdrQueries.inDir, description: "The agents in one repository, by its root.", params: ["root"] },
  "working": { query: herdrQueries.working, description: "The agents that work right now.", params: [] },
  "workspaces": { query: herdrQueries.workspaces, description: "Which workspace holds agents of which repository.", params: [] },
  "dirty": { query: gitQueries.dirty, description: "Repositories with uncommitted changes, dirtiest first.", params: [] },
  "worktrees": { query: gitQueries.worktreesOf, description: "The worktrees of one repository, by its root.", params: ["root"] },
  "repos": { query: repoQueries.all, description: "Every repository ghq manages.", params: [] },
  "agents-in-dirty-repos": { query: reportQueries.agentsInDirtyRepos, description: "Agents that work in a repository with uncommitted changes.", params: [] },
  "crowded-repos": { query: reportQueries.crowdedRepos, description: "Repositories with more than one agent, and their dirt.", params: [] },
  "idle-worktrees": { query: reportQueries.idleWorktrees, description: "Linked worktrees with no agent in them.", params: [] },
  "agents-outside-ghq": { query: reportQueries.agentsOutsideGhq, description: "Agents whose repository is not one ghq manages, or no repository at all.", params: [] },
  "dirty-unattended": { query: reportQueries.dirtyUnattended, description: "Repositories with uncommitted changes and no agent.", params: [] },
  "behind-upstream-with-agents": { query: reportQueries.behindUpstreamWithAgents, description: "Repositories behind their upstream that have an agent in them.", params: [] },
};
