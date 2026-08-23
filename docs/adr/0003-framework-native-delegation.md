# 0003 — Delegate to official framework scaffolders

## Status

Accepted.

## Context

Every target framework ships its own initialiser: `@nestjs/cli`,
`create-next-app`, `sv create`. Those tools encode current conventions, are
maintained by the framework teams, and change with each major release.

## Decision

When an official scaffolder exists, `initialize()` runs it, and scafoldercli
composes on top of its output. We never reimplement a framework's baseline.

## Consequences

- Generated projects match what the framework's own documentation describes.
- We inherit upstream improvements for free and do not have to track every
  convention change.
- Generation requires network access on first run. Acceptable: the user is about
  to install dependencies anyway.
- We must be able to _edit_ files an external process wrote. `ProjectFiles`
  reads through to disk for exactly this reason.
- `--dry-run` cannot show files an external scaffolder would produce. It reports
  scafoldercli's own plan and says so.

## Alternatives rejected

- **Vendoring a full framework skeleton** — becomes stale within one release
  cycle and puts us in the position of arguing with the framework's own
  conventions.
