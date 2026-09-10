// This fixture fixes a small machine state so tests isolate panoram from external tools.
// It does not try to reproduce every output form that the real tools can produce.
import type { Exec } from "../core/loader.ts";

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

export function fakeExec(options: { agents?: readonly SnapshotAgent[]; failHerdr?: boolean } = {}): Exec {
  const agents = options.agents ?? fixtureAgents();
  return async (command, args, cwd) => {
    const invocation = args.join(" ");
    if (command === "herdr" && invocation === "api snapshot") {
      if (options.failHerdr) throw new Error("spawn herdr ENOENT");
      return snapshot(agents);
    }
    if (command === "ghq" && invocation === "list -p") return `${paths.alpha}\n${paths.beta}\n${paths.gamma}\n`;
    if (command === "git" && invocation === "rev-parse --show-toplevel") return rootFor(cwd);
    if (command === "git" && invocation === "worktree list --porcelain") return worktreesFor(cwd);
    if (command === "git" && invocation === "status --porcelain=2 --branch") return statusFor(cwd);
    throw new Error(`unexpected fake command: ${command} ${invocation} in ${cwd ?? ""}`);
  };
}

function rootFor(cwd: string | undefined): string {
  if (cwd === paths.alpha || cwd === paths.alphaSubdirectory) return paths.alpha;
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
