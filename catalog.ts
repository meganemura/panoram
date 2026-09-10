// The named queries the CLI and the skill show. A name here is a promise
// to an agent: the skill lists it, and this file maps it to a statement.
// Boundary: the mapping only. The statements live in the modules.
import type { Entry, Query } from "solarsql";
import { herdrQueries } from "./providers/herdr/public.ts";
import { gitQueries } from "./providers/git/public.ts";
import { miseQueries } from "./providers/mise/public.ts";
import { repoQueries } from "./providers/repos/public.ts";
import { reportQueries } from "./providers/report/public.ts";
import { sessionQueries } from "./providers/sessions/public.ts";

export type Named = { query: Query<string, Entry>; description: string; params: readonly string[] };

export const catalog: Readonly<Record<string, Named>> = {
  "agents": { query: herdrQueries.all, description: "Every agent herdr hosts, with its repository root.", params: [] },
  "in-dir": { query: herdrQueries.inDir, description: "The agents in one repository, by its root.", params: ["root"] },
  "working": { query: herdrQueries.working, description: "The agents that work right now.", params: [] },
  "workspaces": { query: herdrQueries.workspaces, description: "Which workspace holds agents of which repository.", params: [] },
  "dirty": { query: gitQueries.dirty, description: "Repositories with uncommitted changes, dirtiest first.", params: [] },
  "worktrees": { query: gitQueries.worktreesOf, description: "The worktrees of one repository, by its root.", params: ["root"] },
  "repos": { query: repoQueries.all, description: "Every repository ghq manages.", params: [] },
  "tools": { query: miseQueries.installed, description: "Every tool version mise has installed.", params: [] },
  "tools-in-dir": { query: miseQueries.inDir, description: "The tools mise activates in one repository, by its root.", params: ["root"] },
  "sessions": { query: sessionQueries.all, description: "Every Claude Code and Codex session alive now.", params: [] },
  "idle-sessions": { query: sessionQueries.idle, description: "Sessions ordered by how long they have been idle.", params: [] },
  "agents-in-dirty-repos": { query: reportQueries.agentsInDirtyRepos, description: "Agents that work in a repository with uncommitted changes.", params: [] },
  "crowded-repos": { query: reportQueries.crowdedRepos, description: "Repositories with more than one agent, and their dirt.", params: [] },
  "idle-worktrees": { query: reportQueries.idleWorktrees, description: "Linked worktrees with no agent in them.", params: [] },
  "agents-outside-ghq": { query: reportQueries.agentsOutsideGhq, description: "Agents whose repository is not one ghq manages, or no repository at all.", params: [] },
  "dirty-unattended": { query: reportQueries.dirtyUnattended, description: "Repositories with uncommitted changes and no agent.", params: [] },
  "behind-upstream-with-agents": { query: reportQueries.behindUpstreamWithAgents, description: "Repositories behind their upstream that have an agent in them.", params: [] },
  "missing-tools-with-agents": { query: reportQueries.missingToolsWithAgents, description: "Repositories with an agent where a requested tool is not installed.", params: [] },
  "tool-versions-split": { query: reportQueries.toolVersionsSplit, description: "Tools whose active version differs between repositories with an agent.", params: [] },
  "agents-with-sessions": { query: reportQueries.agentsWithSessions, description: "Agents with the name, start time, and last activity of their session.", params: [] },
  "sessions-without-pane": { query: reportQueries.sessionsWithoutPane, description: "Sessions alive now that herdr does not show as an agent.", params: [] },
};
