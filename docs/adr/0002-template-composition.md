# 0002 — Template composition over template variants

## Status

Accepted.

## Context

The configuration space is large: framework × architecture × database × ORM ×
auth × test runner × Docker. Materialising one template per combination means
hundreds of near-identical trees, and every fix has to be applied to all of them.

## Decision

Templates are **layers**. A generator declares an ordered list of directories
with optional `when` conditions; the engine applies the enabled ones in order,
and a later layer overwrites an earlier one.

```ts
[
  { dir: 'base' },
  { dir: 'frameworks/nestjs/base' },
  { dir: 'frameworks/nestjs/prisma', when: config.orm === 'prisma' },
  { dir: 'docker', when: config.docker },
];
```

Rendering uses **Eta** with `<% %>` delimiters and HTML escaping disabled.

## Consequences

- Adding an ORM means adding one layer, not multiplying the tree.
- A shared file can be specialised by one framework without copying its siblings.
- Layer order is significant and must be readable at the call site. It is: the
  list is literally the generator's declaration.
- A missing layer directory is a hard error, not a silent skip, so a typo cannot
  quietly produce an incomplete project.

## Alternatives rejected

- **Writing our own mini template language** — inventing a language is a
  maintenance liability; Eta is small, tested, and already solves this.
- **Handlebars** — heavier, and its escaping model is aimed at HTML.
- **`{{ }}` delimiters** — collide with Svelte, Vue and Go template syntax that
  may legitimately appear inside a generated file. `<% %>` collides with nothing
  we emit.
