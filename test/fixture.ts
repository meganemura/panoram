// This fixture fixes a small machine state so tests isolate panoram from external tools.
// It does not try to reproduce every output form that the real tools can produce.
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import type { Exec } from "../core/loader.ts";
import type { Repo } from "../core/repo.ts";

export const paths = {
  alpha: "/home/u/src/github.com/o/alpha",
  alphaWorktree: "/home/u/src/github.com/o/alpha-wt",
  alphaSubdirectory: "/home/u/src/github.com/o/alpha/sub",
  beta: "/home/u/src/github.com/o/beta",
  gamma: "/home/u/src/github.com/o/gamma",
  scratch: "/tmp/scratch",
} as const;

export const paneIds = {
  alphaWorking: "w1:p1",
  alphaIdle: "w1:p2",
  betaWorking: "w2:p1",
  scratchIdle: "w3:p1",
  alphaWorktreeIdle: "w4:p1",
} as const;

export const sessionIds = {
  alphaWorking: "11111111-1111-4111-8111-111111111111",
  alphaIdle: "22222222-2222-4222-8222-222222222222",
  betaWorking: "33333333-3333-4333-8333-333333333333",
  scratchIdle: "44444444-4444-4444-8444-444444444444",
  alphaWorktreeIdle: "55555555-5555-4555-8555-555555555555",
} as const;

export type SnapshotAgent = {
  pane_id: string;
  agent: "claude";
  agent_status: "working" | "idle";
  agent_session: { value: string };
  name?: string;
  focused: boolean;
  cwd: string;
  foreground_cwd: string;
  workspace_id: string;
  tab_id: string;
  terminal_title_stripped: string;
};

export function fixtureAgents(options: { focusedPaneId?: string | null } = {}): SnapshotAgent[] {
  const focusedPaneId = options.focusedPaneId === undefined ? paneIds.betaWorking : options.focusedPaneId;
  return [
    {
      pane_id: paneIds.alphaWorking,
      agent: "claude",
      agent_status: "working",
      agent_session: { value: sessionIds.alphaWorking },
      name: "Alpha working",
      focused: focusedPaneId === paneIds.alphaWorking,
      cwd: paths.alpha,
      foreground_cwd: paths.alpha,
      workspace_id: "workspace-alpha",
      tab_id: "tab-alpha",
      terminal_title_stripped: "alpha working",
    },
    {
      pane_id: paneIds.alphaIdle,
      agent: "claude",
      agent_status: "idle",
      agent_session: { value: sessionIds.alphaIdle },
      focused: focusedPaneId === paneIds.alphaIdle,
      cwd: paths.alphaSubdirectory,
      foreground_cwd: paths.alphaSubdirectory,
      workspace_id: "workspace-alpha",
      tab_id: "tab-alpha",
      terminal_title_stripped: "alpha idle",
    },
    {
      pane_id: paneIds.betaWorking,
      agent: "claude",
      agent_status: "working",
      agent_session: { value: sessionIds.betaWorking },
      name: "Beta working",
      focused: focusedPaneId === paneIds.betaWorking,
      cwd: paths.beta,
      foreground_cwd: paths.beta,
      workspace_id: "workspace-beta",
      tab_id: "tab-beta",
      terminal_title_stripped: "beta working",
    },
    {
      pane_id: paneIds.scratchIdle,
      agent: "claude",
      agent_status: "idle",
      agent_session: { value: sessionIds.scratchIdle },
      name: "Scratch idle",
      focused: focusedPaneId === paneIds.scratchIdle,
      cwd: paths.scratch,
      foreground_cwd: paths.scratch,
      workspace_id: "workspace-scratch",
      tab_id: "tab-scratch",
      terminal_title_stripped: "scratch idle",
    },
  ];
}

export function fixtureAgentsWithLinkedWorktree(): SnapshotAgent[] {
  return [
    ...fixtureAgents(),
    {
      pane_id: paneIds.alphaWorktreeIdle,
      agent: "claude",
      agent_status: "idle",
      agent_session: { value: sessionIds.alphaWorktreeIdle },
      name: "Alpha worktree idle",
      focused: false,
      cwd: paths.alphaWorktree,
      foreground_cwd: paths.alphaWorktree,
      workspace_id: "workspace-alpha-worktree",
      tab_id: "tab-alpha-worktree",
      terminal_title_stripped: "alpha worktree idle",
    },
  ];
}

export function snapshot(agents: readonly SnapshotAgent[] = fixtureAgents()): string {
  return JSON.stringify({ result: { snapshot: { agents, focused_pane_id: paneIds.betaWorking } } });
}

export const generatedAgentCwds = ["/cwd/a", "/cwd/b", "/cwd/outside-a", "/cwd/outside-b"] as const;

export type GeneratedSnapshotAgent = {
  pane_id: string;
  agent: "claude";
  agent_status: "working" | "idle" | "waiting";
  agent_session: { value: string } | null;
  name: string | null;
  focused: boolean;
  cwd: string;
};

export function drawSnapshotAgents(tc: hegel.TestCase, options: { atMostOneFocused?: boolean } = {}): GeneratedSnapshotAgent[] {
  const paneIds = tc.draw(gs.arrays(gs.fromRegex("w[0-9]{1,2}:p[0-9]{1,2}"), { minSize: 0, maxSize: 12, unique: true }));
  const sessionValues = tc.draw(gs.arrays(gs.text({ minSize: 1, codec: "ascii" }).map((value) => `session-${value}`), { minSize: paneIds.length, maxSize: paneIds.length, unique: true }));
  const focusedPane = options.atMostOneFocused && paneIds.length > 0
    ? tc.draw(gs.optional(gs.sampledFrom(paneIds)))
    : null;

  return paneIds.map((paneId, index) => {
    const session = tc.draw(gs.optional(gs.just(sessionValues[index]!)));
    return {
      pane_id: paneId,
      agent: "claude",
      agent_status: tc.draw(gs.sampledFrom(["working", "idle", "waiting"] as const)),
      agent_session: session === null ? null : { value: session },
      name: tc.draw(gs.optional(gs.text({ codec: "ascii" }))),
      focused: options.atMostOneFocused ? paneId === focusedPane : tc.draw(gs.booleans()),
      cwd: tc.draw(gs.sampledFrom(generatedAgentCwds)),
    };
  });
}

export function generatedSnapshot(agents: readonly GeneratedSnapshotAgent[]): string {
  return JSON.stringify({ result: { snapshot: { agents } } });
}

const origins = new Map<string, string>([
  [paths.alpha, "git@github.com:example/alpha.git"],
  [paths.alphaWorktree, "git@github.com:example/alpha.git"],
  [paths.beta, "https://github.com/example/beta"],
]);

export function fixtureRepoWithOrigins(values: ReadonlyMap<string, string> = origins): Repo {
  return {
    async rootOf(cwd) {
      try {
        return rootFor(cwd);
      } catch {
        return null;
      }
    },
    async originOf(root) {
      return values.get(root) ?? null;
    },
  };
}

export const fixtureRepo = fixtureRepoWithOrigins();

export function repoForRoots(roots: ReadonlySet<string>): Repo {
  return {
    async rootOf(cwd) { return roots.has(cwd) ? cwd : null; },
    async originOf() { return null; },
  };
}

export function fakeExec(options: { agents?: readonly SnapshotAgent[]; failHerdr?: boolean; failRepos?: boolean } = {}): Exec {
  const agents = options.agents ?? fixtureAgents();
  return async (command, args, cwd) => {
    const invocation = args.join(" ");
    if (command === "herdr" && invocation === "api snapshot") {
      if (options.failHerdr) throw new Error("spawn herdr ENOENT");
      return snapshot(agents);
    }
    if (command === "ghq" && invocation === "list -p") {
      if (options.failRepos) throw new Error("spawn ghq ENOENT");
      return `${paths.alpha}\n${paths.beta}\n${paths.gamma}\n`;
    }
    if (command === "git" && invocation === "worktree list --porcelain") return worktreesFor(cwd);
    if (command === "git" && invocation === "--no-optional-locks status --porcelain=2 --branch") return statusFor(cwd);
    if (command === "docker" && invocation === "container ls --all --quiet --no-trunc") return "";
    if (command === "mise" && invocation === "ls --json") return miseInventory();
    if (command === "mise" && args[0] === "ls" && args[1] === "--json" && args[2] === "--current" && args[3] === "-C" && args[4] !== undefined) {
      return miseCurrent(args[4]);
    }
    throw new Error(`unexpected fake command: ${command} ${invocation} in ${cwd ?? ""}`);
  };
}

function miseInventory(): string {
  return JSON.stringify({
    node: [
      { version: "22.1.0", install_path: "/home/u/.local/share/mise/installs/node/22.1.0", installed: true, active: true },
      { version: "24.10.0", install_path: "/home/u/.local/share/mise/installs/node/24.10.0", installed: true, active: false },
    ],
    ruby: [{ version: "4.0.6", installed: false, active: false }],
  });
}

function miseCurrent(root: string): string {
  const config = "/home/u/.config/mise/config.toml";
  const group = "/home/u/src/github.com/o/mise.toml";
  if (root === paths.alpha || root === paths.alphaWorktree) {
    return JSON.stringify({
      node: [{ version: "24.10.0", installed: true, active: true, source: { type: "mise.toml", path: config } }],
      ruby: [{ version: "4.0.6", installed: false, active: true, source: { type: "mise.toml", path: group } }],
    });
  }
  if (root === paths.beta) {
    return JSON.stringify({
      node: [{ version: "22.1.0", installed: true, active: true, source: { type: "mise.toml", path: config } }],
    });
  }
  if (root === paths.gamma) {
    return JSON.stringify({
      node: [{ version: "22.1.0", installed: true, active: true, source: { type: "mise.toml", path: config } }],
    });
  }
  throw new Error(`unknown mise root: ${root}`);
}

function rootFor(cwd: string | undefined): string {
  if (cwd === paths.alpha || cwd?.startsWith(`${paths.alpha}/`)) return paths.alpha;
  if (cwd === paths.alphaWorktree) return paths.alphaWorktree;
  if (cwd === paths.beta) return paths.beta;
  throw new Error(`not a repository: ${cwd ?? ""}`);
}

function worktreesFor(cwd: string | undefined): string {
  if (cwd === paths.alpha || cwd === paths.alphaWorktree) {
    return [
      `worktree ${paths.alpha}`,
      "HEAD abc",
      "branch refs/heads/main",
      "",
      `worktree ${paths.alphaWorktree}`,
      "HEAD def",
      "branch refs/heads/feature",
      "",
    ].join("\n");
  }
  if (cwd === paths.beta) return [`worktree ${paths.beta}`, "HEAD beta", "branch refs/heads/main", ""].join("\n");
  if (cwd === paths.gamma) return [`worktree ${paths.gamma}`, "HEAD gamma", "branch refs/heads/gamma", ""].join("\n");
  throw new Error(`unknown worktree root: ${cwd ?? ""}`);
}

function statusFor(cwd: string | undefined): string {
  if (cwd === paths.alpha) {
    return [
      "# branch.oid abc",
      "# branch.head main",
      "# branch.upstream origin/main",
      "# branch.ab +2 -3",
      "1 .M N... 100644 100644 100644 abc abc file-one",
      "2 R. N... 100644 100644 100644 abc abc R100 file-two",
      "? file-three",
      "",
    ].join("\n");
  }
  if (cwd === paths.alphaWorktree) return ["# branch.oid def", "# branch.head feature", "# branch.ab +0 -0", ""].join("\n");
  if (cwd === paths.beta) return ["# branch.oid beta", "# branch.head main", "# branch.ab +0 -0", ""].join("\n");
  if (cwd === paths.gamma) return ["# branch.oid gamma", "# branch.head gamma", "# branch.ab +0 -0", "1 .M N... 100644 100644 100644 abc abc file", ""].join("\n");
  throw new Error(`unknown status root: ${cwd ?? ""}`);
}
