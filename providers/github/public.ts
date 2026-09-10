// The public surface of the GitHub provider. Other modules use its loader
// and queries without taking ownership of its tables.
// Boundary: exports only.
export { githubQueries, githubCommands } from "./module.ts";
export { githubLoader as loader, githubReviewsLoader as reviewsLoader } from "./loader.ts";
export type { PullRequestsId, ReviewRequestsId } from "./solarsql.generated.ts";
