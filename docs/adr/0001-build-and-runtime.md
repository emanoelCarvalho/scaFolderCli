# 0001 — Build, runtime and module system

## Status

Accepted.

## Context

The CLI is published to npm and must run identically on macOS, Linux, Windows,
in Docker and in CI, installed through npm, pnpm or yarn.

## Decision

- **ESM only**, `"type": "module"`, `module: nodenext`.
- **Node >= 20.11.0**, the first release with `import.meta.dirname`, which is how
  templates and `package.json` are located at runtime.
- **`tsc` alone**, no bundler. `dist/` mirrors `src/`.
- **Templates ship as plain files** at the package root, listed in `files`, not
  copied into `dist` by a build step.

## Consequences

- The build has one moving part. There is no bundler configuration to debug and
  no risk of a bundler inlining or mangling a template.
- `src/template/` and `dist/template/` sit at the same depth, so
  `../../templates` resolves correctly during development and after publishing.
  A test asserts this.
- Startup cost is a few unbundled `import`s. Acceptable for a tool that then
  spends minutes installing dependencies.
- CommonJS consumers cannot `require()` the public API. Acceptable: the product
  is a CLI.

## Alternatives rejected

- **tsup/esbuild bundling** — faster startup, but adds a dependency and a config
  surface to solve a problem we do not have.
- **Dual CJS/ESM output** — doubles the build and the test matrix for a consumer
  we do not target.
