---
'@pyreon/hooks': patch
'@pyreon/http': patch
'@pyreon/store': patch
'@pyreon/validate': patch
'@pyreon/a11y': patch
'@pyreon/i18n': patch
'@pyreon/code': patch
'@pyreon/feature': patch
'@pyreon/validation': patch
'@pyreon/form': patch
'@pyreon/reactivity': patch
'@pyreon/router': patch
'@pyreon/server': patch
'@pyreon/virtual': patch
'@pyreon/sync': patch
'@pyreon/zero-content': patch
'@pyreon/core': patch
'@pyreon/charts': patch
'@pyreon/hotkeys': patch
'@pyreon/zero': patch
'@pyreon/mcp': patch
---

Documentation-only: filled in manifest `api[]` gaps against each package's real `src/index.ts` exports. No runtime behavior changes.

Notable additions: `@pyreon/hooks`'s 10 web-half hooks that had no manifest entry (`useGeolocation`, `useMap`, `useWebSocket`, `useAuth`, `usePush`, `usePayments`, `useDatabase`, `useCrashReporter`, `useAppState`, `setCrashTransport`); `@pyreon/http`'s typed error hierarchy, URL/transport utilities, and `defineEndpoint`; `@pyreon/router`'s active-router, link-classification, redirect-safety, and loader-serialization utilities; `@pyreon/reactivity`'s `registerSingleton`/context-owner APIs and `defineCrossModuleState`; `@pyreon/core`'s `Defer`, `registerErrorHandler`/`reportError`, `isClient`/`isServer`; `@pyreon/zero`'s theme system, locale runtime, `Meta`, typed-routes codegen, and `generateRssFeed`; `@pyreon/zero-content`'s remaining docs components (`Details`, `Tabs`, `PropTable`, `APICard`, `CompatMatrix`, `PackageBadge`, `Mermaid`, `Math`, `Sidebar`, `Breadcrumbs`, `PrevNext`, `Toc`, `Playground`, `Search`/`useSearch`, `getEntry`/`getEntries`); `@pyreon/form`'s `<Form>`/`<Submit>` components; smaller additions to `@pyreon/store`, `@pyreon/validate`, `@pyreon/validation`, `@pyreon/a11y`, `@pyreon/i18n`, `@pyreon/code`, `@pyreon/feature`, `@pyreon/charts`, `@pyreon/hotkeys`, `@pyreon/virtual`, `@pyreon/sync`, and `@pyreon/server`.

Also corrected an inaccurate claim in `@pyreon/zero`'s `i18nRouting` manifest entry: it said components read the detected locale via `createLocaleContext`, but nothing in the framework reads `req.__localeContext` back out today — the working app-facing API is `useLocale()`/`setLocale()`. Verified `@pyreon/reactivity`'s `onCleanup` documentation is accurate (not outdated as initially suspected) via `effect.test.ts`'s explicit "onCleanup outside an effect is a silent no-op" test.

`packages/tools/mcp/src/api-reference.ts` is the generated output of `bun run gen-docs` reflecting the above.
