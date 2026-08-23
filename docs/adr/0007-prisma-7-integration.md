# 0007 — Prisma 7 integration for NestJS

## Status

Accepted.

## Context

Prisma 7 changed how an application connects to its database, and the change is
not cosmetic:

- `datasource db { url = env("DATABASE_URL") }` is rejected outright.
- The migration connection string moves to a root `prisma.config.ts`.
- `new PrismaClient()` no longer connects on its own; it requires a **driver
  adapter** (`@prisma/adapter-pg` for PostgreSQL).
- The default `prisma-client` generator emits TypeScript into your `src`,
  importing with `.ts` extensions — which a plain `tsc` build cannot resolve
  without extra compiler flags.

Pinning Prisma 6 would have avoided all of it, at the cost of shipping a
scaffolder whose output is a major version behind on day one. That is the exact
staleness this product exists to prevent.

## Decision

Ship Prisma 7, configured as follows:

- **`provider = "prisma-client-js"`**, which is still supported in 7 and emits to
  `node_modules/@prisma/client`. Generated code stays out of `src`, so `nest
build`, ESLint and the test runner never see it.
- **`prisma.config.ts`** at the root, loading `.env` through `dotenv` and failing
  with an actionable message when `DATABASE_URL` is absent.
- **`PrismaService extends PrismaClient`**, constructed with the driver adapter
  for the chosen engine and the URL from validated configuration.
- The adapter package follows the **database**, not the ORM:
  `postgresql → @prisma/adapter-pg`.

## Consequences

- `prisma generate` must run after install, so it is a `finalize` step rather
  than part of template composition.
- Generation writes a local `.env`, because `prisma.config.ts` reads
  `DATABASE_URL` at load time and `prisma generate` would otherwise fail
  immediately after scaffolding. This was found by the golden-project test.
- The Docker build copies the generated client from the build stage: it is
  generated, not published, so a fresh production install does not contain it.
- Supporting another engine means adding one adapter entry and one golden-test
  run — MySQL and SQLite are not offered until that is done.

## Alternatives rejected

- **Prisma 6** — simpler today, outdated on release.
- **The new `prisma-client` generator** — puts generated TypeScript inside `src`,
  which then needs `allowImportingTsExtensions`, ESLint ignores and build
  exclusions. More moving parts for no benefit at this scale.
