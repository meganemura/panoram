// These tests prove that the GitHub loaders join origins to roots and keep
// review requests in their own table. They use gh-shaped fixture output.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import type { Exec, Loader } from "../core/loader.ts";
import { runSql } from "../core/run.ts";
import { githubLoader, githubReviewsLoader, parseGithubOrigin, summarizeChecks } from "../providers/github/loader.ts";
import { herdrLoader } from "../providers/herdr/loader.ts";
import { repoLoader } from "../providers/repos/loader.ts";
import { fakeExec, fixtureAgentsWithLinkedWorktree, fixtureRepo, fixtureRepoWithOrigins, paths } from "./fixture.ts";

const loaders: Loader[] = [repoLoader, herdrLoader, githubLoader, githubReviewsLoader];

function githubExec(options: { nonGithub?: boolean; failGh?: boolean } = {}): Exec {
  const base = fakeExec({ agents: fixtureAgentsWithLinkedWorktree() });
  return async (command, args, cwd) => {
    if (command === "gh") {
      if (options.failGh) throw new Error("gh: authentication required\nmore output");
      if (args[0] === "pr") {
        const repo = args[args.indexOf("--repo") + 1];
        if (repo === "example/alpha") return JSON.stringify([{ number: 7, title: "Alpha", headRefName: "main", headRepository: { nameWithOwner: "example/alpha" }, baseRefName: "trunk", author: { login: "octo" }, isDraft: false, state: "OPEN", reviewDecision: "APPROVED", statusCheckRollup: [{ conclusion: "SUCCESS" }], updatedAt: "2026-09-10T00:00:00Z", url: "https://example.test/alpha/7" }]);
        if (repo === "example/beta") return JSON.stringify([{ number: 8, title: "Beta", headRefName: "main", headRepository: { nameWithOwner: "example/beta" }, baseRefName: "trunk", author: { login: "octo" }, isDraft: true, state: "OPEN", reviewDecision: null, statusCheckRollup: [{ status: "IN_PROGRESS" }], updatedAt: "2026-09-10T00:01:00Z", url: "https://example.test/beta/8" }]);
      }
      if (args[0] === "search") return JSON.stringify([{ repository: { nameWithOwner: "example/alpha" }, number: 7, title: "Alpha", author: { login: "octo" }, updatedAt: "2026-09-10T00:00:00Z", url: "https://example.test/alpha/7" }, { repository: { nameWithOwner: "example/review" }, number: 9, title: "Review", author: { login: "reviewer" }, updatedAt: "2026-09-10T00:02:00Z", url: "https://example.test/review/9" }]);
    }
    return base(command, args, cwd);
  };
}

test("github stores open pull requests, and review requests in their own table", async () => {
  const result = await runSql("select repo, root, number, checks from pull_requests order by repo, number", { loaders, exec: githubExec(), repo: fixtureRepo, env: {}, params: {} });
  assert.deepEqual(result.rows, [
    { repo: "example/alpha", root: paths.alpha, number: 7, checks: "pass" },
    { repo: "example/beta", root: paths.beta, number: 8, checks: "pending" },
  ]);
  assert.deepEqual(result.providers.map((entry) => entry.name), ["github", "herdr", "repos"]);
  const reviews = await runSql("select repo, root, number from review_requests order by repo, number", { loaders, exec: githubExec(), repo: fixtureRepo, env: {}, params: {} });
  assert.deepEqual(reviews.rows, [
    { repo: "example/alpha", root: paths.alpha, number: 7 },
    { repo: "example/review", root: null, number: 9 },
  ]);
  assert.deepEqual(reviews.providers.map((entry) => entry.name), ["github_reviews", "herdr", "repos"]);
});

test("github lists a shared repository once and skips a non-GitHub origin", async () => {
  const origins = new Map([[paths.alpha, "git@github.com:example/alpha.git"], [paths.alphaWorktree, "git@github.com:example/alpha.git"], [paths.beta, "https://gitlab.com/example/beta.git"]]);
  const result = await runSql("select repo, count(*) as rows from pull_requests group by repo order by repo", { loaders, exec: githubExec({ nonGithub: true }), repo: fixtureRepoWithOrigins(origins), env: {}, params: {} });
  assert.deepEqual(result.rows, [{ repo: "example/alpha", rows: 1 }]);
});

test("github leaves its table empty when gh fails", async () => {
  const result = await runSql("select * from pull_requests", { loaders, exec: githubExec({ failGh: true }), repo: fixtureRepo, env: {}, params: {} });
  assert.deepEqual(result.rows, []);
  const provider = result.providers.find((entry) => entry.name === "github");
  assert.equal(provider?.ok, 0);
  assert.equal(provider?.error, "gh: authentication required");
});

test("the GitHub origin parser preserves generated repository names", () => hegel.test((tc) => {
  const owner = tc.draw(gs.fromRegex("[A-Za-z0-9._-]{1,20}"));
  const name = tc.draw(gs.fromRegex("[A-Za-z0-9._-]{1,20}"));
  const shape = tc.draw(gs.sampledFrom([`git@github.com:${owner}/${name}`, `https://github.com/${owner}/${name}`, `ssh://git@github.com/${owner}/${name}`]));
  const suffix = tc.draw(gs.sampledFrom(["", ".git"]));
  assert.equal(parseGithubOrigin(`${shape}${suffix}`), `${owner}/${name}`);
}));

test("the GitHub origin parser rejects strings without github.com", () => hegel.test((tc) => {
  const value = tc.draw(gs.fromRegex("[A-Za-z0-9:/@._-]{0,80}").filter((text) => !text.includes("github.com")));
  assert.equal(parseGithubOrigin(value), null);
}));

test("the checks summary follows the four outcomes", () => hegel.test((tc) => {
  const values = tc.draw(gs.arrays(gs.sampledFrom(["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE", "IN_PROGRESS", "QUEUED", "PENDING", "WAITING", "REQUESTED", "EXPECTED", "SUCCESS", "NEUTRAL"]), { maxSize: 20 }));
  const rollup = values.map((value, index) => index % 3 === 0 ? { conclusion: value } : index % 3 === 1 ? { state: value } : { status: value });
  const failed = values.some((value) => ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(value));
  const pending = values.some((value) => ["IN_PROGRESS", "QUEUED", "PENDING", "WAITING", "REQUESTED", "EXPECTED"].includes(value));
  assert.equal(summarizeChecks(rollup), values.length === 0 ? "none" : failed ? "fail" : pending ? "pending" : "pass");
}));
