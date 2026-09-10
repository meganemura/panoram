// Provider: headsign. It describes the current repository workflow state.
// Boundary: this table, its loading command, and single-provider queries.
import { commands, queries, table } from "solarsql";
import { generated } from "./solarsql.generated.ts";

export const workflowRuns = table(`
  create table workflow_runs (
    root text primary key not null,
    workflow text not null,
    workflow_path text,
    status text not null,
    phase text,
    total_iterations integer not null default 0,
    attempts text,
    last_failure text,
    end_reason text,
    stop_nudges integer not null default 0,
    driver_agent text,
    phase_entered_at integer
  ) strict
`);

export const headsignQueries = queries(generated, {
  all: `select root, workflow, workflow_path, status, phase, total_iterations, attempts, last_failure, end_reason, stop_nudges, driver_agent, phase_entered_at
    from workflow_runs order by status, root`,
  inDir: `select root, workflow, workflow_path, status, phase, total_iterations, attempts, last_failure, end_reason, stop_nudges, driver_agent, phase_entered_at
    from workflow_runs where root = :root`,
});

export const headsignCommands = commands(generated, {
  loadRuns: { plan: [`insert or replace into workflow_runs (root, workflow, workflow_path, status, phase, total_iterations, attempts, last_failure, end_reason, stop_nudges, driver_agent, phase_entered_at)
    select value ->> 'root', value ->> 'workflow', value ->> 'workflow_path', value ->> 'status', value ->> 'phase', value ->> 'total_iterations', value ->> 'attempts', value ->> 'last_failure', value ->> 'end_reason', value ->> 'stop_nudges', value ->> 'driver_agent', value ->> 'phase_entered_at'
    from json_each(:rows)`] },
});
