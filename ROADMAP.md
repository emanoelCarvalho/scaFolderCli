# Roadmap

A phase is complete only when it is implemented, tested, reviewed, documented,
building, and free of known critical defects. **No phase starts while the
previous one is red.**

## Phase 1 — Core CLI ✅

- [x] Typed `ProjectConfig` with zod validation
- [x] Capability matrix (valid combinations as data, not conditionals)
- [x] `FrameworkGenerator` contract and registry
- [x] Generation pipeline with buffered, escape-proof writes
- [x] Layered template engine (composition, not combinatorial templates)
- [x] Interactive prompts that ask only what is undecided
- [x] Presets and non-interactive `--yes` mode
- [x] `--dry-run`, `--force`, `--no-install`, `--no-git`
- [x] Cross-platform command execution and package-manager adapters
- [x] AI documentation rendered from generator-declared facts
- [x] Structured errors with stable codes and actionable hints
- [x] Repository documentation and ADRs
- [x] Unit test suite, lint, typecheck, build

## Phase 2 — NestJS (the Golden Path) ✅

The first complete vertical slice, and the reference every other framework
follows:

```
NestJS → REST API → PostgreSQL → Prisma → JWT → repository pattern
       → tests → Docker → AI documentation → validated generated project
```

- [x] Delegate initialisation to `@nestjs/cli`
- [x] Modular architecture layout
- [x] Environment validation, structured logging, health checks, graceful shutdown
- [x] Prisma 7 integration with driver adapters and migrations
- [x] Repository pattern behind interfaces, and a coherent layout without it
- [x] JWT auth: register, login, refresh (rotating), revoke, logout, logout-all
- [x] Vitest layer with SWC, plus runner-agnostic specs that also run under Jest
- [x] Dockerfile, compose file, `.dockerignore`
- [x] Golden project smoke test: install → prisma generate → lint → test → build
- [x] Golden project smoke test: docker build, running as a non-root user
- [x] Container verified running: connects to a real database, serves auth,
      reports healthy, and shuts down cleanly on SIGTERM
- [ ] Layered and clean architecture layouts
- [ ] MySQL, SQLite and MongoDB
- [ ] TypeORM, Sequelize and Mongoose

The matrix only offers what the generator actually produces, so the unchecked
items above are not selectable yet.

## Phase 3 — Express ✅

Same conceptual specification, adapted to an ecosystem that supplies no
structure of its own: there is no official scaffolder to delegate to, so every
file comes from scafoldercli's own layers.

- [x] ESM, Express 5, zod validation, pino logging
- [x] Composition root instead of a dependency-injection container
- [x] Environment validation, health checks, graceful shutdown
- [x] Prisma 7 integration with driver adapters
- [x] Repository pattern behind interfaces, and a coherent layout without it
- [x] JWT auth with `jose`: register, login, refresh, logout, logout-all, me
- [x] Vitest, with HTTP-level tests through supertest
- [x] Dockerfile, compose file, `.dockerignore`
- [x] Golden project smoke test: install → typecheck → lint → format → test →
      build → docker build
- [x] Container verified running against a real database
- [ ] Jest (needs its own ESM configuration and validated run)
- [ ] Layered and clean architecture layouts
- [ ] MySQL, SQLite and MongoDB

## Phase 4 — Next.js ✅

A web client, not a full-stack server (see `docs/adr/0005-frontend-scope.md`).

- [x] Delegate initialisation to `create-next-app` (App Router, Tailwind, src/)
- [x] Validated `server-only` configuration and a single API client
- [x] Authentication as a backend-for-frontend: tokens live in httpOnly cookies
      and never reach the browser (`docs/adr/0009-nextjs-auth-bff.md`)
- [x] Route handlers for register, login, refresh and logout
- [x] Middleware route protection, with every protected page re-checking
- [x] The component set from the spec: button, fields, modal, toast, spinner,
      and loading / empty / error states
- [x] Vitest with Testing Library, querying by role and label
- [x] Dockerfile on standalone output, compose file, `.dockerignore`
- [x] Golden project smoke test: install → typecheck → lint → format → test →
      build → docker build
- [x] Verified running: middleware redirects, cookies are httpOnly, the response
      body carries no token, the dashboard renders, logout clears the session
- [ ] Jest
- [ ] Layered architecture layout

## Phase 5 — Svelte

Same specification as Phase 4, following SvelteKit conventions.

## Phase 6 — Hardening

- [ ] Full compatibility-matrix coverage
- [ ] Docker build tests for every framework
- [ ] Security review of every generated template
- [ ] `npm pack` + install-from-tarball test
- [ ] Cross-platform validation (macOS, Linux, Windows) in CI

## Phase 7 — Release

- [ ] Semantic versioning and changelog
- [ ] Release pipeline
- [ ] Published documentation
- [ ] npm publication

## Deliberately deferred

Designed for, not built yet:

- **Plugins** (`scafoldercli add redis`) — the generator contract and layer
  engine already support it; no command exists.
- **Full-stack frontends** — see `docs/adr/0005-frontend-scope.md`.
- **Config files** (`scafoldercli.json`) — presets cover today's need.
