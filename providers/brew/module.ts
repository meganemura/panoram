// Provider: brew. It records installed formula and cask versions from the
// local Homebrew inventory. Package names do not imply executable names.
// Boundary: this table, its loading command, and its direct query.
import { commands, queries, table } from "solarsql";
import { generated } from "./solarsql.generated.ts";

export const brewPackages = table(`
  create table brew_packages (
    id text primary key not null,
    kind text not null check (kind in ('formula', 'cask')),
    name text not null,
    version text not null
  ) strict
`);

export const brewQueries = queries(generated, {
  installed: `select kind, name, version from brew_packages order by kind, name, version`,
});

export const brewCommands = commands(generated, {
  load: {
    plan: [
      `insert or ignore into brew_packages (id, kind, name, version)
       select value ->> 'id', value ->> 'kind', value ->> 'name', value ->> 'version'
       from json_each(:rows)`,
    ],
  },
});
