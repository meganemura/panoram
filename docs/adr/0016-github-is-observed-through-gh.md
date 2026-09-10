# 0016. GitHub is observed through gh.

Date: 2026-09-10

Status: accepted

## Context

Before an agent pushes or opens a pull request, it needs to know whether its branch already has one, whether checks pass, and whether reviews wait.
GitHub owns that state.
`gh pr list` took about 0.8 seconds per repository, and one `gh search prs` took about 1.6 seconds with gh 2.98.0 on 2026-09-10.
ADR 0002 decides cache behavior, not where provider state lives.
The GitHub key is the origin repository, not the ghq path.

## Decision

The github provider owns two tables with a loader each: `pull_requests`, one `gh pr list` per distinct repository in scope, and `review_requests`, one `gh search prs` for the caller's requested reviews.
Each loader parses the origin of every root in scope; a root whose origin is not on GitHub has no rows.
A pull request keeps the repository its head branch lives in, so a join on the branch name pairs an agent only with a pull request from the same repository, not with one from a fork.
It summarizes checks as `pass`, `fail`, `pending`, or `none`.

## Consequences

A query that reads `pull_requests` takes 3 to 9 seconds under the default scope on 2026-09-10; the same 17 `gh pr list` calls take 2.5 to 3 seconds in a script that runs nothing else.
The difference follows the git processes a call runs before gh, as `ghq list` does in ADR 0008; the cause is not identified.
A query that reads `review_requests` pays the search alone, 2 to 5 seconds.
`--scope all` lists 66 repositories and the skill discourages it for these queries.
There is no rate limit handling in this version.
