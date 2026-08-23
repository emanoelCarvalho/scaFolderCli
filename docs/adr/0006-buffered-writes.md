# 0006 — Buffered filesystem writes

## Status

Accepted.

## Context

Generation is a multi-step process that can fail at any point: an external CLI
errors, a template throws, a dependency install fails. Writing files as we go
leaves the user with a half-built project that looks complete.

## Decision

All writes go through `ProjectFiles`, which buffers operations in a map and
applies them in a single `flush()`. Reads fall through to disk so buffered edits
compose with output from an external scaffolder. Every path is resolved through
`resolveInside`, which rejects absolute paths and anything escaping the root.

If generation fails and scafoldercli created the target directory, it removes
it. A pre-existing directory is never removed.

## Consequences

- `--dry-run` exercises the real code path and skips only the flush, so the plan
  cannot drift from what a real run does.
- Unit tests assert exact file contents without touching the disk.
- A later `write()` to the same path silently wins, which is precisely the layer
  override semantics we want.
- Buffering holds the whole generated project in memory. Scaffolds are small;
  this is not a concern.
- Files written by an external scaffolder are outside the buffer and are not
  rolled back individually — the directory-level cleanup covers them.

## Alternatives rejected

- **Generating into a temp directory and moving it** — cross-device renames are
  unreliable, and external scaffolders would still need special handling.
- **Writing immediately** — simpler, and leaves broken projects behind.
