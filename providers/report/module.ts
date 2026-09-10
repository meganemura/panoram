// The joins. This module owns no table and reads every provider's table
// (readsAll). Every query that crosses two providers lives here, so a
// provider module stays a description of one tool.
// `:me` is the caller's pane. Null keeps every agent, so a shell with no
// herdr identity still gets rows.
import { queries } from "solarsql";
import { generated } from "./solarsql.generated.ts";

export const reportQueries = queries(generated, {
  // Agents that work in a repository with uncommitted changes.
  agentsInDirtyRepos: `
    select a.pane_id, a.name, a.status, a.root, g.branch, g.dirty_count, g.untracked_count
    from agents a join git_status g on g.root = a.root
    where g.dirty_count > 0 and (:me is null or a.pane_id <> :me)
    order by g.dirty_count desc, a.pane_id`,
  // Repositories with more than one agent, and their dirt.
  crowdedRepos: `
    select a.root, cast(count(*) as integer) as agents, cast(sum(a.status = 'working') as integer) as working,
           cast(coalesce(g.dirty_count, 0) as integer) as dirty_count
    from agents a left join git_status g on g.root = a.root
    where a.root is not null
    group by a.root having count(*) > 1 order by agents desc, a.root`,
  // Linked worktrees that have no agent in them.
  idleWorktrees: `
    select w.path, w.branch, w.repo_root
    from worktrees w left join agents a on a.root = w.path
    where a.pane_id is null and w.path <> w.repo_root order by w.path`,
  // Agents whose root is not a ghq repository: scratch, temp, or no repository.
  agentsOutsideGhq: `
    select a.pane_id, a.name, a.status, a.cwd, a.root from agents a
    left join repos r on r.path = a.root
    where r.path is null and (:me is null or a.pane_id <> :me) order by a.pane_id`,
  // Repositories with uncommitted changes and no agent at all.
  dirtyUnattended: `
    select g.root, g.branch, g.dirty_count, g.untracked_count from git_status g
    left join agents a on a.root = g.root
    where a.pane_id is null and g.dirty_count > 0 order by g.dirty_count desc, g.root`,
  // Repositories behind their upstream that have an agent in them.
  behindUpstreamWithAgents: `
    select g.root, g.branch, g.upstream, g.behind, g.ahead,
           cast(count(a.pane_id) as integer) as agents
    from git_status g join agents a on a.root = g.root
    where g.behind > 0 and (:me is null or a.pane_id <> :me)
    group by g.root order by g.behind desc, g.root`,
});
