---
'@pyreon/testing': minor
'@pyreon/store': patch
---

feat(testing): library-specific helper subpaths — `/form`, `/ui`, `/router`, `/store`, `/i18n`, `/toast`, `/query` — each gated on its library as an OPTIONAL peer (the main entry stays dependency-light).

- `@pyreon/testing/form` — `renderForm(() => useForm(...))` (renderHook-style headless harness: `fill` via setFieldValue+touched, `submit` awaits the full handleSubmit pipeline), `fillForm(scope, values)`/`submitForm(scope)` (REAL rendered forms, fields located by accessible LABEL, driven through real input/blur/submit events), `expectForm(form)` fluent assertions (`toBeValid`/`toBeInvalid`/`toHaveFieldError`/`toHaveNoFieldError`/`toBeDirty`/`toBePristine`/`toHaveValues`).
- `@pyreon/testing/ui` — `renderWithTheme(ui, { theme, mode })` (PyreonUI wrap + reactive `setMode`, no remount), `expectComputedStyle(el, decls)` + `normalizeCssValue` (computed-serialization value normalization — `'red'`/`'#ff0000'`/`'rgb(255, 0, 0)'` compare equal in a real browser; happy-dom limits documented honestly).
- `@pyreon/testing/router` — `await renderWithRouter(ui, { routes, route })` (initial route SETTLED before mount: lazy components + loaders pre-resolved via `router.preload`, so `useLoaderData()` is populated on first render; `navigate()` resolves after guards+loaders+DOM commit with the `NavigationResult`), `expectRouter(router).toBeAt('/posts/:id')` (pattern OR concrete path).
- `@pyreon/testing/store` — `installStoreReset()` (afterEach `resetAllStores`) + `withFreshStore(useStore, fn)` (scoped guaranteed-fresh singleton, disposed after — sync/async/throw-safe) + re-exported `resetStore`/`resetAllStores`.
- `@pyreon/testing/i18n` — `renderWithI18n(ui, { locale, messages })` with reactive `setLocale` + a bound `t()`.
- `@pyreon/testing/toast` — `expectToast`/`findToast`/`getToasts`/`clearToasts` (store-level: work headless or with a mounted `<Toaster>`; type filter + soft-dismiss awareness).
- `@pyreon/testing/query` — `renderWithQueryClient(ui, { client? })` + `createTestQueryClient()` (fresh isolated client per test, `retry: false`, `gcTime: Infinity` — the TanStack testing convention) + `setQueryData` passthrough.

Every render harness accepts a `wrapper` option so providers COMPOSE (theme+router+query together) — deliberately no mega `renderApp`. Assertions follow the package's fluent convention (`expectSignal` precedent), never `expect.extend`.

`@pyreon/store` fix (load-bearing for the isolation helpers, and a standalone leak fix): `resetStore(id)` / `resetAllStores()` now DISPOSE the store — stop its effectScope (setup/plugin computeds + effects) and run plugin cleanups — before dropping the registry entry. Previously a reset orphaned the entry while its scope kept firing on external signals forever (leak class B). Foreign registry values (custom `setRegistryProvider`) degrade to the old plain delete.
