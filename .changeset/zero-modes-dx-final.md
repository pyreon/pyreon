---
'@pyreon/zero': minor
'@pyreon/create-zero': minor
'@pyreon/lint': minor
---

Zero render-modes DX — the final three roadmap gaps:

- **Build-time ISR auth-read warning** (`@pyreon/zero`): an ISR-mode route whose loader/middleware/guard reads `headers.get('cookie'|'authorization')` without a custom `isr.cacheKey` FUNCTION now gets a loud build/dev warning naming the file and the fix (the runtime already refuses to cache such responses, but only per-request in prod logs). Effective-mode resolution mirrors the file/layout/routeRules/app cascade; a custom `cacheKey` function suppresses it.
- **Scaffolder ISR + typed routes** (`@pyreon/create-zero`): `--mode isr` (and the interactive ISR choice) scaffolds `mode: 'isr', isr: { revalidate: 60 }` and filters the `static` adapter (ISR needs a server); new `--typed-routes` / `--no-typed-routes` flags + prompt (default ON) wire `zero({ typedRoutes: true })` with the generated `src/pyreon-routes.d.ts` gitignored by the template.
- **`pyreon/missing-get-static-paths` is now app-mode-aware** (`@pyreon/lint`): new `appMode` option — `["warn", { "appMode": "ssr" }]` flips the polarity for server apps: undeclared dynamic routes are quiet (they render per-request), and only explicit `renderMode = 'ssg'` declarations (which join the prerender pass) still require `getStaticPaths`.
