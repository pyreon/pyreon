---
'@pyreon/zero': patch
---

Fix `node:async_hooks` "externalized for browser compatibility" warning in consumer client builds

`i18nRouting()` (a server-only Vite plugin) held the dynamic
`await import('./i18n-routing-als')` (the ALS module statically imports
`node:async_hooks`), and it lived in `i18n-routing.ts` — which is
client-safe and reachable from the main entry via `useLocale` / `setLocale`.
A dynamic import always produces a code-split chunk, so Vite/Rolldown emitted
the `i18n-routing-als` chunk in a consumer's CLIENT build and warned about
`node:async_hooks` (runtime-safe — the browser never loads the server-only
chunk — but noise + a dead chunk).

Moved `i18nRouting()` and its `parseCookies` helper into a new server-only
`i18n-routing-plugin.ts`, exported only from `@pyreon/zero/server` (where the
plugin was already documented to live). `i18n-routing.ts` stays client-safe
with no `node:async_hooks` reference, so the client graph never reaches the
dynamic-import site and the warning is gone. No public API change —
`i18nRouting` is still imported from `@pyreon/zero/server`.
