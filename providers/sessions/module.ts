// Provider: sessions. It records sessions that the Claude Code registry and
// Codex lock directory say are alive now. Transcript tails add recent context
// without turning this provider into a history search.
// Boundary: this table, its loading command, and single-table queries. Joins
// with agents live in the report module.
import { commands, queries, table } from "solarsql";
import { generated } from "./solarsql.generated.ts";

export const sessions = table(`
  create table sessions (
    session_id text primary key not null,
    agent text not null,
    pid integer,
    cwd text not null,
    root text,
    name text,
    kind text,
    status text,
    version text,
    started_at integer,
    updated_at integer,
    last_turn_at integer,
    last_branch text
  ) strict
`);

export const sessionQueries = queries(generated, {
  all: `
    select session_id, agent, pid, cwd, root, name, kind, status, version, started_at, updated_at, last_turn_at, last_branch
    from sessions order by agent, started_at`,
  idle: `
    select session_id, agent, pid, cwd, root, name, kind, status, version, started_at, updated_at, last_turn_at, last_branch,
           cast((unixepoch('subsec') * 1000 - updated_at) / 60000 as integer) as idle_minutes
    from sessions order by updated_at asc`,
});

export const sessionCommands = commands(generated, {
  load: {
    plan: [
      `insert or ignore into sessions (session_id, agent, pid, cwd, root, name, kind, status, version, started_at, updated_at, last_turn_at, last_branch)
       select value ->> 'session_id', value ->> 'agent', value ->> 'pid', value ->> 'cwd', value ->> 'root', value ->> 'name', value ->> 'kind', value ->> 'status', value ->> 'version', value ->> 'started_at', value ->> 'updated_at', value ->> 'last_turn_at', value ->> 'last_branch'
       from json_each(:rows)`,
    ],
  },
});
