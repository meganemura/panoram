// This test proves that provider table declarations match the applied schema.
// It does not validate the data each provider inserts.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { loadLoaders } from "../core/registry.ts";
import { migrations } from "../migrations/index.ts";
import { migrate } from "solarsql/node";

test("every provider table has one loader and every loader table is migrated", async () => {
  const raw = new DatabaseSync(":memory:");
  try {
    migrate(raw, migrations);
    const schemaTables = raw.prepare("select name from sqlite_master where type = 'table' order by name").all() as { name: string }[];
    const tables = schemaTables.map((row) => row.name).filter((name) => name !== "providers" && !name.startsWith("solarsql_"));
    const loaders = await loadLoaders();
    const declarations = loaders.flatMap((loader) => loader.tables.map((table) => ({ loader: loader.name, table })));

    for (const table of tables) assert.equal(declarations.filter((declaration) => declaration.table === table).length, 1, `${table} needs one loader`);
    for (const declaration of declarations) assert.ok(tables.includes(declaration.table), `${declaration.loader} declares a migrated table`);
  } finally {
    raw.close();
  }
});
