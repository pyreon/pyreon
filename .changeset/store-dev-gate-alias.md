---
'@pyreon/store': patch
---

Removed the module-level `const __DEV__ = process.env.NODE_ENV !== 'production'` alias — every dev gate is now the inline bare `process.env.NODE_ENV !== 'production'` check (the bundler-agnostic library convention). The alias is the documented tree-shake-defeating anti-pattern: Vite/Rollup consumers folded through it, but **esbuild and Bun.build consumers shipped every dev-warning string and perf-counter name in production bundles** (`[Pyreon] Store plugin error…`, `store.defineStore`, `store.pluginRun`, …). Measured on the published lib: an esbuild production bundle drops from 5,212 → 4,793 bytes (-8%) with all dev strings eliminated. No behavior change in dev or prod runtime — only dead diagnostic code no longer ships to non-Vite consumers. Locked by a two-layer regression test (source invariant + esbuild-on-published-lib consumer-shape check, bisect-verified).
