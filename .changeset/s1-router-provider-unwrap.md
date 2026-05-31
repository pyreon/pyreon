---
'@pyreon/zero': minor
---

fix(zero)!: drop internal RouterProvider from `createApp` — fixes production SSR loader-data drop + cross-request data leak (S1)

**Bug (production SSR only)**: `createServer` calls `createApp({ routes })` ONCE at module init. The returned `App` wrapped itself in `<RouterProvider router={buildTimeRouter}>`. `createHandler` then wraps a SECOND time with the per-request router. `useContext` picks the innermost frame → every `RouterView` / `useLoaderData()` consumer reads the **build-time** router, not the per-request one.

**Symptoms**:
- SSR HTML ships with empty loader sections (loaders write to per-request router; readers see build-time router)
- Concurrent requests cross-contaminate via the shared build-time `_loaderData` Map (request-specific data crosses users)

**Why undetected**: dev `renderSsr` calls `createApp` per-request (masks the bug). SSG `renderPath` calls per-path (masks). Tests passed bare components to `createHandler` (bypassed `createApp`). Only production `createServer` exposed the bug.

**Fix**: `App` is now router-agnostic. The per-request `RouterProvider` lives at every call site:
- `createHandler` (production SSR) — unchanged
- `renderSsr` (dev) — now wraps with `routerInst`
- `renderPath` (SSG) — now wraps with the per-path router
- `startClient` (browser) — now wraps with the client router

**Breaking change**: `createApp` still returns `{ App, router }` for back-compat, but consumers must no longer rely on `App`'s internal RouterProvider — every call site must wrap with `<RouterProvider router={...}>` explicitly. The four shipped call sites are already updated.

Bisect-verified by 2 new regression tests in `app.test.ts`: (1) `loader data reaches RouterView in production SSR via createApp→createHandler`; (2) `concurrent requests with different loaders do NOT cross-contaminate`. Both fail with the source reverted (`expected '...' to contain 'value:loader-output'` / `'who:alice'`).

125/125 e2e tests pass (main + ssg-i18n + ssg-subpath). 1007/1008 zero unit tests pass (1 pre-existing skip). Typecheck + lint clean.
