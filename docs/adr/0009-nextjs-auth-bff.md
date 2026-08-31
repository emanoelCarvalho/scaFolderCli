# 0009 — Next.js authentication: a BFF, not tokens in the browser

## Status

Accepted.

## Context

ADR 0005 fixed the scope of the frontend frameworks: they are clients of an API,
not owners of a database. That leaves one hard question — where do the tokens
live?

The common answers are all bad in a specific way:

| Approach                    | Problem                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `localStorage`              | Readable by any script. One XSS and the session is stolen, and a refresh token in `localStorage` is a long-lived credential sitting in reach. |
| Non-httpOnly cookie         | Same exposure, plus it rides along on every request.                                                                                          |
| Access token in memory only | Not exploitable by XSS at rest, but the user is logged out on every reload.                                                                   |

A scaffolder's default becomes the product's default, so "put the token in
localStorage and move on" is not available to us.

## Decision

The generated Next.js app is a **backend-for-frontend**. Browser code never
sees, stores or sends a token.

```
browser ──fetch──▶ /api/auth/* (Route Handler, same origin)
                        │  reads httpOnly cookie, attaches Authorization
                        ▼
                   external API
```

- Access and refresh tokens are stored in **httpOnly, `sameSite=lax`,
  `secure`-in-production cookies**, set by our own Route Handlers.
- Client components call same-origin `/api/...` routes. They never hold a token
  and never call the external API directly.
- Server Components read the session through a `server-only` module, so a token
  helper imported into a client bundle is a build error rather than a leak.
- `middleware.ts` redirects unauthenticated requests away from protected routes
  based on cookie presence — a cheap check, not the authorisation decision. The
  API remains the authority.

## Consequences

- XSS can still act as the user while the page is open, but it cannot exfiltrate
  a credential that outlives the page. That is the meaningful reduction.
- The app needs a running server; a static export is not possible with auth
  enabled. Acceptable: `next start` and the generated container both provide one.
- There is more code than a `localStorage` client: four route handlers and a
  session module. That code is the point.
- `database: none` still holds. A BFF holds no state of its own; the cookie is
  the state, and it lives in the browser.

## Alternatives rejected

- **NextAuth / Auth.js** — a large dependency that owns the auth model, when the
  external API already owns it. It would have to be configured to defer to our
  API, which is more work than the four handlers it replaces.
- **Tokens in `localStorage` with a refresh interceptor** — the pattern most
  tutorials show, and the one this ADR exists to avoid.
