// Fills containers, their repository roots, and their exposed ports from the
// Docker CLI. The loader keeps only fields that answer repository context
// questions; raw inspect documents, labels, and environment are discarded.
// Boundary: this provider's tables only.
import type { LoadContext, Loader } from "../../core/loader.ts";
import { dockerCommands } from "./module.ts";
import type { ContainerPortsId, ContainersId } from "./solarsql.generated.ts";

const composeProjectLabel = "com.docker.compose.project";
const composeServiceLabel = "com.docker.compose.service";
const composeWorkingDirLabel = "com.docker.compose.project.working_dir";

type ContainerRow = {
  id: ContainersId;
  name: string;
  image: string;
  state: string;
  health: string | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  exit_code: number;
  oom_killed: number;
  restart_count: number;
  compose_project: string | null;
  compose_service: string | null;
};

type ContainerRootRow = { container_id: ContainersId; root: string };

type ContainerPortRow = {
  id: ContainerPortsId;
  container_id: ContainersId;
  container_port: number;
  protocol: string;
  host_ip: string | null;
  host_port: number | null;
};

type ParsedContainer = {
  container: ContainerRow;
  ports: ContainerPortRow[];
  candidates: string[];
};

type LoadedDocker = {
  containers: ContainerRow[];
  roots: ContainerRootRow[];
  ports: ContainerPortRow[];
};

export function dockerIds(output: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of output.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (line === "") continue;
    const id = containerId(line, `docker container ls line ${index + 1}`);
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export async function parseDockerInspect(output: string, ctx: Pick<LoadContext, "repo">): Promise<LoadedDocker> {
  let document: unknown;
  try {
    document = JSON.parse(output);
  } catch (e) {
    throw new Error(`docker inspect JSON is invalid: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!Array.isArray(document)) throw new Error("docker inspect JSON must be an array");

  const parsed = document.map((value, index) => parseContainer(value, index));
  const seen = new Set<ContainersId>();
  for (const item of parsed) {
    if (seen.has(item.container.id)) throw new Error(`docker inspect returned duplicate container id: ${item.container.id}`);
    seen.add(item.container.id);
  }
  const roots: ContainerRootRow[] = [];
  for (const item of parsed) {
    const seen = new Set<string>();
    for (const candidate of item.candidates) {
      const root = await ctx.repo.rootOf(candidate);
      if (root === null || seen.has(root)) continue;
      seen.add(root);
      roots.push({ container_id: item.container.id, root });
    }
  }
  return {
    containers: parsed.map((item) => item.container),
    roots,
    ports: parsed.flatMap((item) => item.ports),
  };
}

function parseContainer(value: unknown, index: number): ParsedContainer {
  const object = record(value, `container ${index}`);
  const id = containerId(requiredString(object, "Id", `container ${index}`), `container ${index}.Id`) as ContainersId;
  const config = record(object.Config, `container ${id} Config`);
  const state = record(object.State, `container ${id} State`);
  const labels = optionalStringRecord(config.Labels, `container ${id} Config.Labels`);
  const network = optionalRecord(object.NetworkSettings, `container ${id} NetworkSettings`);
  const mounts = optionalArray(object.Mounts, `container ${id} Mounts`);
  const name = requiredString(object, "Name", `container ${id}`).replace(/^\//, "");

  return {
    container: {
      id,
      name,
      image: requiredString(config, "Image", `container ${id} Config`),
      state: requiredString(state, "Status", `container ${id} State`),
      health: optionalNestedStatus(state.Health, `container ${id} State.Health`),
      created_at: timestamp(requiredString(object, "Created", `container ${id}`), `container ${id} Created`, false)!,
      started_at: timestamp(requiredString(state, "StartedAt", `container ${id} State`), `container ${id} State.StartedAt`, true),
      finished_at: timestamp(requiredString(state, "FinishedAt", `container ${id} State`), `container ${id} State.FinishedAt`, true),
      exit_code: requiredInteger(state, "ExitCode", `container ${id} State`),
      oom_killed: requiredBoolean(state, "OOMKilled", `container ${id} State`) ? 1 : 0,
      restart_count: requiredInteger(object, "RestartCount", `container ${id}`),
      compose_project: labels[composeProjectLabel] ?? null,
      compose_service: labels[composeServiceLabel] ?? null,
    },
    candidates: candidatePaths(mounts, labels),
    ports: portRows(id, config.ExposedPorts, network?.Ports),
  };
}

function containerId(value: string, path: string): string {
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error(`${path} must be a full 64-character hexadecimal container id`);
  return value.toLowerCase();
}

function candidatePaths(mounts: readonly unknown[], labels: Readonly<Record<string, string>>): string[] {
  const candidates: string[] = [];
  for (const [index, mount] of mounts.entries()) {
    const value = record(mount, `Mounts[${index}]`);
    if (value.Type === "bind" && typeof value.Source === "string" && value.Source !== "") candidates.push(value.Source);
  }
  const workingDir = labels[composeWorkingDirLabel];
  if (workingDir !== undefined && workingDir !== "") candidates.push(workingDir);
  return candidates;
}

function portRows(containerId: ContainersId, exposedPorts: unknown, networkPorts: unknown): ContainerPortRow[] {
  const keys = new Set<string>();
  addPortKeys(keys, exposedPorts, "Config.ExposedPorts");
  addPortKeys(keys, networkPorts, "NetworkSettings.Ports");
  const rows: ContainerPortRow[] = [];
  for (const key of [...keys].sort(comparePortKeys)) {
    const port = parsePortKey(key);
    const bindings = bindingsFor(networkPorts, key);
    if (bindings.length === 0) {
      rows.push({
        id: `${containerId}:${port.container_port}/${port.protocol}:` as ContainerPortsId,
        container_id: containerId,
        container_port: port.container_port,
        protocol: port.protocol,
        host_ip: null,
        host_port: null,
      });
      continue;
    }
    bindings.forEach((binding, index) => {
      rows.push({
        id: `${containerId}:${port.container_port}/${port.protocol}:${binding.host_ip ?? ""}:${binding.host_port ?? ""}:${index}` as ContainerPortsId,
        container_id: containerId,
        container_port: port.container_port,
        protocol: port.protocol,
        host_ip: binding.host_ip,
        host_port: binding.host_port,
      });
    });
  }
  return rows;
}

function addPortKeys(keys: Set<string>, value: unknown, path: string): void {
  if (value === null || value === undefined) return;
  const ports = record(value, path);
  for (const key of Object.keys(ports)) {
    parsePortKey(key);
    keys.add(key);
  }
}

function bindingsFor(networkPorts: unknown, key: string): { host_ip: string | null; host_port: number | null }[] {
  if (networkPorts === null || networkPorts === undefined) return [];
  const ports = record(networkPorts, "NetworkSettings.Ports");
  const value = ports[key];
  if (value === null || value === undefined) return [];
  const bindings = optionalArray(value, `NetworkSettings.Ports.${key}`);
  return bindings.map((binding, index) => {
    const row = record(binding, `NetworkSettings.Ports.${key}[${index}]`);
    const hostPortText = requiredString(row, "HostPort", `NetworkSettings.Ports.${key}[${index}]`);
    const hostPort = Number(hostPortText);
    if (!Number.isSafeInteger(hostPort) || hostPort < 0) throw new Error(`NetworkSettings.Ports.${key}[${index}].HostPort must be an integer`);
    return {
      host_ip: optionalString(row.HostIp, `NetworkSettings.Ports.${key}[${index}].HostIp`),
      host_port: hostPort,
    };
  }).sort((left, right) => (left.host_port ?? -1) - (right.host_port ?? -1) || (left.host_ip ?? "").localeCompare(right.host_ip ?? ""));
}

function parsePortKey(key: string): { container_port: number; protocol: string } {
  const match = /^([0-9]+)\/([A-Za-z0-9_-]+)$/.exec(key);
  if (match === null) throw new Error(`docker port key is invalid: ${key}`);
  const container_port = Number(match[1]);
  if (!Number.isSafeInteger(container_port) || container_port < 0) throw new Error(`docker port is invalid: ${key}`);
  return { container_port, protocol: match[2]!.toLowerCase() };
}

function comparePortKeys(left: string, right: string): number {
  const a = parsePortKey(left);
  const b = parsePortKey(right);
  return a.container_port - b.container_port || a.protocol.localeCompare(b.protocol);
}

function timestamp(value: string, path: string, zeroIsNull: boolean): number | null {
  if (zeroIsNull && /^0{4}-|^0001-01-01T00:00:00/.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isSafeInteger(ms)) throw new Error(`${path} must be a timestamp`);
  return ms;
}

function optionalNestedStatus(value: unknown, path: string): string | null {
  if (value === null || value === undefined) return null;
  return requiredString(record(value, path), "Status", path);
}

function optionalStringRecord(value: unknown, path: string): Record<string, string> {
  if (value === null || value === undefined) return {};
  const row = record(value, path);
  for (const [key, field] of Object.entries(row)) if (typeof field !== "string") throw new Error(`${path}.${key} must be a string`);
  return row as Record<string, string>;
}

function optionalArray(value: unknown, path: string): unknown[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}

function optionalRecord(value: unknown, path: string): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  return record(value, path);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function requiredString(value: Record<string, unknown>, key: string, path: string): string {
  const field = value[key];
  if (typeof field !== "string" || field === "") throw new Error(`${path}.${key} must be a string`);
  return field;
}

function optionalString(value: unknown, path: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error(`${path} must be a string`);
  return value;
}

function requiredInteger(value: Record<string, unknown>, key: string, path: string): number {
  const field = value[key];
  if (typeof field !== "number" || !Number.isSafeInteger(field)) throw new Error(`${path}.${key} must be an integer`);
  return field;
}

function requiredBoolean(value: Record<string, unknown>, key: string, path: string): boolean {
  const field = value[key];
  if (typeof field !== "boolean") throw new Error(`${path}.${key} must be a boolean`);
  return field;
}

export const dockerLoader: Loader = {
  name: "docker",
  tables: ["containers", "container_roots", "container_ports"],
  after: [],
  async load(ctx) {
    const ids = dockerIds(await ctx.exec("docker", ["container", "ls", "--all", "--quiet", "--no-trunc"]));
    if (ids.length === 0) return;
    const loaded = await parseDockerInspect(await ctx.exec("docker", ["container", "inspect", ...ids]), ctx);
    const stored = await ctx.db.run(dockerCommands.load, { containers: loaded.containers, roots: loaded.roots, ports: loaded.ports });
    if (!stored.ok) throw new Error(`docker: ${stored.kind}`);
  },
};
