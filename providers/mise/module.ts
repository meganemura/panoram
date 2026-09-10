// Provider: mise. The loader records installed versions and the versions a
// repository activates. The source path stays with a use because a file above
// a repository can select its version.
// Boundary: the two tables, their loading commands, and single-table queries.
// Joins with other providers live in the report module.
import { commands, queries, table } from "solarsql";
import { generated } from "./solarsql.generated.ts";

export const tools = table(`
  create table tools (
    id text primary key not null,
    tool text not null,
    version text not null,
    install_path text,
    installed integer not null,
    active integer not null
  ) strict
`);

export const toolUses = table(`
  create table tool_uses (
    id text primary key not null,
    root text not null,
    tool text not null,
    version text not null,
    source text,
    installed integer not null
  ) strict
`);

export const miseQueries = queries(generated, {
  installed: `
    select tool, version, install_path, installed, active from tools order by tool, version`,
  inDir: `
    select tool, version, source, installed from tool_uses where root = :root order by tool`,
});

export const miseCommands = commands(generated, {
  loadTools: {
    plan: [
      `insert or ignore into tools (id, tool, version, install_path, installed, active)
       select value ->> 'id', value ->> 'tool', value ->> 'version', value ->> 'install_path', value ->> 'installed', value ->> 'active'
       from json_each(:rows)`,
    ],
  },
  loadUses: {
    plan: [
      `insert or ignore into tool_uses (id, root, tool, version, source, installed)
       select value ->> 'id', value ->> 'root', value ->> 'tool', value ->> 'version', value ->> 'source', value ->> 'installed'
       from json_each(:rows)`,
    ],
  },
});
