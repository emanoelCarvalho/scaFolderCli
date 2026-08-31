# Conventions — scafoldercli

Rules for working in this repository. For the projects it generates, see the
`CONVENTIONS.md` each project receives.

## Naming

- Files: `kebab-case.ts`. Tests: `<subject>.test.ts` under `tests/`.
- Types, interfaces and classes: `PascalCase`. No `I` prefix.
- Functions and variables: `camelCase`.
- Exported constant tables: `SCREAMING_SNAKE_CASE` (`FRAMEWORK_CAPABILITIES`).
- Boolean fields read as assertions: `repositoryPattern`, `hasDatabase`, `dryRun`.

## Imports

- ESM only. Every relative import ends in `.js`, even from `.ts` sources —
  required by `module: nodenext`.
- `import type` for types (`consistent-type-imports` enforces it).
- Order: node builtins, external packages, internal modules.
- Respect the dependency rules in `ARCHITECTURE.md`. Nothing in `src/config/`
  may import `src/generator/`.

## Types

- `strict` plus `noUncheckedIndexedAccess`. Indexed access returns
  `T | undefined`; handle it, do not assert it away.
- No `any`. Use `unknown` and narrow.
- Casts need a comment explaining why the type system cannot see it.
- Enumerations are `as const` arrays, with the union derived from them. One
  source of truth for the runtime list and the type.

## Errors

- Throw `ScafolderError` with a code and, where a next step exists, a `hint`.
- Error codes are a public contract. Add codes; never repurpose one.
- Never swallow an error. `catch {}` requires a comment saying why the failure
  is genuinely irrelevant.
- Messages state what happened and what to do, never just "failed".

## Output

- Only `src/util/logger.ts` may touch the console — lint enforces it.
- Diagnostics go to stderr; machine-readable output goes to stdout.
- Interactive UI uses `@clack/prompts`. Non-interactive runs use the logger, so
  `--yes` output stays pipe-friendly.

## Filesystem and processes

- Never import `node:fs` or `node:child_process` from a generator. Use
  `context.files` and `context.run`.
- Every path is relative to the project root and resolved through
  `resolveInside`.
- Never assume a shell, a path separator, a CPU architecture or a package
  manager. `path.join` for filesystem paths, `/` for template paths.

## Templates

- One layer, one concern. A layer is enabled by a `when` condition, never by a
  conditional branch inside the generator body.
- Prefer a new layer over a large conditional inside a template.
- Use `<% ... -%>` for control flow so generated files have no stray blank lines.
- Never put a secret, a token or a personal path in a template. `.env.example`
  only, never `.env`.
- A leading `_` on any path segment becomes `.` in the output. That collides
  with frameworks that give `_` its own meaning — Next.js treats `_folder` as a
  private route segment — so never name a template file `_something` unless a
  dotfile is what you want.

## Tests

- A feature is not done without tests. Test behaviour, not implementation.
- Unit tests use temporary directories and clean up in `afterEach`.
- The generator registry is global; call `clearGenerators()` in `beforeEach`.
- Golden-project tests must fail loudly. Never mark one as skipped to get green.

## Commits

- Conventional Commits: `type(scope): summary`.
  Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`.
- One logical change per commit. `npm run verify` passes on every commit.

## Definition of done

```
implemented + tested + reviewed + documented + validated
```

`npm run verify` runs format check, lint, typecheck, tests and build. If it is
red, the work is not done.
