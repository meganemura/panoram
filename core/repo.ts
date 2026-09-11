// Reads the small Git facts that providers share. It avoids child processes
// because many concurrent Git launches delay the next large executable.
// Boundary: Git discovery files only; it does not interpret Git config beyond
// worktree metadata and the origin remote URL.
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

export type Repo = {
  rootOf(cwd: string): Promise<string | null>;
  originOf(root: string): Promise<string | null>;
  repositoryIdOf?(root: string): Promise<{ id: string | null; error: string | null }>;
};

const METADATA_BYTES = 4096;

function opaqueId(kind: "git" | "root", path: string): string {
  return createHash("sha256").update(`${kind}\0${path}`).digest("hex");
}

async function metadataFile(path: string, optional = false): Promise<string | null> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | constants.O_NONBLOCK);
  } catch (error) {
    if (optional && (error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("Git metadata is unreadable.");
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > METADATA_BYTES) throw new Error("Git metadata is invalid.");
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const chunk = Buffer.alloc(Math.min(1024, METADATA_BYTES + 1 - total));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > METADATA_BYTES) throw new Error("Git metadata is invalid.");
      chunks.push(chunk.subarray(0, bytesRead));
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    throw new Error("Git metadata is invalid.");
  } finally {
    await handle.close();
  }
}

async function validatedDirectory(path: string): Promise<string> {
  try {
    if (!(await lstat(path)).isDirectory()) throw new Error();
    return await realpath(path);
  } catch {
    throw new Error("Git metadata refers to an invalid directory.");
  }
}

export async function repositoryIdentity(root: string): Promise<{ id: string | null; error: string | null }> {
  let entry;
  try {
    entry = await lstat(join(root, ".git"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { id: opaqueId("root", resolve(root)), error: null };
    return { id: null, error: "Git metadata is unreadable." };
  }
  try {
    if (entry.isDirectory()) return { id: opaqueId("git", await validatedDirectory(join(root, ".git"))), error: null };
    if (!entry.isFile()) throw new Error("Git metadata has an invalid type.");
    const pointer = await metadataFile(join(root, ".git"));
    const match = /^gitdir:[ \t]*([^\0\r\n]+?)[ \t]*(?:\r?\n)?$/i.exec(pointer ?? "");
    if (match === null) throw new Error("Git metadata has an invalid format.");
    const directory = await validatedDirectory(isAbsolute(match[1]!) ? match[1]! : resolve(root, match[1]!));
    const commonText = await metadataFile(join(directory, "commondir"), true);
    let common = directory;
    if (commonText !== null) {
      const commonMatch = /^([^\0\r\n]+?)[ \t]*(?:\r?\n)?$/.exec(commonText);
      if (commonMatch === null || commonMatch[1]!.trim() === "") throw new Error("Git metadata has an invalid format.");
      const commonPath = commonMatch[1]!.trim();
      common = await validatedDirectory(isAbsolute(commonPath) ? commonPath : resolve(directory, commonPath));
    }
    return { id: opaqueId("git", common), error: null };
  } catch (error) {
    return { id: null, error: (error as Error).message.startsWith("Git metadata") ? (error as Error).message : "Git metadata is invalid." };
  }
}

async function gitEntry(root: string): Promise<"directory" | "file" | null> {
  try {
    const entry = await lstat(join(root, ".git"));
    return entry.isDirectory() ? "directory" : entry.isFile() ? "file" : null;
  } catch {
    return null;
  }
}

async function gitdir(root: string): Promise<string | null> {
  try {
    const match = /^gitdir:[ \t]*(.+?)[ \t]*$/im.exec(await readFile(join(root, ".git"), "utf8"));
    if (match === null) return null;
    const path = match[1]!;
    return isAbsolute(path) ? path : resolve(root, path);
  } catch {
    return null;
  }
}

export function originFromConfig(config: string): string | null {
  let origin = false;
  for (const line of config.split(/\r?\n/)) {
    const section = /^\s*\[\s*remote\s+"origin"\s*\]\s*$/i.test(line);
    if (section) {
      origin = true;
      continue;
    }
    if (/^\s*\[.*\]\s*$/.test(line)) {
      origin = false;
      continue;
    }
    if (!origin) continue;
    const url = /^\s*url\s*=\s*(.*?)\s*$/i.exec(line);
    if (url !== null) return url[1]!;
  }
  return null;
}

async function configOf(root: string): Promise<string | null> {
  const entry = await gitEntry(root);
  if (entry === "directory") return join(root, ".git", "config");
  if (entry !== "file") return null;
  const directory = await gitdir(root);
  if (directory === null) return null;
  try {
    const common = (await readFile(join(directory, "commondir"), "utf8")).trim();
    if (common !== "") return join(isAbsolute(common) ? common : resolve(directory, common), "config");
  } catch {
    // A standalone gitdir stores its config beside the worktree metadata.
  }
  return join(directory, "config");
}

export const fsRepo: Repo = {
  async rootOf(cwd) {
    let directory = cwd;
    for (;;) {
      if (await gitEntry(directory) !== null) return directory;
      const parent = dirname(directory);
      if (parent === directory) return null;
      directory = parent;
    }
  },
  async originOf(root) {
    const config = await configOf(root);
    if (config === null) return null;
    try {
      return originFromConfig(await readFile(config, "utf8"));
    } catch {
      return null;
    }
  },
  repositoryIdOf: repositoryIdentity,
};
