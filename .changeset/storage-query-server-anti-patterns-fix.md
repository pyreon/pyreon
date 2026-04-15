---
"@pyreon/storage": patch
"@pyreon/query": patch
"@pyreon/server": patch
"@pyreon/lint": patch
---

Storage / query / core-server anti-pattern cleanup + `no-window-in-ssr`
typeof-guard-function recognition

`@pyreon/storage` (10 errors → 0):

- `indexed-db.ts`: added `typeof indexedDB === 'undefined'` early-return at
  `openDB` entry. SSR callers receive a rejected promise with a clear
  `[Pyreon] indexedDB is not available` error instead of crashing.

`@pyreon/query` (5 errors → 0):

- `use-subscription.ts`: added `typeof WebSocket === 'undefined'`
  early-return guards at the entry of `connect()`, `send()`, and `close()`.
- `query-client.ts`: error prefix `[@pyreon/query]` → `[Pyreon]`.

`@pyreon/server` / `@pyreon/core-server` (5 errors → 0):

- `client.ts`: `typeof document === 'undefined' → throw` early-return on
  `startClient` entry. `hydrateIslands` and `scheduleHydration` /
  `observeVisibility` typeof guards.
- `client.ts` / `html.ts`: error prefixes normalised to `[Pyreon]`.

`@pyreon/lint` — `no-window-in-ssr` typeof-guard functions:

- A function whose body is `return <typeof check>` (or AND-chain of typeof
  checks) now counts as a typeof guard at its call sites — e.g.
  `function isBrowser() { return typeof window !== 'undefined' }` makes
  `if (!isBrowser()) return` an early-return guard. Both
  `function decl` and `const fn = () => …` (arrow + function-expression)
  forms are recognised.
- Conventional names `isBrowser` / `isClient` / `isServer` / `isSSR` are
  pre-seeded so cross-module imports (`import { isBrowser } from './utils'`)
  work without follow-the-import analysis. Same name-convention basis as
  `dev-guard-warnings` recognising `__DEV__`. The trade-off — a user-defined
  function with a matching name that does NOT actually check typeof would
  silence the rule — is documented as the cross-module convention contract.

5 new bisect-verified regression tests for the typeof-guard-function
recognition.
