---
'@pyreon/runtime-server': patch
'@pyreon/server': patch
'@pyreon/zero': patch
'@pyreon/vite-plugin': patch
'@pyreon/zero-content': patch
---

perf: kill the `__DEV__` const-alias dev gates — edge/workerd SSR bundles no longer ship dev counters + warnings

A prod-bundle sweep across every published package (fundamentals + ui-system + core, probing minified NODE_ENV=production bundles for dev survivors) found one remaining instance class of the documented `__DEV__`-alias anti-pattern: `const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'` in 6 files. The alias is non-constant under a bundler's define (the `typeof process` prefix stays dynamic on non-Node platforms, and const-aliases don't propagate anyway), so **edge/workerd SSR bundles — which minify these files — shipped every perf counter and dev warning**. `@pyreon/runtime-server` was the worst: 9 counters + the Suspense-timeout warning + the tag-name validator survived in production (−423 B gz / −8% after the fix).

Fixed to the repo-standard bare inline `process.env.NODE_ENV !== 'production'` at every site in: `@pyreon/runtime-server` (14 sites), `@pyreon/server` `handler.ts`, `@pyreon/zero` `isr.ts` + `ssg-plugin.ts`, `@pyreon/vite-plugin`, `@pyreon/zero-content` `config.ts`. Zero behavior change in dev or Node prod (the gate evaluates identically at runtime); the win is bundle-level. Locked by a bisect-verified tree-shake test that bundles the real runtime-server entry for the browser platform (the edge-bundle simulation — `platform: 'node'` masks the bug because esbuild folds `typeof process` there) and asserts counters + dev-warning strings are absent in prod / present in dev. The runtime-server bundle budget is ratcheted down 6,144 → 5,248 B. Everything else in the sweep came back clean — the `[Pyreon]` strings surviving in fundamentals bundles are all legitimate `throw` error paths that must ship.
