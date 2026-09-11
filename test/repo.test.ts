// These tests build Git discovery files to prove the reader shares Git's
// worktree facts without starting Git. They do not test Git configuration.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import { fsRepo, originFromConfig, repositoryIdentity } from "../core/repo.ts";

const home = mkdtempSync(join(tmpdir(), "panoram-repo-"));
const main = join(home, "main");
const linked = join(home, "linked");
const outside = join(home, "outside");
mkdirSync(join(main, ".git", "worktrees", "x"), { recursive: true });
mkdirSync(join(main, "subdirectory"), { recursive: true });
mkdirSync(linked, { recursive: true });
mkdirSync(outside, { recursive: true });
writeFileSync(join(linked, ".git"), `gitdir: ${join(main, ".git", "worktrees", "x")}\n`);
writeFileSync(join(main, ".git", "worktrees", "x", "commondir"), "../..\n");

test("the filesystem repository reader finds checkout and linked-worktree roots", async () => {
  assert.equal(await fsRepo.rootOf(main), main);
  assert.equal(await fsRepo.rootOf(join(main, "subdirectory")), main);
  assert.equal(await fsRepo.rootOf(linked), linked);
  assert.equal(await fsRepo.rootOf(outside), null);
});

test("the filesystem repository reader reads origin from checkout and worktree config", async () => {
  writeFileSync(join(main, ".git", "config"), [
    '[remote "origin"]',
    "  fetch = +refs/heads/*:refs/remotes/origin/*",
    "  url = https://github.com/example/main.git",
  ].join("\n"));
  assert.equal(await fsRepo.originOf(main), "https://github.com/example/main.git");
  assert.equal(await fsRepo.originOf(linked), "https://github.com/example/main.git");

  const withoutOrigin = join(home, "without-origin");
  mkdirSync(join(withoutOrigin, ".git"), { recursive: true });
  writeFileSync(join(withoutOrigin, ".git", "config"), '[remote "upstream"]\n  url = https://example.test/upstream.git\n');
  assert.equal(await fsRepo.originOf(withoutOrigin), null);
});

test("repository identity joins linked worktrees but keeps clones distinct", async () => {
  const clone = join(home, "clone");
  mkdirSync(join(clone, ".git"), { recursive: true });
  const mainIdentity = await repositoryIdentity(main);
  const linkedIdentity = await repositoryIdentity(linked);
  const cloneIdentity = await repositoryIdentity(clone);
  assert.equal(mainIdentity.error, null);
  assert.equal(linkedIdentity.id, mainIdentity.id);
  assert.notEqual(cloneIdentity.id, mainIdentity.id);
});

test("repository identity rejects malformed and symbolic Git metadata", async () => {
  const malformed = join(home, "malformed");
  const extraLine = join(home, "extra-line");
  const emptyCommon = join(home, "empty-common");
  const emptyCommonGitdir = join(home, "empty-common-gitdir");
  const symbolic = join(home, "symbolic");
  mkdirSync(malformed);
  mkdirSync(extraLine);
  mkdirSync(emptyCommon);
  mkdirSync(emptyCommonGitdir);
  mkdirSync(symbolic);
  writeFileSync(join(malformed, ".git"), "not a git directory pointer\n");
  writeFileSync(join(extraLine, ".git"), `gitdir: ${join(main, ".git")}\nunexpected\n`);
  writeFileSync(join(emptyCommon, ".git"), `gitdir: ${emptyCommonGitdir}\n`);
  writeFileSync(join(emptyCommonGitdir, "commondir"), "\n");
  symlinkSync(join(main, ".git"), join(symbolic, ".git"));
  assert.equal((await repositoryIdentity(malformed)).id, null);
  assert.match((await repositoryIdentity(malformed)).error!, /^Git metadata/);
  assert.equal((await repositoryIdentity(symbolic)).id, null);
  assert.match((await repositoryIdentity(symbolic)).error!, /^Git metadata/);
  assert.equal((await repositoryIdentity(extraLine)).id, null);
  assert.equal((await repositoryIdentity(emptyCommon)).id, null);
});

test("a directory without Git metadata gets an isolated repository identity", async () => {
  const first = await repositoryIdentity(outside);
  const second = await repositoryIdentity(outside);
  assert.equal(first.error, null);
  assert.equal(first.id, second.id);
});

test("the origin parser keeps only the first url from the origin section", () => hegel.test((tc) => {
  const names = tc.draw(gs.arrays(gs.fromRegex("[a-z]{1,12}").filter((name) => name !== "origin"), { maxSize: 6, unique: true }));
  const origin = tc.draw(gs.fromRegex("https://[a-z]{1,12}\\.example/[a-z]{1,12}\\.git"));
  const config = [
    ...names.map((name) => `[remote "${name}"]\n  url = https://ignored.example/${name}.git`),
    '[REMOTE "origin"]\n  fetch = +refs/heads/*:refs/remotes/origin/*\n  url = ' + origin + '\n  url = https://ignored.example/second.git',
  ].join("\n");
  assert.equal(originFromConfig(config), origin);
}));
