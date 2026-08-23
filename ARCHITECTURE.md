# Architecture — scafoldercli

This document describes the tool itself, not the projects it generates.
Generated projects get their own `ARCHITECTURE.md`, derived from their real
configuration.

## What this is

An opinionated project scaffolder. It composes:

```
framework + architecture + conventions + tooling + infrastructure + AI docs
```

It is deliberately **not** a framework, a runtime, or a template gallery. Once a
project is generated it is an ordinary project: nothing at runtime depends on
scafoldercli ever again.

## Core idea: orchestration, not replacement

Where an ecosystem ships an official scaffolder (`@nestjs/cli`,
`create-next-app`, `sv create`), scafoldercli **delegates to it** and then
composes on top. We do not reimplement framework conventions, and we do not
fight them.

```
official framework CLI          →  canonical, always-current baseline
scafoldercli template layers    →  architecture, auth, persistence, Docker, docs
```

## Data flow

```
CLI flags / preset ─┐
                    ├─→ PartialProjectConfig ─→ prompts ─→ ProjectConfig
interactive answers ┘                             (capability matrix narrows
                                                   every question)
                                    │
                                    ▼
                            assertCompatible          ← rules as data
                                    │
                                    ▼
                       generateProject (pipeline)
                                    │
      ┌─────────────┬───────────────┼────────────────┬───────────────┐
      ▼             ▼               ▼                ▼               ▼
   validate     initialize       generate       AI documentation   finalize
 (preconditions) (official CLI,  (template       (rendered from    (post-install
                  writes disk)    layers,         generator facts)  steps)
                                  buffered)
                                    │
                                    ▼
                           ProjectFiles.flush()
```

## Module map

| Path                         | Responsibility                                                      |
| ---------------------------- | ------------------------------------------------------------------- |
| `src/cli.ts`                 | Argument parsing, exit codes. Contains no generation logic.         |
| `src/commands/`              | Turns CLI input into a `GenerationRequest`, reports results.        |
| `src/prompts/`               | Interactive flow. Asks only what the capability matrix leaves open. |
| `src/config/schema.ts`       | The typed `ProjectConfig` and its zod schema.                       |
| `src/config/capabilities.ts` | Capability matrix: valid combinations, defaults, narrowing.         |
| `src/config/presets.ts`      | Named partial configurations. Data only.                            |
| `src/generator/contract.ts`  | `FrameworkGenerator` — the extension point.                         |
| `src/generator/registry.ts`  | Framework → generator lookup.                                       |
| `src/generator/pipeline.ts`  | The generation lifecycle. The only orchestrator.                    |
| `src/template/`              | Layer composition, Eta rendering, path conventions.                 |
| `src/fs/`                    | Buffered, escape-proof file writing.                                |
| `src/process/`               | Cross-platform command execution and package-manager adapters.      |
| `src/docs/`                  | AI documentation rendered from generator-declared facts.            |
| `src/generator/frameworks/`  | One directory per framework generator.                              |
| `src/util/`                  | Errors, logging, project-name rules.                                |
| `templates/`                 | Template layers, shipped as plain files.                            |

## Dependency rules

1. `src/util/` depends on nothing inside the project.
2. `src/config/` may depend on `src/util/` only.
3. `src/fs/`, `src/process/`, `src/template/` may depend on `src/config/` and `src/util/`.
4. `src/generator/` may depend on everything below it, and defines the contract.
5. `src/commands/` and `src/prompts/` depend on `src/generator/`, never the reverse.
6. **The core never enumerates frameworks.** A framework name may appear only in
   `src/config/capabilities.ts` (as data) and inside its own generator.

Rule 6 is the one that matters. If you find yourself writing
`if (framework === 'nestjs')` outside a generator, the design is wrong.

## The capability matrix

`src/config/capabilities.ts` holds three kinds of data:

- **`FRAMEWORK_CAPABILITIES`** — what each framework supports, plus its defaults.
- **`DATABASE_ORMS`** — which ORMs can talk to which engine.
- **`RULES`** — cross-field rules, each returning a human-readable reason.

Both the prompt flow and validation read the same tables, so an option that
cannot be offered also cannot be forced through a flag.

Notable rules:

- JWT on an API requires a database, because refresh tokens must be revocable
  server-side. A JWT-only design with no revocation is not shipped.
- The repository pattern requires a database and an ORM. We never generate an
  abstraction with nothing behind it.
- Frontend frameworks do not own persistence (see `docs/adr/0005-frontend-scope.md`).

## Template layers

Templates compose; they do not multiply. Instead of `nestjs-prisma-vitest`,
`nestjs-prisma-jest`, `nestjs-typeorm-vitest`… a generator declares an ordered
list of layers and the engine applies the enabled ones:

```ts
await applyLayers(
  files,
  [
    { dir: 'base' },
    { dir: 'frameworks/nestjs/base' },
    { dir: 'frameworks/nestjs/prisma', when: config.orm === 'prisma' },
    { dir: 'frameworks/nestjs/auth', when: config.authentication === 'jwt' },
    { dir: 'docker', when: config.docker },
  ],
  data,
);
```

A later layer overwrites an earlier one, so a framework can specialise a shared
file without copying the whole tree.

File-name conventions inside `templates/`:

| Template name     | Output        | Why                                     |
| ----------------- | ------------- | --------------------------------------- |
| `src/main.ts.eta` | `src/main.ts` | `.eta` marks a file to render.          |
| `src/main.ts`     | `src/main.ts` | No suffix: copied verbatim.             |
| `_gitignore.eta`  | `.gitignore`  | npm strips real dotfiles from packages. |

## Buffered writes

Every write scafoldercli makes goes through `ProjectFiles`, which buffers
operations and applies them in one pass. This gives three properties:

- A failure part-way through never leaves a half-written project.
- `--dry-run` is honest: the same code path runs, only the flush is skipped.
- Unit tests inspect exact output without touching the disk.

Reads fall through to disk, so buffered edits compose with files an official
framework CLI already wrote.

Every path is resolved through `resolveInside`, which rejects absolute paths and
anything escaping the project root.

## Errors

`ScafolderError` carries a stable machine-readable `code` and an optional
actionable `hint`. Anything else reaching the top level is reported as
`INTERNAL` — that is a bug.

Exit codes: `0` success, `1` failure, `130` user cancellation.

## Adding a framework

1. Add its row to `FRAMEWORK_CAPABILITIES` (or extend the existing one).
2. Create `src/generator/frameworks/<name>/`, implementing `FrameworkGenerator`.
3. Add its template layers under `templates/frameworks/<name>/`.
4. Register it in `src/generator/builtins.ts`.
5. Add a golden-project smoke test under `tests/integration/`.

No core file changes beyond steps 1 and 4, both of which are one-line additions.

## Testing strategy

| Level                                         | What it proves                                                        |
| --------------------------------------------- | --------------------------------------------------------------------- |
| Unit (`tests/unit/`)                          | The matrix, the engine, the pipeline and the file layer behave.       |
| Integration (`tests/integration/`)            | The packaged tarball installs and runs.                               |
| Golden projects (`tests/integration/golden/`) | A generated project installs, lints, tests, builds and containerizes. |

Testing only the CLI would be the central mistake: the product is the project it
produces. Golden projects are contracts — if one breaks, work stops until it is
fixed.

## Decisions

Architecture decision records live in [`docs/adr/`](docs/adr/).

## Cross-cutting generation steps

Two things every framework needs are applied by the pipeline rather than by each
generator:

- **AI documentation**, rendered from the facts a generator declares.
- **The local `.env`**, derived from the `.env.example` a layer produced, with
  every placeholder secret replaced by a generated value. Copying the example
  verbatim would give every generated project the same key.
