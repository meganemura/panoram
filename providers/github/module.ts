// Provider: github. Two tables from gh, each with its own loader, because
// each costs a network round trip and a query pays only for the table it
// reads: `pull_requests` lists the open pull requests of every repository
// in scope, `review_requests` is one search for the caller's requested
// reviews across GitHub.
// Boundary: the tables, their loading commands, and single-table queries.
// Joins with other providers live in the report module.
import { commands, queries, table } from "solarsql";
import { generated } from "./solarsql.generated.ts";

export const pullRequests = table(`
  create table pull_requests (
    id text primary key not null,
    repo text not null,
    root text,
    number integer not null,
    title text not null,
    head_branch text,
    head_repo text,
    base_branch text,
    author text,
    is_draft integer not null default 0,
    state text not null,
    review_decision text,
    checks text,
    updated_at integer not null,
    url text not null
  ) strict
`);

export const reviewRequests = table(`
  create table review_requests (
    id text primary key not null,
    repo text not null,
    root text,
    number integer not null,
    title text not null,
    author text,
    updated_at integer not null,
    url text not null
  ) strict
`);

export const githubQueries = queries(generated, {
  open: `
    select id, repo, root, number, title, head_branch, head_repo, base_branch, author, is_draft, state, review_decision, checks, updated_at, url
    from pull_requests where root = :root order by number`,
  reviewRequests: `
    select id, repo, root, number, title, author, updated_at, url
    from review_requests order by updated_at desc`,
});

export const githubCommands = commands(generated, {
  loadPullRequests: {
    plan: [
      `insert or ignore into pull_requests (id, repo, root, number, title, head_branch, head_repo, base_branch, author, is_draft, state, review_decision, checks, updated_at, url)
       select value ->> 'id', value ->> 'repo', value ->> 'root', value ->> 'number', value ->> 'title', value ->> 'head_branch', value ->> 'head_repo', value ->> 'base_branch', value ->> 'author', value ->> 'is_draft', value ->> 'state', value ->> 'review_decision', value ->> 'checks', value ->> 'updated_at', value ->> 'url'
       from json_each(:rows)`,
    ],
  },
  loadReviewRequests: {
    plan: [
      `insert or ignore into review_requests (id, repo, root, number, title, author, updated_at, url)
       select value ->> 'id', value ->> 'repo', value ->> 'root', value ->> 'number', value ->> 'title', value ->> 'author', value ->> 'updated_at', value ->> 'url'
       from json_each(:rows)`,
    ],
  },
});
