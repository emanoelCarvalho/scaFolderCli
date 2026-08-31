# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [semantic versioning](https://semver.org/).

## [0.1.0] — unreleased

First release. Four framework paths, each verified by generating a real project
that installs, lints, type-checks, tests, builds, and runs in a container.

### Added

**The CLI**

- `create` with interactive prompts that ask only what is still undecided, and
  a capability matrix that never offers a combination it cannot produce.
- Presets: `nestjs-api`, `express-api`, `nextjs-web`, `svelte-web`.
- `--yes` for non-interactive runs, `--dry-run` to see the plan, `--force`,
  `--no-install`, `--no-git`, `--package-manager`.
- `list`, showing what this build can actually generate.
- npm, pnpm and yarn support throughout, including in generated Dockerfiles.

**Generated backends — NestJS and Express**

- REST API in TypeScript with environment validation at startup, structured
  logging, distinct liveness and readiness endpoints, and graceful shutdown.
- PostgreSQL through Prisma 7, using driver adapters.
- Optional repository pattern: interfaces when it is on, and no artificial
  indirection when it is off.
- JWT authentication with register, login, refresh, logout and logout-all.
  Refresh tokens are stored hashed, rotated on every use, and revocable; reusing
  a rotated token revokes the whole session family.
- Vitest (and Jest on NestJS), Docker, and AI documentation.

**Generated web clients — Next.js and SvelteKit**

- The browser never receives a token. Next.js keeps authentication in route
  handlers, SvelteKit in form actions that work with JavaScript disabled; both
  store tokens in httpOnly cookies read only on the server.
- A small component set — button, text and password fields, modal, toast,
  spinner, and loading, empty and error states — wired for accessibility.
- Validated server-only configuration, one place that calls the API, Vitest,
  Docker, and AI documentation.

**Documentation**

- Every project can generate `ARCHITECTURE.md`, `CONVENTIONS.md` and
  `AGENTS.md`, rendered from facts the generator declares about the code it
  just wrote — never from a generic template.

### Security

- Passwords hashed with Argon2id; a failed login costs the same whether or not
  the account exists, so the endpoint cannot be used to enumerate accounts.
- Generation writes a gitignored local env file with a freshly generated secret
  per project. Templates ship placeholders only.
- Containers run as a non-root user and take all configuration from the
  environment.
- Requests are validated at the edge, and undeclared properties are rejected
  rather than silently dropped.

### Known limitations

Only combinations that are generated _and_ validated are offered:

- Architecture: modular only. Layered and clean are planned.
- Database: PostgreSQL or none. ORM: Prisma or none.
- Test runners: Vitest everywhere, Jest on NestJS only.
- Component tests are not generated for SvelteKit; they require a browser
  runner.
- The interactive prompt flow has not been exercised end to end in a terminal.

[0.1.0]: https://github.com/emanoelCarvalho/scaFolderCli/releases/tag/v0.1.0
