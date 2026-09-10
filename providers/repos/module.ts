// Provider: ghq, the repository manager. The loader runs `ghq list -p`.
// Boundary: the table, its loading command, and single-table queries.
import { commands, queries, table } from "solarsql";
import { generated } from "./solarsql.generated.ts";

export const repos = table(`
  create table repos (
    path text primary key not null,
    host text not null,
    owner text not null,
    name text not null
  ) strict
`);

export const repoQueries = queries(generated, {
  all: `select path, host, owner, name from repos order by path`,
  // The paths only. The git loader reads this under --scope all.
  paths: `select path from repos`,
});

export const repoCommands = commands(generated, {
  load: {
    plan: [
      `insert or ignore into repos (path, host, owner, name)
       select value ->> 'path', value ->> 'host', value ->> 'owner', value ->> 'name' from json_each(:rows)`,
    ],
  },
});
