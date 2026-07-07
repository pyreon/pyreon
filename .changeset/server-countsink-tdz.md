---
"@pyreon/server": patch
---

Fix an intermittent `ReferenceError: Cannot access '_countSink' before
initialization` during island hydration (an occasional `test (core)` failure).
The perf-counter sink was a module-level `const` read inside the hoisted
`hydrateIsland` function, which — under a concurrent/deferred module-eval race —
could run before the const initialized (temporal dead zone). It now reads
`globalThis` lazily via a hoisted helper (`_count`), which has no
initialization-order dependency and is TDZ-immune. Counter behavior is
unchanged and still fully tree-shaken from production builds.
