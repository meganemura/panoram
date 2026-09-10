// These tests prove that the command line exposes the catalog and rejects bad names.
// They do not run a query, so they cannot start a real provider tool.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";
import { catalog } from "../catalog.ts";

const execFileAsync = promisify(execFile);

test("help lists every catalog query", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["cli.ts", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  for (const name of Object.keys(catalog)) assert.match(stdout, new RegExp(`\\b${name}\\b`));
});

test("an unknown query exits with status 2", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, ["cli.ts", "nonesuch"], { cwd: process.cwd(), encoding: "utf8" }),
    (error: NodeJS.ErrnoException & { code?: number }) => error.code === 2,
  );
});
