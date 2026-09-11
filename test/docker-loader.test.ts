// These tests prove the Docker loader reads only Docker CLI output and stores
// repository facts needed by panoram. They never call the real Docker daemon.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate, node } from "solarsql/node";
import { catalog } from "../catalog.ts";
import type { Exec, Loader } from "../core/loader.ts";
import type { Repo } from "../core/repo.ts";
import { runQuery, runSql } from "../core/run.ts";
import { migrations } from "../migrations/index.ts";
import { dockerLoader, dockerIds, parseDockerInspect } from "../providers/docker/loader.ts";
import { dockerCommands } from "../providers/docker/module.ts";
import { fixtureRepo, paths } from "./fixture.ts";

const alphaId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const betaId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const scratchId = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const loaders: Loader[] = [dockerLoader];

const repo: Repo = {
  async rootOf(cwd) {
    if (cwd === paths.alpha || cwd.startsWith(`${paths.alpha}/`)) return paths.alpha;
    if (cwd === paths.beta || cwd.startsWith(`${paths.beta}/`)) return paths.beta;
    return null;
  },
  async originOf() {
    return null;
  },
};

function inspectDocument(): string {
  return JSON.stringify([
    {
      Id: alphaId,
      Name: "/alpha-api-1",
      Created: "2026-09-11T01:02:03.456789Z",
      RestartCount: 2,
      Config: {
        Image: "example/alpha:dev",
        Labels: {
          "com.docker.compose.project": "alpha",
          "com.docker.compose.service": "api",
          "com.docker.compose.project.working_dir": paths.alpha,
          ignored: "not stored",
        },
        Env: ["SECRET_TOKEN=hidden"],
        ExposedPorts: {
          "53/udp": {},
          "80/tcp": {},
          "443/tcp": {},
        },
      },
      State: {
        Status: "running",
        Health: { Status: "healthy" },
        StartedAt: "2026-09-11T01:03:04.100Z",
        FinishedAt: "0001-01-01T00:00:00Z",
        ExitCode: 0,
        OOMKilled: false,
      },
      Mounts: [
        { Type: "bind", Source: `${paths.alpha}/data` },
        { Type: "bind", Source: `${paths.alpha}/other` },
        { Type: "volume", Source: "/var/lib/docker/volumes/alpha" },
      ],
      NetworkSettings: {
        Ports: {
          "80/tcp": [
            { HostIp: "0.0.0.0", HostPort: "8080" },
            { HostIp: "127.0.0.1", HostPort: "18080" },
          ],
          "443/tcp": null,
        },
      },
    },
    {
      Id: betaId,
      Name: "/beta-worker-1",
      Created: "2026-09-10T02:00:00Z",
      RestartCount: 0,
      Config: {
        Image: "example/beta:dev",
        Labels: {},
      },
      State: {
        Status: "exited",
        StartedAt: "0001-01-01T00:00:00Z",
        FinishedAt: "2026-09-10T03:00:00Z",
        ExitCode: 137,
        OOMKilled: true,
      },
      Mounts: [{ Type: "bind", Source: paths.beta }],
      NetworkSettings: {
        Ports: {
          "3000/tcp": [{ HostIp: "", HostPort: "3000" }],
        },
      },
    },
    {
      Id: scratchId,
      Name: "/scratch",
      Created: "2026-09-09T02:00:00Z",
      RestartCount: 0,
      Config: {
        Image: "example/scratch:latest",
        Labels: {},
      },
      State: {
        Status: "created",
        StartedAt: "0001-01-01T00:00:00Z",
        FinishedAt: "0001-01-01T00:00:00Z",
        ExitCode: 0,
        OOMKilled: false,
      },
      Mounts: [],
      NetworkSettings: { Ports: {} },
    },
  ]);
}

function oneContainer(values: {
  id: string;
  name: string;
  state?: string;
  labels?: Record<string, string>;
  mounts?: unknown[];
  ports?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    Id: values.id,
    Name: `/${values.name}`,
    Created: "2026-09-11T01:02:03Z",
    RestartCount: 0,
    Config: {
      Image: `example/${values.name}:dev`,
      Labels: values.labels ?? {},
      ExposedPorts: values.ports ?? {},
    },
    State: {
      Status: values.state ?? "running",
      StartedAt: "2026-09-11T01:03:04Z",
      FinishedAt: "0001-01-01T00:00:00Z",
      ExitCode: 0,
      OOMKilled: false,
    },
    Mounts: values.mounts ?? [],
    NetworkSettings: { Ports: values.ports ?? {} },
  };
}

function dockerExec(calls: string[] = []): Exec {
  return async (command, args) => {
    calls.push(`${command} ${args.join(" ")}`);
    if (command === "docker" && args.join(" ") === "container ls --all --quiet --no-trunc") return `${alphaId}\n${betaId}\n${scratchId}\n`;
    if (command === "docker" && args[0] === "container" && args[1] === "inspect") {
      assert.deepEqual(args.slice(2), [alphaId, betaId, scratchId]);
      return inspectDocument();
    }
    throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
  };
}

test("dockerIds reads one ID per line", () => {
  assert.deepEqual(dockerIds(`  ${alphaId}\n\n${betaId}\r\n`), [alphaId, betaId]);
});

test("dockerIds rejects invalid IDs and deduplicates valid IDs", () => {
  assert.deepEqual(dockerIds(`${alphaId}\n${alphaId}\n${betaId.toUpperCase()}\n`), [alphaId, betaId]);
  assert.throws(() => dockerIds(`${alphaId}\n--format={{json .}}\n`), /docker container ls line 2 must be a full 64-character hexadecimal container id/);
  assert.throws(() => dockerIds(`${alphaId.slice(0, 12)}\n`), /docker container ls line 1 must be a full 64-character hexadecimal container id/);
});

test("Docker load command inserts all three row sets atomically", async () => {
  const raw = new DatabaseSync(":memory:");
  try {
    const db = node(raw);
    migrate(raw, migrations);
    const result = await db.run(dockerCommands.load, {
      containers: [{
        id: alphaId,
        name: "alpha-api-1",
        image: "example/alpha:dev",
        state: "running",
        health: null,
        created_at: Date.parse("2026-09-11T01:02:03Z"),
        started_at: null,
        finished_at: null,
        exit_code: 0,
        oom_killed: 0,
        restart_count: 0,
        compose_project: null,
        compose_service: null,
      }],
      roots: [{ container_id: alphaId, root: paths.alpha }],
      ports: [{ id: `${alphaId}:80/tcp:bad`, container_id: alphaId, container_port: 80, protocol: "tcp", host_ip: null, host_port: "bad" }],
    } as never);

    assert.equal(result.ok, false);
    assert.deepEqual(raw.prepare("select id from containers").all(), []);
    assert.deepEqual(raw.prepare("select container_id, root from container_roots").all(), []);
    assert.deepEqual(raw.prepare("select id from container_ports").all(), []);
  } finally {
    raw.close();
  }
});

test("docker loader records containers, deduped repository roots, and normalized ports", async () => {
  const calls: string[] = [];
  const options = { loaders, exec: dockerExec(calls), repo, env: {}, params: {} };

  const containers = await runQuery(catalog.containers!.query, options);
  assert.deepEqual(calls, [
    `docker container ls --all --quiet --no-trunc`,
    `docker container inspect ${alphaId} ${betaId} ${scratchId}`,
  ]);
  assert.deepEqual(containers.rows, [
    {
      id: alphaId,
      name: "alpha-api-1",
      image: "example/alpha:dev",
      state: "running",
      health: "healthy",
      created_at: Date.parse("2026-09-11T01:02:03.456789Z"),
      started_at: Date.parse("2026-09-11T01:03:04.100Z"),
      finished_at: null,
      exit_code: 0,
      oom_killed: 0,
      restart_count: 2,
      compose_project: "alpha",
      compose_service: "api",
    },
    {
      id: betaId,
      name: "beta-worker-1",
      image: "example/beta:dev",
      state: "exited",
      health: null,
      created_at: Date.parse("2026-09-10T02:00:00Z"),
      started_at: null,
      finished_at: Date.parse("2026-09-10T03:00:00Z"),
      exit_code: 137,
      oom_killed: 1,
      restart_count: 0,
      compose_project: null,
      compose_service: null,
    },
    {
      id: scratchId,
      name: "scratch",
      image: "example/scratch:latest",
      state: "created",
      health: null,
      created_at: Date.parse("2026-09-09T02:00:00Z"),
      started_at: null,
      finished_at: null,
      exit_code: 0,
      oom_killed: 0,
      restart_count: 0,
      compose_project: null,
      compose_service: null,
    },
  ]);

  const roots = await runSql("select container_id, root from container_roots order by container_id, root", options);
  assert.deepEqual(roots.rows, [
    { container_id: alphaId, root: paths.alpha },
    { container_id: betaId, root: paths.beta },
  ]);

  const ports = await runSql("select container_id, container_port, protocol, host_ip, host_port from container_ports order by container_id, container_port, host_port", options);
  assert.deepEqual(ports.rows, [
    { container_id: alphaId, container_port: 53, protocol: "udp", host_ip: null, host_port: null },
    { container_id: alphaId, container_port: 80, protocol: "tcp", host_ip: "0.0.0.0", host_port: 8080 },
    { container_id: alphaId, container_port: 80, protocol: "tcp", host_ip: "127.0.0.1", host_port: 18080 },
    { container_id: alphaId, container_port: 443, protocol: "tcp", host_ip: null, host_port: null },
    { container_id: betaId, container_port: 3000, protocol: "tcp", host_ip: null, host_port: 3000 },
  ]);
});

test("containers-in-dir returns one row per associated container", async () => {
  const result = await runQuery(catalog["containers-in-dir"]!.query, {
    loaders,
    exec: dockerExec(),
    repo,
    env: {},
    params: { root: paths.alpha },
  });

  assert.deepEqual(result.rows.map((row) => row.name), ["alpha-api-1"]);
});

test("container-ports-in-dir orders published ports before exposed-only ports", async () => {
  const result = await runQuery(catalog["container-ports-in-dir"]!.query, {
    loaders,
    exec: dockerExec(),
    repo,
    env: {},
    params: { root: paths.alpha },
  });

  assert.deepEqual(result.rows, [
    { name: "alpha-api-1", state: "running", container_id: alphaId, container_port: 80, protocol: "tcp", host_ip: "0.0.0.0", host_port: 8080 },
    { name: "alpha-api-1", state: "running", container_id: alphaId, container_port: 80, protocol: "tcp", host_ip: "127.0.0.1", host_port: 18080 },
    { name: "alpha-api-1", state: "running", container_id: alphaId, container_port: 53, protocol: "udp", host_ip: null, host_port: null },
    { name: "alpha-api-1", state: "running", container_id: alphaId, container_port: 443, protocol: "tcp", host_ip: null, host_port: null },
  ]);
});

test("container-ports-in-dir orders running containers first within each publication group", async () => {
  const document = JSON.stringify([
    oneContainer({
      id: betaId,
      name: "stopped-api",
      state: "exited",
      labels: { "com.docker.compose.project.working_dir": paths.alpha },
      ports: { "80/tcp": [{ HostIp: "127.0.0.1", HostPort: "8080" }] },
    }),
    oneContainer({
      id: alphaId,
      name: "running-api",
      labels: { "com.docker.compose.project.working_dir": paths.alpha },
      ports: { "80/tcp": [{ HostIp: "127.0.0.1", HostPort: "8080" }] },
    }),
    oneContainer({
      id: scratchId,
      name: "config-only",
      labels: { "com.docker.compose.project.working_dir": paths.alpha },
      ports: { "81/tcp": null },
    }),
  ]);
  const result = await runQuery(catalog["container-ports-in-dir"]!.query, {
    loaders,
    exec: async (command, args) => {
      if (command === "docker" && args.join(" ") === "container ls --all --quiet --no-trunc") return `${betaId}\n${alphaId}\n${scratchId}\n`;
      if (command === "docker" && args.join(" ") === `container inspect ${betaId} ${alphaId} ${scratchId}`) return document;
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    },
    repo,
    env: {},
    params: { root: paths.alpha },
  });

  assert.deepEqual(result.rows.map((row) => [row.name, row.state, row.host_port]), [
    ["running-api", "running", 8080],
    ["stopped-api", "exited", 8080],
    ["config-only", "running", null],
  ]);
});

test("repository association uses Compose working-dir labels without bind mounts", async () => {
  const result = await parseDockerInspect(JSON.stringify([oneContainer({
    id: alphaId,
    name: "compose-only",
    labels: { "com.docker.compose.project.working_dir": `${paths.alpha}/deploy` },
  })]), { repo });

  assert.deepEqual(result.roots, [{ container_id: alphaId, root: paths.alpha }]);
});

test("repository association keeps two distinct roots from bind mounts", async () => {
  const result = await parseDockerInspect(JSON.stringify([oneContainer({
    id: alphaId,
    name: "two-roots",
    mounts: [
      { Type: "bind", Source: `${paths.alpha}/src` },
      { Type: "bind", Source: `${paths.beta}/src` },
    ],
  })]), { repo });

  assert.deepEqual(result.roots, [
    { container_id: alphaId, root: paths.alpha },
    { container_id: alphaId, root: paths.beta },
  ]);
});

test("repository association deduplicates repeated hints for one root", async () => {
  const result = await parseDockerInspect(JSON.stringify([oneContainer({
    id: alphaId,
    name: "dedupe-root",
    labels: { "com.docker.compose.project.working_dir": `${paths.alpha}/deploy` },
    mounts: [
      { Type: "bind", Source: `${paths.alpha}/src` },
      { Type: "bind", Source: `${paths.alpha}/tmp` },
    ],
  })]), { repo });

  assert.deepEqual(result.roots, [{ container_id: alphaId, root: paths.alpha }]);
});

test("a no-container Docker answer does not inspect", async () => {
  const calls: string[] = [];
  const result = await runQuery(catalog.containers!.query, {
    loaders,
    exec: async (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (command === "docker" && args.join(" ") === "container ls --all --quiet --no-trunc") return "\n";
      throw new Error("inspect must not run");
    },
    repo: fixtureRepo,
    env: {},
    params: {},
  });

  assert.deepEqual(result.rows, []);
  assert.deepEqual(calls, ["docker container ls --all --quiet --no-trunc"]);
  assert.deepEqual(result.providers.map(({ name, ok, error }) => ({ name, ok, error })), [{ name: "docker", ok: 1, error: null }]);
});

test("malformed inspect JSON leaves docker tables empty through provider failure", async () => {
  const result = await runQuery(catalog.containers!.query, {
    loaders,
    exec: async (command, args) => {
      if (command === "docker" && args.join(" ") === "container ls --all --quiet --no-trunc") return `${alphaId}\n`;
      if (command === "docker" && args.join(" ") === `container inspect ${alphaId}`) return `[{"Id":`;
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    },
    repo: fixtureRepo,
    env: {},
    params: {},
  });

  assert.deepEqual(result.rows, []);
  assert.equal(result.providers[0]?.name, "docker");
  assert.equal(result.providers[0]?.ok, 0);
  assert.match(result.providers[0]?.error ?? "", /docker inspect JSON is invalid/);
});

test("a partially malformed inspect document writes no Docker rows", async () => {
  const result = await runQuery(catalog.containers!.query, {
    loaders,
    exec: async (command, args) => {
      if (command === "docker" && args.join(" ") === "container ls --all --quiet --no-trunc") return `${alphaId}\n${betaId}\n`;
      if (command === "docker" && args.join(" ") === `container inspect ${alphaId} ${betaId}`) return JSON.stringify([JSON.parse(inspectDocument())[0], { Id: betaId }]);
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    },
    repo,
    env: {},
    params: {},
  });

  assert.deepEqual(result.rows, []);
  assert.equal(result.providers[0]?.name, "docker");
  assert.equal(result.providers[0]?.ok, 0);
  assert.match(result.providers[0]?.error ?? "", /Config must be an object/);
});

test("invalid inspect IDs leave Docker tables empty through provider failure", async () => {
  const result = await runQuery(catalog.containers!.query, {
    loaders,
    exec: async (command, args) => {
      if (command === "docker" && args.join(" ") === "container ls --all --quiet --no-trunc") return `${alphaId}\n`;
      if (command === "docker" && args.join(" ") === `container inspect ${alphaId}`) return JSON.stringify([oneContainer({ id: alphaId.slice(0, 12), name: "bad-id" })]);
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    },
    repo,
    env: {},
    params: {},
  });

  assert.deepEqual(result.rows, []);
  assert.equal(result.providers[0]?.name, "docker");
  assert.equal(result.providers[0]?.ok, 0);
  assert.match(result.providers[0]?.error ?? "", /container 0.Id must be a full 64-character hexadecimal container id/);
});

test("duplicate inspect IDs leave Docker tables empty through provider failure", async () => {
  const result = await runQuery(catalog.containers!.query, {
    loaders,
    exec: async (command, args) => {
      if (command === "docker" && args.join(" ") === "container ls --all --quiet --no-trunc") return `${alphaId}\n${betaId}\n`;
      if (command === "docker" && args.join(" ") === `container inspect ${alphaId} ${betaId}`) return JSON.stringify([
        oneContainer({ id: alphaId, name: "first" }),
        oneContainer({ id: alphaId.toUpperCase(), name: "duplicate" }),
      ]);
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    },
    repo,
    env: {},
    params: {},
  });

  assert.deepEqual(result.rows, []);
  assert.equal(result.providers[0]?.name, "docker");
  assert.equal(result.providers[0]?.ok, 0);
  assert.match(result.providers[0]?.error ?? "", /docker inspect returned duplicate container id/);
});

test("Docker CLI failure is a failed provider, not absence", async () => {
  const result = await runQuery(catalog.containers!.query, {
    loaders,
    exec: async () => {
      throw new Error("Cannot connect to the Docker daemon");
    },
    repo: fixtureRepo,
    env: {},
    params: {},
  });

  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.providers.map(({ name, ok, error }) => ({ name, ok, error })), [
    { name: "docker", ok: 0, error: "Cannot connect to the Docker daemon" },
  ]);
});
