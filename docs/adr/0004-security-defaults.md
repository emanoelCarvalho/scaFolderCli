# 0004 — Security defaults for generated authentication

## Status

Accepted.

## Context

A scaffolder's defaults become production defaults. The most common insecure
pattern in generated auth code is a long-lived JWT refresh token with no
server-side state: it cannot be revoked, so logout is a lie and a stolen token
is valid until it expires.

## Decision

- JWT authentication for an API **requires a database**. The capability matrix
  rejects the combination outright rather than generating something weaker.
- Refresh tokens are stored server-side, rotated on every use, and revocable.
  Reuse of a rotated token invalidates the whole session family.
- Passwords are hashed with Argon2id.
- Secrets come from validated environment variables. The process refuses to
  start when one is missing.
- Templates ship `.env.example` with placeholders only. No template ever
  contains a real secret.
- Generation writes a gitignored `.env` whose secrets are randomly generated per
  project. Copying the example verbatim would be worse than nothing: every
  generated project would start with the same key, published in this repository.

## Consequences

- `--framework nestjs --database none --auth jwt` fails with an explanation
  instead of generating a token system that cannot log anyone out.
- Generated auth carries a session/refresh-token table, which is more code than
  a naive implementation. That code is the point.
- Multiple concurrent sessions per user work by construction.

## Alternatives rejected

- **Stateless refresh tokens** — simpler, and unable to revoke. Not shipped as a
  default under any flag.
- **Making revocation opt-in** — a security default that must be switched on is
  not a default.
