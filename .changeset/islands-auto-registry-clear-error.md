---
'@pyreon/server': patch
---

`hydrateIslandsAuto()` no longer throws an uncaught exception at page boot when there is nothing to auto-hydrate. Previously a no-arg / missing / malformed registry (the common `@pyreon/zero` misuse — islands declared via `import { island } from '@pyreon/zero'` already self-hydrate, so the call is superfluous) dereferenced `undefined.__pyreonIslandsEnabled` → an uncaught `TypeError` on every page view that pollutes the console and error-tracking (Sentry, etc.) even though hydration isn't actually blocked. It now warns in development with an actionable message (remove the call in zero; pass the registry namespace in a bare `@pyreon/vite-plugin` app) and no-ops, so the page boots cleanly. A registry from `pyreon({ islands: false })` is handled the same way (warn + no-op) instead of throwing. The `registry` argument is now typed as optional.
