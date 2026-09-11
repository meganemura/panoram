# 0026. Docker is observed through the CLI.

Date: 2026-09-11

Status: accepted

## Context

Agents need to see containers and Docker-published ports that belong to the
repository before they start work.
Host process and port tools can miss the repository identity of work that runs
inside Docker Desktop or Colima.
They can also miss which container owns a published port.

Docker already ships a CLI that exposes the active context.
Using the CLI avoids a Docker SDK dependency and keeps panoram aligned with the
context the developer selected.

## Decision

panoram observes Docker with at most two CLI calls per provider load.
It first runs `docker container ls --all --quiet --no-trunc`.
If that returns no container IDs, the provider succeeds with empty Docker
tables and does not run inspect.
If it returns IDs, panoram runs one `docker container inspect` for all IDs.

The provider stores container rows, repository-root associations, and normalized
port rows.
Bind mounts give candidate host paths from `Mounts[].Source` when
`Mounts[].Type` is `bind`.
The Compose label `com.docker.compose.project.working_dir` is also a candidate
host path when it exists.
That label is an observed Compose implementation detail, so panoram treats it
as a hint.
Each candidate passes through the shared repository root resolver.

`container_ports` has one row for each exposed container port and host binding.
An exposed port with no host binding stays present with null host fields.
Multiple host bindings become multiple rows.

A Docker CLI error or malformed inspect JSON is a provider failure.
It leaves the Docker tables empty and records a failed `providers` row.
Empty Docker rows beside a failed provider mean unknown, not no containers.

The provider stores no environment variables, raw labels, full inspect
documents, secrets, or unrelated Docker fields.
It keeps only the Compose project and service labels because they identify the
container in a way users expect.

## Consequences

The Docker provider reads the current Docker CLI context and never writes to
Docker.
It adds one large binary launch before process bursts in the loader order.
Repository association works for bind mounts and common Compose projects, and a
container with no repository association still appears in `containers`.
The normalized port table can show both Docker-published ports and exposed but
unpublished container ports.
