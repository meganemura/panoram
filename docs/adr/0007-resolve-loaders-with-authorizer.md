# 0007. The core resolves named queries from metadata and ad hoc SQL with an authorizer probe.

Date: 2026-09-10

Status: accepted

## Context

The core must find the providers a statement reads, so that a call runs only those loaders.
Three sources were weighed.
The solarsql 0.1.0 generated file carried parameters, encodings, and JSON columns, and no table list; the build knew the tables through `setAuthorizer` and did not emit them.
A `reads` declaration on each named query would be a second list to keep in step with the SQL, and ad hoc SQL would have none.
A `setAuthorizer` probe at prepare time, on the empty migrated database, reports every table a statement reads in microseconds.
v0 started with the probe for both paths.
solarsql 0.2.0, at spacequery's request, emits `reads` for every statement: the declared tables it reads, sorted, without duplicates.

## Decision

A named query resolves through `query.meta.reads`.
Ad hoc SQL resolves through the authorizer probe, which reports the same set.
Each loader declares the tables it fills, and the core maps each table to its loader.

## Consequences

A query loads only the providers whose tables it reads.
An ad hoc statement has the same provider cost model.
A test compares the `reads` of every catalog query with what the probe reports for its SQL.
A test confirms that every schema table has one declaring loader.
