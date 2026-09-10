// Reads the small Git facts that providers share. It avoids child processes
// because many concurrent Git launches delay the next large executable.
// Boundary: Git discovery files only; it does not interpret Git config beyond
// worktree metadata and the origin remote URL.
import { lstat, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

export type Repo = {
  rootOf(cwd: string): Promise<string | null>;
  originOf(root: string): Promise<string | null>;
};

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
};
