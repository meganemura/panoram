// These tests prove that ps and lsof join by pid and retain useful ports.
// They use canned process output instead of the machine that runs the tests.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import type { Exec, Loader } from "../core/loader.ts";
import { runSql } from "../core/run.ts";
import { herdrLoader } from "../providers/herdr/loader.ts";
import { parseElapsed, parseLsof, processesLoader } from "../providers/processes/loader.ts";
import { repoLoader } from "../providers/repos/loader.ts";
import { fakeExec, fixtureRepo, paths } from "./fixture.ts";

const loaders: Loader[] = [repoLoader, herdrLoader, processesLoader];

function processExec(): Exec {
  const base = fakeExec();
  return async (command, args, cwd, options) => {
    if (command === "ps") {
      assert.deepEqual(args, ["-axo", "pid,ppid,pgid,etime,rss,pcpu,command"]);
      return [
        "101 1 101 01:02 100 0.1 /usr/local/bin/node server.js",
        `102 ${process.pid} 102 00:10 101 0.2 /bin/sh child`,
        "103 1 103 1-02:03:04 102 0.3 /usr/bin/vitest --watch",
        "104 1 104 02:03:04 103 0.4 /bin/node outside.js",
        "105 1 105 00:30 104 0.5 /bin/node gamma.js",
      ].join("\n");
    }
    if (command === "lsof" && args.join(" ") === `-a -d cwd -u ${process.getuid!()} -Fpn`) {
      assert.deepEqual(options, { exitCodes: [1] });
      return [`p101`, "fcwd", `n${paths.alpha}/app`, "p102", "fcwd", `n${paths.alpha}`, "p103", "fcwd", `n${paths.beta}`, "p104", "fcwd", "n/tmp/outside", "p105", "fcwd", `n${paths.gamma}`].join("\n");
    }
    if (command === "lsof" && args.join(" ") === `-a -nP -iTCP -sTCP:LISTEN -u ${process.getuid!()} -Fpn`) {
      assert.deepEqual(options, { exitCodes: [1] });
      return ["p101", "n*:3000", "n[::1]:3000", "p104", "n127.0.0.1:5173"].join("\n");
    }
    return base(command, args, cwd, options);
  };
}

test("processes join ps to cwd, filter to roots, and retain outside listeners", async () => {
  const result = await runSql("select pid, executable, cwd, root, elapsed_s from processes order by pid", { loaders, exec: processExec(), repo: fixtureRepo, env: {}, params: {} });
  assert.deepEqual(result.rows, [
    { pid: 101, executable: "node", cwd: `${paths.alpha}/app`, root: paths.alpha, elapsed_s: 62 },
    { pid: 103, executable: "vitest", cwd: paths.beta, root: paths.beta, elapsed_s: 93784 },
  ]);
  const listeners = await runSql("select pid, address, port, cwd, root, command from listeners order by pid, address", { loaders, exec: processExec(), repo: fixtureRepo, env: {}, params: {} });
  assert.deepEqual(listeners.rows, [
    { pid: 101, address: "*", port: 3000, cwd: `${paths.alpha}/app`, root: paths.alpha, command: "/usr/local/bin/node server.js" },
    { pid: 101, address: "[::1]", port: 3000, cwd: `${paths.alpha}/app`, root: paths.alpha, command: "/usr/local/bin/node server.js" },
    { pid: 104, address: "127.0.0.1", port: 5173, cwd: "/tmp/outside", root: null, command: "/bin/node outside.js" },
  ]);
});

test("processes include ghq roots only under the all scope", async () => {
  const result = await runSql("select pid, root from processes order by pid", { loaders, exec: processExec(), repo: fixtureRepo, env: {}, scope: "all", params: {} });
  assert.deepEqual(result.rows, [
    { pid: 101, root: paths.alpha },
    { pid: 103, root: paths.beta },
    { pid: 105, root: paths.gamma },
  ]);
});

test("the elapsed parser preserves generated durations", () => hegel.test((tc) => {
  const d = tc.draw(gs.integers({ minValue: 0, maxValue: 99 }));
  const h = tc.draw(gs.integers({ minValue: 0, maxValue: 23 }));
  const m = tc.draw(gs.integers({ minValue: 0, maxValue: 59 }));
  const s = tc.draw(gs.integers({ minValue: 0, maxValue: 59 }));
  const kind = tc.draw(gs.sampledFrom(["minutes", "hours", "days"] as const));
  const shape = kind === "minutes" ? `${m}:${String(s).padStart(2, "0")}` : kind === "hours" ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${d}-${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  assert.equal(parseElapsed(shape), kind === "minutes" ? m * 60 + s : kind === "hours" ? h * 3600 + m * 60 + s : d * 86400 + h * 3600 + m * 60 + s);
}));

test("the lsof field parser preserves generated pid paths", () => hegel.test((tc) => {
  const pids = tc.draw(gs.arrays(gs.integers({ minValue: 1, maxValue: 9999 }), { maxSize: 10, unique: true }));
  const pairs = pids.map((pid) => [pid, tc.draw(gs.fromRegex("/[a-z]{1,8}/[a-z]{1,8}"))] as const);
  const output = pairs.flatMap(([pid, path]) => [`p${pid}`, "fcwd", `n${path}`]).join("\n");
  assert.deepEqual(parseLsof(output), new Map(pairs.map(([pid, path]) => [pid, [path]])));
}));
