---
'@pyreon/store': patch
'@pyreon/storage': patch
'@pyreon/url-state': patch
---

Apply `defineCrossModuleState` to module-level state in `@pyreon/store`, `@pyreon/storage`, and `@pyreon/url-state` so duplicate-instance scenarios share the SAME state.

- `@pyreon/store`: `registry.ts` (defaultRegistry + provider), `devtools.ts` (listeners), `index.ts` (plugins)
- `@pyreon/storage`: `registry.ts` (signal registry), `local.ts` (cross-tab refcount + listener), `cookie.ts` (server cookie source), `indexed-db.ts` (DB cache)
- `@pyreon/url-state`: `url.ts` (router reference)

Critical sharing wins: `setStoreRegistryProvider(als-backed)` on one instance now affects every instance (per-request SSR isolation works regardless of which instance the call resolved to); `useStorage('theme')` across instances shares the SAME signal so cross-tab events route to all consumers; `setCookieSource(req)` propagates across instances during SSR.

Byte-identical behavior; tests pass unchanged.
