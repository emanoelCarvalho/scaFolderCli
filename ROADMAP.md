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

## Phase 2 — NestJS (the Golden Path)

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
- [ ] Golden project smoke test: docker build _(needs a running Docker daemon)_
- [ ] Layered and clean architecture layouts
- [ ] MySQL, SQLite and MongoDB
- [ ] TypeORM, Sequelize and Mongoose

The matrix only offers what the generator actually produces, so the unchecked
items above are not selectable yet.

## Phase 3 — Express

Same conceptual specification, adapted to an ecosystem that supplies no
structure of its own.

## Phase 4 — Next.js

Web client: API client, auth client, validation, routing, layout, and only the
components that are genuinely reusable.

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
