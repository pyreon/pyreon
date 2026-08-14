---
'@pyreon/loom': patch
---

`loom build` now forces `NODE_ENV=production` for the build (restoring the caller's value afterwards), so a stray value in the environment can no longer produce a non-production site.

`vite build` sets `NODE_ENV` only when it is UNSET, and Vite derives `isProduction` from that variable — not from `mode`, so passing `mode: 'production'` does not help. Any caller with `NODE_ENV` already set (`development` in a dev shell, `test` under any test runner) therefore got a site with every `process.env.NODE_ENV !== 'production'` branch in Pyreon still in the bundle: dev-only lifecycle warnings shipped to users, and 3894 MB of build memory against 952 MB.

Vite's behaviour is right for a general-purpose command, where `NODE_ENV=staging` may steer a user's own config. Nothing here can — the build runs `configFile: false`, so no user config is loaded and nothing legitimate reads the value, and `loom build` has no dev variant.

This also fixes an intermittent `Coverage (Full)` failure on main: the suite's in-process build inherited vitest's `NODE_ENV=test` and peaked just under node's ~4 GB old-space cap, so the worker died and vitest attributed it to whichever spec was in flight — reported as a failure in `strip-equivalence`, which was innocent. The build now runs as a spawned subprocess (exercising the shipped bin and built `lib/`), and a new spec asserts the emitted bundle is production even though the spawn inherits `NODE_ENV=test`.
