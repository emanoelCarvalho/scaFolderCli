# 0008 — The Express stack

## Status

Accepted.

## Context

Express supplies an HTTP router and nothing else: no project layout, no
validation, no logging, no dependency injection, no scaffolder. Where the NestJS
generator composes on top of an opinionated baseline, the Express generator has
to supply the whole baseline itself.

That freedom is the risk. Every gap Express leaves is a decision, and a
scaffolder's decisions become the project's defaults.

## Decision

| Concern     | Choice                 | Why                                                                                |
| ----------- | ---------------------- | ---------------------------------------------------------------------------------- |
| Modules     | ESM, `type: module`    | Node's module system. Relative imports carry `.js`.                                |
| Validation  | zod                    | No decorators, so no metadata emit; schemas are values, and infer their own types. |
| Logging     | pino + pino-http       | The de-facto standard, structured by default, with redaction.                      |
| JWT         | jose                   | Zero dependencies, ESM-native, built on Web Crypto.                                |
| Passwords   | @node-rs/argon2        | Same as the NestJS path; prebuilt for glibc and musl.                              |
| Dev runner  | tsx                    | Stable, fast, and forwards Node flags.                                             |
| Wiring      | A composition root     | Not a DI container.                                                                |
| Env loading | `--env-file-if-exists` | Node's own dotenv. No runtime dependency.                                          |

Two of these deserve the argument spelled out.

**No dependency-injection container.** `src/container.ts` constructs every
service by hand. It is a few lines, and it means the entire dependency graph is
readable in one file rather than resolved at runtime by a framework. Tests build
the same graph with in-memory doubles and no test-module machinery.

**Node's `--env-file-if-exists` rather than `dotenv`.** NestJS gets `.env`
loading from `@nestjs/config`; plain Express gets nothing, and the first
generated Express project could not start because of it. The flag was verified
to work under both `node` and `tsx watch`, and it degrades correctly in a
container where no `.env` exists and configuration comes from the environment.

## Consequences

- The generated project has one runtime dependency per concern and no framework
  beyond Express itself.
- `initialize()` is a genuine no-op: there is no official scaffolder to run.
  This is the visible difference between the two generators.
- Request schemas are `.strict()`, so an undeclared property is rejected rather
  than silently dropped — matching `forbidNonWhitelisted` on the NestJS path.
  Consistency between generated projects is itself a product feature.
- Jest is not offered: it needs its own ESM configuration and its own validated
  run, and offering an unvalidated option would break the rule that the matrix
  only contains what we actually produce.

## Alternatives rejected

- **A DI container (tsyringe, InversifyJS)** — adds decorators, metadata emit
  and a runtime resolution step to solve a problem that twenty lines of manual
  wiring already solves.
- **`dotenv` at runtime** — a dependency for something Node now does natively.
- **CommonJS** — simpler imports, and the wrong direction for a project
  generated in 2026.
