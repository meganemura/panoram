# Design records

This directory records architecture decisions for panoram.
Each ADR describes one decision and its consequences.

| ADR | Decision |
| --- | --- |
| [0001](adr/0001-name-panoram.md) | The tool is named panoram. |
| [0002](adr/0002-fresh-database-per-call.md) | Each call uses a fresh in-memory database. |
| [0003](adr/0003-repository-root-join-key.md) | The repository root joins provider data. |
| [0004](adr/0004-one-module-per-provider.md) | Each provider uses one solarsql module. |
| [0005](adr/0005-read-only-tool.md) | panoram reads provider state. |
| [0006](adr/0006-codegraph-outside-v0.md) | CodeGraph is not a provider in v0. |
| [0007](adr/0007-resolve-loaders-with-authorizer.md) | The core resolves the loaders a statement needs with an authorizer probe. |
| [0008](adr/0008-loader-order.md) | Loaders run by dependency and configuration order. |
| [0009](adr/0009-provider-freshness-envelope.md) | The envelope carries provider freshness. |
| [0010](adr/0010-ad-hoc-sql-for-people.md) | Ad hoc SQL is for a person at a shell. |
| [0011](adr/0011-single-regenerated-migration.md) | The schema uses one regenerated migration. |
