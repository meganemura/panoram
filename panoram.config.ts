// The one list of providers. solarsql reads the modules for the tables they
// own; the core imports each module's public.ts and takes its `loader`
// export, when it has one. A module that owns tables and exports no loader
// is filled by the core itself (core/providers).
// The order is the order independent loaders run in (see core/resolve.ts).
// This file imports no module: the build imports it before the generated
// files exist, and a module imports its generated file.
import { config } from "solarsql";

export default config({
  modules: ["./core/providers", "./providers/repos", "./providers/herdr", "./providers/git", { dir: "./providers/report", readsAll: true }],
  migrations: "./migrations",
});
