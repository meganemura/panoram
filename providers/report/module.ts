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
  // Repositories with an agent and a requested version that is absent.
  missingToolsWithAgents: `
    select u.root, u.tool, u.version, u.source, cast(count(a.pane_id) as integer) as agents
    from tool_uses u join agents a on a.root = u.root
    where u.installed = 0 and (:me is null or a.pane_id <> :me)
    group by u.root, u.tool, u.version, u.source order by u.root, u.tool`,
  // Tool versions that differ between roots where an agent is present.
  toolVersionsSplit: `
    select u.tool, cast(count(distinct u.version) as integer) as versions,
           cast(group_concat(distinct u.version) as text) as version_list
    from tool_uses u join agents a on a.root = u.root
    group by u.tool having count(distinct u.version) > 1 order by u.tool`,
  // Agent panes with the session record that describes their recent work.
  agentsWithSessions: `
    select a.pane_id, a.agent, a.status, s.name, s.kind, s.started_at, s.updated_at, s.last_turn_at, s.last_branch, a.root,
           cast((unixepoch('subsec') * 1000 - s.updated_at) / 60000 as integer) as idle_minutes
    from agents a join sessions s on s.session_id = a.session_id
    where :me is null or a.pane_id <> :me
    order by idle_minutes desc`,
  // Live sessions can lack a pane when they run headlessly or elsewhere.
  sessionsWithoutPane: `
    select s.session_id, s.agent, s.cwd, s.root, s.name, s.kind, s.updated_at
    from sessions s left join agents a on a.session_id = s.session_id
    where a.pane_id is null order by s.agent, s.updated_at`,
  // Agents whose current branch has an open pull request.
  prsWithAgents: `
    select a.pane_id, a.name, a.status, p.repo, p.number, p.title, p.head_branch, p.checks, p.review_decision, p.is_draft, p.url
    from agents a join git_status g on g.root = a.root
    join pull_requests p on p.root = g.root and p.head_branch = g.branch and p.head_repo = p.repo
    where :me is null or a.pane_id <> :me
    order by p.repo, p.number, a.pane_id`,
  // Failed pull requests show how many agents work in their repository.
  failingChecksWithAgents: `
    select p.repo, p.number, p.title, p.head_branch, p.checks, p.review_decision, p.is_draft, p.url,
           cast(count(a.pane_id) as integer) as agents
    from agents a join git_status g on g.root = a.root
    join pull_requests p on p.root = g.root and p.head_branch = g.branch and p.head_repo = p.repo
    where p.checks = 'fail' and (:me is null or a.pane_id <> :me)
    group by p.id order by p.repo, p.number`,
  // A review request can sit outside the roots currently in scope.
  reviewRequestsWithAgents: `
    select p.repo, p.number, p.title, p.author, p.updated_at, p.url,
           cast(count(a.pane_id) as integer) as agents
    from review_requests p left join agents a on a.root = p.root and (:me is null or a.pane_id <> :me)
    group by p.id order by p.updated_at desc`,
  // Ports inside the selected repository.
  portsInDir: `
    select pid, address, port, cwd, root, command
    from listeners where root = :root order by port`,
  // A server and the agents whose repository it occupies.
  serversWithAgents: `
    select l.root, l.port, l.address, l.pid, l.command, cast(count(a.pane_id) as integer) as agents
    from listeners l join agents a on a.root = l.root
    where :me is null or a.pane_id <> :me
    group by l.id order by l.port`,
  // Long-lived repository processes without an agent pane.
  longRunningWithoutAgents: `
    select p.root, p.pid, p.executable, p.elapsed_s, p.rss_kb
    from processes p left join agents a on a.root = p.root
    where p.elapsed_s > 3600 and a.pane_id is null order by p.elapsed_s desc`,
});
