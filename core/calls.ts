// The call log ranks query names for help. Boundary: it stores no query input
// or result, and query execution does not read it.
import { appendFileSync, closeSync, mkdirSync, openSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const tailBytes = 1024 * 1024;

export function callsPath(env: Readonly<Record<string, string | undefined>>): string {
  const stateHome = env["XDG_STATE_HOME"] || join(env["HOME"] || homedir(), ".local", "state");
  return join(stateHome, "spacequery", "calls.jsonl");
}

export function recordCall(env: Readonly<Record<string, string | undefined>>, name: string): void {
  const path = callsPath(env);
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify({ name, at: Date.now() })}\n`);
  } catch {
    // A history hint must not prevent a query from returning its observation.
  }
}

export function callCounts(env: Readonly<Record<string, string | undefined>>): Map<string, number> {
  const path = callsPath(env);
  let fd: number | undefined;
  try {
    const size = statSync(path).size;
    const start = Math.max(0, size - tailBytes);
    const buffer = Buffer.alloc(size - start);
    fd = openSync(path, "r");
    readSync(fd, buffer, 0, buffer.length, start);
    let text = buffer.toString("utf8");
    if (start > 0) {
      const firstLineEnd = text.indexOf("\n");
      text = firstLineEnd === -1 ? "" : text.slice(firstLineEnd + 1);
    }
    const counts = new Map<string, number>();
    for (const line of text.split("\n")) {
      try {
        const entry: unknown = JSON.parse(line);
        if (typeof entry === "object" && entry !== null && typeof (entry as { name?: unknown }).name === "string") {
          const name = (entry as { name: string }).name;
          counts.set(name, (counts.get(name) ?? 0) + 1);
        }
      } catch {
        // A partial or hand-edited line does not change the useful history.
      }
    }
    return counts;
  } catch {
    return new Map();
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
