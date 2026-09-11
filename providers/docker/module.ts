// Provider: docker. It observes containers and exposed container ports through
// the Docker CLI, then maps bind-mounted host paths to repositories.
// Boundary: these tables, their loading commands, and single-provider queries.
import { commands, queries, table } from "solarsql";
import { generated } from "./solarsql.generated.ts";

export const containers = table(`
  create table containers (
    id text primary key not null,
    name text not null,
    image text not null,
    state text not null,
    health text,
    created_at integer not null,
    started_at integer,
    finished_at integer,
    exit_code integer not null,
    oom_killed integer not null default 0,
    restart_count integer not null default 0,
    compose_project text,
    compose_service text
  ) strict
`);

export const container_roots = table(`
  create table container_roots (
    container_id text not null references containers(id),
    root text not null,
    primary key (container_id, root)
  ) strict
`);

export const container_ports = table(`
  create table container_ports (
    id text primary key not null,
    container_id text not null references containers(id),
    container_port integer not null,
    protocol text not null,
    host_ip text,
    host_port integer
  ) strict
`);

export const dockerQueries = queries(generated, {
  all: `
    select id, name, image, state, health, created_at, started_at, finished_at, exit_code, oom_killed, restart_count, compose_project, compose_service
    from containers
    order by case when state = 'running' then 0 else 1 end, name`,
  inDir: `
    select c.id, c.name, c.image, c.state, c.health, c.created_at, c.started_at, c.finished_at, c.exit_code, c.oom_killed, c.restart_count, c.compose_project, c.compose_service
    from containers c join container_roots r on r.container_id = c.id
    where r.root = :root
    order by case when c.state = 'running' then 0 else 1 end, c.name`,
  portsInDir: `
    select c.name, c.state, p.container_id, p.container_port, p.protocol, p.host_ip, p.host_port
    from container_ports p
    join containers c on c.id = p.container_id
    join container_roots r on r.container_id = c.id
    where r.root = :root
    order by p.host_port is null, p.host_port, case when c.state = 'running' then 0 else 1 end, p.container_port, p.protocol, c.name`,
});

export const dockerCommands = commands(generated, {
  load: {
    plan: [
      `insert or ignore into containers (id, name, image, state, health, created_at, started_at, finished_at, exit_code, oom_killed, restart_count, compose_project, compose_service)
       select value ->> 'id', value ->> 'name', value ->> 'image', value ->> 'state', value ->> 'health',
              value ->> 'created_at', value ->> 'started_at', value ->> 'finished_at', value ->> 'exit_code',
              value ->> 'oom_killed', value ->> 'restart_count', value ->> 'compose_project', value ->> 'compose_service'
       from json_each(:containers)`,
      `insert or ignore into container_roots (container_id, root)
       select value ->> 'container_id', value ->> 'root' from json_each(:roots)`,
      `insert or ignore into container_ports (id, container_id, container_port, protocol, host_ip, host_port)
       select value ->> 'id', value ->> 'container_id', value ->> 'container_port', value ->> 'protocol', value ->> 'host_ip', value ->> 'host_port'
       from json_each(:ports)`,
    ],
  },
});
