# 0008. Loaders run in dependency order, then configuration order.

Date: 2026-09-10

Status: accepted

## Context

The git loader needs the roots to run on.
Under the default scope they are the roots with an agent, from the agents table; under `--scope all` the ghq repositories join them.
It reads both through the owners' `public.ts`, so it runs after herdr and after repos.

Independent loaders need an order too, and the order changes the time a call takes.
Measured on 2026-09-10: `ghq list -p` alone takes 50 to 130 ms.
Run right after 18 `git rev-parse` calls in different repositories it takes 1,500 to 1,700 ms, and after one such call 210 ms.
The next call is fast again.
The cause was not identified.

## Decision

A loader runs after the loaders its `after` names.
Independent loaders keep the order of the module list in `panoram.config.ts`, and that list places repos before herdr.
The per-root git calls run concurrently.

## Consequences

A default-scope call spends about 0.8 s in the loaders: repos 240 ms, herdr 240 ms, git 280 ms.
The same call with herdr before repos spent 2.2 s.
Under `--scope all` git takes 1.4 s for 66 repositories.
A change to the module list changes the order independent loaders run in.
