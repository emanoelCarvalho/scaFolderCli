# Agents — scafoldercli

Operational rules for coding agents working on this repository.
Read `ARCHITECTURE.md` and `CONVENTIONS.md` first. `ROADMAP.md` says what comes
next and why.

## Before changing anything

1. Run `npm run verify`. Start from green.
2. Find the module that owns the behaviour (see the module map in `ARCHITECTURE.md`).
3. Read the neighbouring code and follow its patterns.

## Hard rules

- **Never write `if (framework === '...')` outside a generator.** Framework
  knowledge belongs in `src/config/capabilities.ts` (as data) or in the
  framework's own generator. This is the single most important rule here.
- Never duplicate a template tree per combination. Add a layer.
- Never add a dependency without stating why the existing ones are insufficient.
- Never import `node:fs` or `node:child_process` from a generator.
- Never put a secret, a token, or an absolute machine path in a template.
- Never commit a `.env` with real values. `.env.example` only.
- Never skip, delete or weaken a test to make the build pass.
- Never advance to the next roadmap phase while the current one is red.

## Adding a framework generator

1. `src/config/capabilities.ts` — declare what it supports and its defaults.
2. `src/generator/frameworks/<name>/` — implement `FrameworkGenerator`.
3. `templates/frameworks/<name>/` — add the layers.
4. `src/generator/builtins.ts` — register it.
5. `tests/integration/` — add a golden-project smoke test.

`documentation()` is required: it supplies the facts the generated
`ARCHITECTURE.md`, `CONVENTIONS.md` and `AGENTS.md` are rendered from. Never
return generic text — the docs must describe the code that was actually written.

## Adding a compatibility rule

Add an entry to `RULES` in `src/config/capabilities.ts` with a reason a user can
act on, then add a test in `tests/unit/capabilities.test.ts`. Do not add
validation inline in the pipeline or in a prompt.

## Commands

- Verify (fast, run constantly): `npm run verify`
- Verify everything, packaging included: `npm run verify:full`
- Unit tests: `npm test`
- Integration tests (`npm pack` + install): `npm run test:integration`
- Watch tests: `npm run test:watch`
- Build: `npm run build`
- Try the CLI locally: `node dist/cli.js create --help`

## Definition of done

`implemented + tested + reviewed + documented + validated`.
A change that generates a project must also prove the generated project
installs, lints, tests, builds and containerizes.
