# 0007. The core resolves the loaders a statement needs with an authorizer probe.

Date: 2026-09-10

Status: accepted

## Context

The core must find the providers a statement reads, so that a call runs only those loaders.
Three sources were weighed.
The solarsql generated file carries parameters, encodings, and JSON columns, and no table list; the build knows the tables through `setAuthorizer` and does not emit them.
A `reads` declaration on each named query would be a second list to keep in step with the SQL, and ad hoc SQL would have none.
A `setAuthorizer` probe at prepare time, on the empty migrated database, reports every table a statement reads in microseconds.

## Decision

The core sets an authorizer while it prepares the statement on the migrated empty database, and collects the tables it reads.
Each loader declares the tables it fills, and the core maps each table to its loader.
Named queries and ad hoc SQL resolve the same way.

## Consequences

A query loads only the providers whose tables it reads.
An ad hoc statement has the same provider cost model.
A test confirms that every schema table has one declaring loader.
