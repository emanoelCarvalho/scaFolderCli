# scafoldercli

Opinionated project scaffolder for Node.js and TypeScript.

```bash
npx scafoldercli create
```

Answer a few questions, get a project that installs, tests, builds, runs in a
container, and documents itself — for humans and for coding agents.

> **Status: early development.** The NestJS, Express and Next.js paths are
> complete, and each is verified by generating a real project that installs,
> lints, tests, builds, runs in a container and serves authentication. Svelte is
> not implemented yet. Run `npx scafoldercli list` to see what this build can
> generate — nothing is offered that it cannot produce.

## What it generates

```
framework + architecture + conventions + tooling + infrastructure + AI docs
```

Not a template gallery. scafoldercli composes a project from layers, delegating
to each ecosystem's official scaffolder where one exists, then adding the parts
those tools deliberately leave to you: architecture, persistence, authentication,
containerization, and documentation derived from your actual configuration.

Once generated, the project is yours. Nothing depends on scafoldercli at runtime.

## Install

No install needed:

```bash
npx scafoldercli create my-api
```

Or globally:

```bash
npm install -g scafoldercli
```

Requires Node.js 20.11 or newer.

## Usage

### Interactive

```bash
npx scafoldercli create
```

Questions narrow as you answer. Options that cannot work together are never
offered, and a question with a single valid answer is not asked at all.

### From a preset

```bash
npx scafoldercli create my-api --preset nestjs-api
```

| Preset        | What you get                                                               |
| ------------- | -------------------------------------------------------------------------- |
| `nestjs-api`  | NestJS + PostgreSQL + Prisma + JWT + repository pattern + Vitest + Docker  |
| `express-api` | Express + PostgreSQL + Prisma + JWT + repository pattern + Vitest + Docker |
| `nextjs-web`  | Next.js web client with JWT auth against an external API                   |
| `svelte-web`  | SvelteKit web client with JWT auth against an external API                 |

### Non-interactive

```bash
npx scafoldercli create my-api \
  --yes \
  --framework nestjs \
  --database postgresql \
  --orm prisma \
  --auth jwt \
  --testing vitest
```

`--yes` never prompts: anything you leave out comes from the framework's
defaults. The framework itself is always required — guessing it would silently
produce the wrong project.

### Preview without writing

```bash
npx scafoldercli create my-api --preset nestjs-api --dry-run
```

## Commands

| Command         | Description                                                     |
| --------------- | --------------------------------------------------------------- |
| `create [name]` | Generate a project. This is the default command.                |
| `list`          | Show frameworks, presets and valid combinations for this build. |

### `create` options

| Option                             | Description                                          |
| ---------------------------------- | ---------------------------------------------------- |
| `-p, --preset <preset>`            | Start from a preset                                  |
| `-f, --framework <name>`           | `nestjs`, `express`, `nextjs`, `svelte`              |
| `--project-type <type>`            | `api`, `web`                                         |
| `--architecture <name>`            | `modular`, `layered`, `clean`                        |
| `--database <name>`                | `postgresql`, `mysql`, `mongodb`, `sqlite`, `none`   |
| `--orm <name>`                     | `prisma`, `sequelize`, `typeorm`, `mongoose`, `none` |
| `--auth <name>`                    | `jwt`, `none`                                        |
| `--testing <runner>`               | `vitest`, `jest`, `none`                             |
| `--package-manager <pm>`           | `npm`, `pnpm`, `yarn` (detected by default)          |
| `--repository` / `--no-repository` | Repository pattern                                   |
| `--docker` / `--no-docker`         | Docker files                                         |
| `--ai-docs` / `--no-ai-docs`       | `ARCHITECTURE.md`, `CONVENTIONS.md`, `AGENTS.md`     |
| `--install` / `--no-install`       | Install dependencies (default: install)              |
| `--git` / `--no-git`               | Initialize a repository (never commits)              |
| `-d, --dir <path>`                 | Target directory (default: `./<name>`)               |
| `--dry-run`                        | Show the plan without writing anything               |
| `--force`                          | Write into a non-empty directory                     |
| `-y, --yes`                        | Never prompt                                         |
| `--verbose` / `--silent`           | Output level                                         |

Exit codes: `0` success, `1` failure, `130` cancelled.

## Compatibility

Invalid combinations are rejected, not silently repaired:

| Database                    | ORMs                       |
| --------------------------- | -------------------------- |
| PostgreSQL / MySQL / SQLite | Prisma, TypeORM, Sequelize |
| MongoDB                     | Prisma, Mongoose           |
| None                        | None                       |

Two rules worth knowing:

- **JWT on an API requires a database.** Refresh tokens must be revocable
  server-side. A token system that cannot log anyone out is not shipped.
- **The repository pattern requires a database and an ORM.** No abstraction is
  generated with nothing behind it.

Run `scafoldercli list` for the full matrix.

### What the implemented frameworks produce today

| Choice             | NestJS             | Express          | Next.js      |
| ------------------ | ------------------ | ---------------- | ------------ |
| Project type       | REST API           | REST API         | Web client   |
| Architecture       | Modular            | Modular          | Modular      |
| Database           | PostgreSQL, none   | PostgreSQL, none | none         |
| ORM                | Prisma, none       | Prisma, none     | none         |
| Authentication     | JWT, none          | JWT, none        | JWT, none    |
| Repository pattern | Yes or no          | Yes or no        | —            |
| Tests              | Vitest, Jest, none | Vitest, none     | Vitest, none |
| Docker             | Yes or no          | Yes or no        | Yes or no    |

Layered and clean layouts, other databases and other ORMs are planned; they are
not offered until the generator can actually produce them.

Each path follows its own ecosystem. NestJS delegates its baseline to
`@nestjs/cli` and uses class-validator and its own DI container. Express has no
official scaffolder, so scafoldercli supplies the whole structure: ESM, zod,
pino, `jose`, and a composition root. Next.js builds on `create-next-app` with
the App Router and Tailwind, and keeps authentication on the server — see
[`docs/adr/0008-express-stack.md`](docs/adr/0008-express-stack.md) and
[`docs/adr/0009-nextjs-auth-bff.md`](docs/adr/0009-nextjs-auth-bff.md).

### Front end and back end, generated to fit

The Next.js client expects the API shape the backend generators produce:

```bash
npx scafoldercli create my-api --preset nestjs-api
npx scafoldercli create my-web --preset nextjs-web   # then set API_URL
```

The client never holds a token. It calls its own route handlers, which read an
httpOnly cookie and talk to the API server-side.

## AI documentation

With `--ai-docs` (on by default), every project gets:

| File              | Purpose                                                                           |
| ----------------- | --------------------------------------------------------------------------------- |
| `ARCHITECTURE.md` | Stack, layout, layers, dependency rules, commands, how to change the architecture |
| `CONVENTIONS.md`  | Naming, imports, errors, logging, configuration, tests, commits                   |
| `AGENTS.md`       | Short operational rules for coding agents                                         |

These are rendered from the generator's declared facts about the code it just
wrote — not from a generic template. If the docs and the code disagree, that is
a bug.

## Environment files

Generation writes two files:

- **`.env.example`** — committed, with placeholders. It documents every variable
  the project validates at startup.
- **`.env`** — gitignored, with every placeholder secret replaced by a freshly
  generated random value, so the project runs immediately and has never had a
  key that anyone else knows.

## Security defaults

- Passwords hashed with Argon2id
- Access tokens short-lived; refresh tokens stored server-side, rotated on use,
  and revocable
- Configuration from validated environment variables; the app refuses to start
  without them
- `.env.example` only — never a `.env` with real values
- Input validation, safe error responses, security headers, CORS

## Contributing

```bash
git clone <repository>
cd scaFolderCli
npm install
npm run verify      # format check, lint, typecheck, unit tests, build
npm run verify:full # the above, plus the packaging integration test
node dist/cli.js list
```

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — how the tool is built, and how to add a framework
- [`CONVENTIONS.md`](CONVENTIONS.md) — code conventions
- [`AGENTS.md`](AGENTS.md) — rules for coding agents
- [`ROADMAP.md`](ROADMAP.md) — what is next and why
- [`docs/adr/`](docs/adr/) — decisions and the alternatives rejected

## License

MIT
