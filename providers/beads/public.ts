// The public surface of the beads provider.
// Boundary: exports only.
export { beadsQueries, beadsCommands } from "./module.ts";
export { beadsLoader as loader } from "./loader.ts";
export type { IssuesId } from "./solarsql.generated.ts";
