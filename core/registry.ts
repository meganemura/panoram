// The loaders, found from the module list of panoram.config.ts: each
// module's public.ts may export `loader`. This keeps the list of providers
// in one file without that file importing a module, which the build cannot
// do before the generated files exist.
// Boundary: discovery only. loader.ts says what a loader is.
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import config from "../panoram.config.ts";
import type { Loader } from "./loader.ts";

function isLoader(v: unknown): v is Loader {
  return typeof v === "object" && v !== null && typeof (v as Loader).name === "string" && Array.isArray((v as Loader).tables) && Array.isArray((v as Loader).after) && typeof (v as Loader).load === "function";
}

export async function loadLoaders(): Promise<Loader[]> {
  const configDir = dirname(fileURLToPath(new URL("../panoram.config.ts", import.meta.url)));
  const out: Loader[] = [];
  for (const entry of config.modules) {
    const dir = typeof entry === "string" ? entry : entry.dir;
    const mod = (await import(pathToFileURL(resolve(configDir, dir, "public.ts")).href)) as { loader?: unknown };
    if (mod.loader === undefined) continue;
    if (!isLoader(mod.loader)) throw new Error(`${dir}/public.ts exports a loader of the wrong shape`);
    out.push(mod.loader);
  }
  return out;
}
