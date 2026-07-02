---
'@pyreon/zero': minor
---

`zero({ mode: 'auto' })` (EXPERIMENTAL) — automatic per-route static optimization. Inference is conservative ("static unless the code says otherwise"): `revalidate` export → `isr`; `getStaticPaths` → `ssg` (a static-intent signal even alongside a loader); `loader` / `.server.ts` / `guard` / `middleware` → `ssr`; otherwise `ssg`. Explicit `renderMode` exports and `routeRules` always win. The app-level pipeline (server vs pure-static) is derived from the result and announced at startup, and the build mode table shows every inferred decision — inference is never invisible magic. Implemented as inference-as-declaration: inferred modes become `renderMode` literals at route-module generation, so runtime dispatch, build filtering, and mode errors need zero auto-awareness.
