// These tests prove that the mise loader preserves the tool inventory and
// per-root requirements. They use fixture output instead of a local mise
// configuration.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import type { Exec, Loader } from "../core/loader.ts";
import { runSql } from "../core/run.ts";
import { loaders } from "../panoram.config.ts";
import { herdrLoader } from "../providers/herdr/loader.ts";
import { miseConfigFilesOf, miseLoader } from "../providers/mise/loader.ts";
import { repoLoader } from "../providers/repos/loader.ts";
import { fakeExec, fixtureRepo, paths, repoForRoots } from "./fixture.ts";

const loaderSet: Loader[] = [repoLoader, herdrLoader, miseLoader];

test("mise stores global versions and requirements for every root in scope", async () => {
  const inventory = await runSql(
    "select id, tool, version, install_path, installed, active from tools order by tool, version",
    { loaders, exec: fakeExec(), repo: fixtureRepo, env: {}, scope: "all", params: {} },
  );
  assert.deepEqual(inventory.rows, [
    { id: "node@22.1.0", tool: "node", version: "22.1.0", install_path: "/home/u/.local/share/mise/installs/node/22.1.0", installed: 1, active: 1 },
    { id: "node@24.10.0", tool: "node", version: "24.10.0", install_path: "/home/u/.local/share/mise/installs/node/24.10.0", installed: 1, active: 0 },
    { id: "ruby@4.0.6", tool: "ruby", version: "4.0.6", install_path: null, installed: 0, active: 0 },
  ]);

  const uses = await runSql(
    "select id, root, tool, version, source, installed from tool_uses order by root, tool",
    { loaders, exec: fakeExec(), repo: fixtureRepo, env: {}, scope: "all", params: {} },
  );
  assert.deepEqual(uses.rows, [
    { id: `${paths.alpha} node`, root: paths.alpha, tool: "node", version: "24.10.0", source: "/home/u/.config/mise/config.toml", installed: 1 },
    { id: `${paths.alpha} ruby`, root: paths.alpha, tool: "ruby", version: "4.0.6", source: "/home/u/src/github.com/o/mise.toml", installed: 0 },
    { id: `${paths.beta} node`, root: paths.beta, tool: "node", version: "24.10.0", source: "/home/u/.config/mise/config.toml", installed: 1 },
    { id: `${paths.beta} ruby`, root: paths.beta, tool: "ruby", version: "4.0.6", source: "/home/u/src/github.com/o/mise.toml", installed: 0 },
    { id: `${paths.gamma} node`, root: paths.gamma, tool: "node", version: "24.10.0", source: "/home/u/.config/mise/config.toml", installed: 1 },
    { id: `${paths.gamma} ruby`, root: paths.gamma, tool: "ruby", version: "4.0.6", source: "/home/u/src/github.com/o/mise.toml", installed: 0 },
  ]);
});

test("mise skips every root in a configuration group that does not answer", async () => {
  const base = fakeExec();
  const exec: Exec = async (command, args, cwd) => {
    if (command === "mise" && args[0] === "ls" && args[1] === "--json" && args[2] === "--current" && args[3] === "-C" && args[4] === paths.alpha) {
      throw new Error("mise failed for the configuration group");
    }
    return base(command, args, cwd);
  };
  const result = await runSql(
    "select root, tool from tool_uses order by root, tool",
    { loaders, exec, repo: fixtureRepo, env: {}, scope: "agents", params: {} },
  );
  assert.deepEqual(result.rows, []);
  assert.equal(result.providers.find((provider) => provider.name === "mise")?.ok, 1);
});

test("mise runs once for roots with the same configuration files", async () => {
  const directory = mkdtempSync(join(tmpdir(), "panoram-mise-"));
  const sharedOne = join(directory, "repos", "one");
  const sharedTwo = join(directory, "repos", "two");
  const distinct = join(directory, "other");
  const userConfig = join(directory, "user.toml");
  mkdirSync(sharedOne, { recursive: true });
  mkdirSync(sharedTwo, { recursive: true });
  mkdirSync(distinct, { recursive: true });
  writeFileSync(join(directory, "repos", "mise.toml"), "");
  writeFileSync(join(distinct, "mise.toml"), "");
  let currentCalls = 0;
  const exec: Exec = async (command, args) => {
    if (command === "herdr") return snapshotForRoots([sharedOne, sharedTwo, distinct]);
    if (command === "ghq") return "";
    if (command === "mise" && args.join(" ") === "ls --json") return "{}";
    if (command === "mise" && args[2] === "--current") {
      currentCalls += 1;
      return JSON.stringify({ node: [{ version: "22.1.0", installed: true, active: true }] });
    }
    throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
  };
  try {
    const result = await runSql(
      "select root, tool from tool_uses order by root, tool",
      { loaders: loaderSet, exec, repo: repoForRoots(new Set([sharedOne, sharedTwo, distinct])), env: { MISE_CONFIG_FILE: userConfig }, scope: "agents", params: {} },
    );
    assert.equal(currentCalls, 2);
    assert.deepEqual(result.rows, [
      { root: distinct, tool: "node" },
      { root: sharedOne, tool: "node" },
      { root: sharedTwo, tool: "node" },
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

const miseConfigNames = ["mise.toml", ".mise.toml", "mise.local.toml", ".mise.local.toml", ".mise/config.toml", ".config/mise.toml", ".config/mise/config.toml", ".tool-versions"];

test("mise configuration lookup lists existing files nearest first", () => hegel.test((tc) => {
  const depth = tc.draw(gs.integers({ minValue: 1, maxValue: 6 }));
  const directories = Array.from({ length: depth }, (_, index) => `/tree/${Array.from({ length: index + 1 }, (_, part) => `d${part}`).join("/")}`);
  const existing = new Set<string>();
  for (const directory of directories) {
    for (const name of miseConfigNames) {
      if (tc.draw(gs.booleans())) existing.add(join(directory, name));
    }
  }
  const root = directories.at(-1)!;
  const userConfig = "/user/config.toml";
  const expected = directories.toReversed().flatMap((directory) => miseConfigNames.map((name) => join(directory, name)).filter((path) => existing.has(path)));
  assert.deepEqual(miseConfigFilesOf(root, { MISE_CONFIG_FILE: userConfig }, (path) => existing.has(path)), [...expected, userConfig]);
}));

type MiseVersion = {
  version: string;
  install_path?: string | null;
  installed: boolean;
  active: boolean;
  source?: { type: string; path: string };
};
type MiseDocument = Record<string, MiseVersion[]>;

function drawVersion(tc: hegel.TestCase, version: string): MiseVersion {
  const installPath = tc.draw(gs.optional(gs.fromRegex("[a-z]{1,8}").map((name) => `/installs/${name}`)));
  const sourcePath = tc.draw(gs.optional(gs.fromRegex("[a-z]{1,8}").map((name) => `/configs/${name}.toml`)));
  return {
    version,
    ...(installPath === null ? {} : { install_path: installPath }),
    installed: tc.draw(gs.booleans()),
    active: tc.draw(gs.booleans()),
    ...(sourcePath === null ? {} : { source: { type: "mise.toml", path: sourcePath } }),
  };
}

function drawDocument(tc: hegel.TestCase, minVersions: number, maxVersions: number): MiseDocument {
  const names = tc.draw(gs.arrays(gs.fromRegex("[a-z]{1,8}").map((name) => `tool-${name}`), { minSize: 0, maxSize: 6, unique: true }));
  return Object.fromEntries(names.map((tool) => {
    const versions = tc.draw(gs.arrays(gs.fromRegex("[0-9]{1,2}\\.[0-9]{1,2}\\.[0-9]{1,2}"), { minSize: minVersions, maxSize: maxVersions, unique: true }));
    return [tool, versions.map((version) => drawVersion(tc, version))];
  }));
}

function snapshotForRoots(roots: readonly string[]): string {
  return JSON.stringify({
    result: {
      snapshot: {
        agents: roots.map((cwd, index) => ({
          pane_id: `w${index}:p0`,
          agent: "claude",
          agent_status: "working",
          cwd,
        })),
      },
    },
  });
}

function generatedMiseExec(inventory: MiseDocument, current: Readonly<Record<string, MiseDocument>>): Exec {
  return async (command, args, cwd) => {
    const invocation = args.join(" ");
    if (command === "herdr" && invocation === "api snapshot") return snapshotForRoots(Object.keys(current));
    if (command === "ghq" && invocation === "list -p") return "";
    if (command === "mise" && invocation === "ls --json") return JSON.stringify(inventory);
    if (command === "mise" && args[0] === "ls" && args[1] === "--json" && args[2] === "--current" && args[3] === "-C" && args[4] !== undefined) {
      const document = current[args[4]];
      if (document !== undefined) return JSON.stringify(document);
    }
    throw new Error(`unexpected generated command: ${command} ${invocation} in ${cwd ?? ""}`);
  };
}

function expectedTools(document: MiseDocument): Record<string, unknown>[] {
  return Object.entries(document).flatMap(([tool, values]) => values.map((value) => ({
    id: `${tool}@${value.version}`,
    tool,
    version: value.version,
    install_path: value.install_path ?? null,
    installed: value.installed ? 1 : 0,
    active: value.active ? 1 : 0,
  }))).sort((left, right) => left.tool.localeCompare(right.tool) || left.version.localeCompare(right.version));
}

function expectedUses(current: Readonly<Record<string, MiseDocument>>): Record<string, unknown>[] {
  return Object.entries(current).flatMap(([root, document]) => Object.entries(document).flatMap(([tool, values]) => values.map((value) => ({
    id: `${root} ${tool}`,
    root,
    tool,
    version: value.version,
    source: value.source?.path ?? null,
    installed: value.installed ? 1 : 0,
  })))).sort((left, right) => String(left.root).localeCompare(String(right.root)) || String(left.tool).localeCompare(String(right.tool)));
}

test("mise preserves generated inventories and per-root requirements", () => hegel.testAsync(async (tc) => {
  const inventory = drawDocument(tc, 1, 4);
  const requirements = drawDocument(tc, 1, 1);
  const current = {
    "/roots/alpha": requirements,
    "/roots/beta": requirements,
    "/roots/gamma": requirements,
  };
  const exec = generatedMiseExec(inventory, current);
  const tools = await runSql(
    "select id, tool, version, install_path, installed, active from tools order by tool, version",
    { loaders: loaderSet, exec, repo: repoForRoots(new Set(Object.keys(current))), env: {}, scope: "agents", params: {} },
  );
  assert.deepEqual(tools.rows, expectedTools(inventory));

  const uses = await runSql(
    "select id, root, tool, version, source, installed from tool_uses order by root, tool",
    { loaders: loaderSet, exec, repo: repoForRoots(new Set(Object.keys(current))), env: {}, scope: "agents", params: {} },
  );
  assert.deepEqual(uses.rows, expectedUses(current));
}));
