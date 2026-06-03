---
"@pyreon/server": minor
---

feat(server): export `island()` from the client-safe `@pyreon/server/client` subentry

`island()` is fully client-safe (it only renders the `<pyreon-island>` marker via
`h()` and encodes props), but it was only exported from the `@pyreon/server`
*main* barrel — which also re-exports `createHandler` / `prerender`. Those pull
`node:fs/promises` / `node:path` / `node:async_hooks` plus the package's
`registerSingleton`, so `import { island } from '@pyreon/server'` in any
client-bundled file dragged the entire server module into the browser/route
bundle. In a `@pyreon/zero` app — where **every route ships to the client** — that
made islands unusable: the SSG build aborted with a duplicate-`@pyreon/server`
singleton-sentinel error (the route chunk's bundled copy is a second `@pyreon/*`
instance, registered outside the SSG plugin's `withSilent` scope), and even when
forced past it the dual `@pyreon/core` instance split the context graph so the
hydrated island crashed (`Cannot read properties of undefined (reading 'ref')`).

`island` (and its `IslandOptions` / `IslandMeta` types) are now also exported
from `@pyreon/server/client`. Import islands from there in client/route code:
`import { island } from '@pyreon/server/client'`. The `@pyreon/server` main
barrel export is unchanged (correct for server-only declaration files). The
`check-client-bundle-node-imports` gate now walks `/client` so it can never
regress to transitively pulling a `node:` import.
