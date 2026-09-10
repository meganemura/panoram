// The one list of providers: a provider is in `modules` for its tables and
// in `loaders` for its code. The build can import this file because solarsql
// writes the generated stubs before it imports anything.
// Independent loaders run in the order of `loaders`. repos sits before herdr
// because `ghq list` is slow right after git ran in many repositories
// (ADR 0008).
// Boundary: the list only. A provider's tables and code live in its module.
import { config } from "solarsql";
import type { Loader } from "./core/loader.ts";
import { loader as repoLoader } from "./providers/repos/public.ts";
import { loader as herdrLoader } from "./providers/herdr/public.ts";
import { loader as gitLoader } from "./providers/git/public.ts";

export const loaders: readonly Loader[] = [repoLoader, herdrLoader, gitLoader];

export default config({
  modules: ["./core/providers", "./providers/repos", "./providers/herdr", "./providers/git", { dir: "./providers/report", readsAll: true }],
  migrations: "./migrations",
});
