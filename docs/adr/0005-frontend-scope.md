# 0005 — Frontend frameworks generate API clients, not full-stack servers

## Status

Accepted for v1. Revisit when the backend path is complete.

## Context

Next.js and SvelteKit are both capable of owning a database. So are the backend
frameworks. Supporting persistence in all four multiplies the matrix — every
ORM, migration story, repository layout and Docker compose file doubles — before
a single path has been proven end to end.

## Decision

In v1, `nextjs` and `svelte` generate **web clients**: they consume an API and
declare `database: none`, `orm: none`, `repositoryPattern: false`. JWT remains
available and means client-side token handling against someone else's API.

## Consequences

- The frontend surface is small and honest: API client, auth client, validation,
  routing, layout, and only genuinely reusable components.
- The capability matrix enforces this, so a user cannot request a combination we
  do not actually generate.
- Nothing blocks the future: adding `projectType: 'api'` to `nextjs` is a data
  change plus new layers, with no core modification.

## Alternatives rejected

- **Full-stack Next.js in v1** — doubles the matrix before the backend Golden
  Path exists, in direct conflict with the phase rule.
- **Hiding the limitation** — offering the option and silently generating a
  client would be worse than declining it.
