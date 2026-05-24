---
'@pyreon/reactivity': minor
'@pyreon/vite-plugin': patch
'@pyreon/zero': patch
'@pyreon/cli': patch
---

Post-audit fixes for the bullet-proof cross-module-instance architecture (PRs #883/#884/#886/#889). Closes 1 HIGH-severity race condition + 2 correctness bugs surfaced by the deep release-readiness audit.

**1. HIGH — race condition in sentinel opt-out under concurrent `Promise.all`** (`@pyreon/reactivity` + `@pyreon/zero` + `@pyreon/vite-plugin`).

The env-var dance pattern (`process.env.PYREON_SINGLE_INSTANCE = 'silent'` / capture+restore) used by `ssrLoadModuleQuiet`, SSG-plugin's built-handler import, and rocketstyle-collapse's nested-SSR resolver was race-prone under `Promise.all` of N opt-out scopes:

1. Call A: captures `prev=undefined`, sets `'silent'`
2. Call B: captures `prev='silent'` (post-A's write), sets `'silent'`
3. A's `finally` deletes env (prev was undefined)
4. B's `finally` restores `'silent'` ← **leaked permanently**

Effect: the sentinel was silently disabled for the entire dev / SSG / collapse-resolver process lifetime. Bisect-verified with a focused reproducer; the leak fires with 5 concurrent scopes in `renderSsr`.

**Fix**: `@pyreon/reactivity` ships two new exports:
- `withSilent(fn): Promise<T>` — async refcount-based scope. Increments `silentDepth` on the sentinel state, awaits the fn, decrements in `finally`. Order-independent under concurrency.
- `withSilentSync(fn): T` — sync variant.

All three call sites updated to use `withSilent` instead of the env-var dance. The env-var (`PYREON_SINGLE_INSTANCE`) is preserved as the documented user-facing escape hatch for browser extensions / micro-frontends.

`@pyreon/vite-plugin` gains a runtime dep on `@pyreon/reactivity` (rocketstyle-collapse).

**2. BUG — pnpm v9 peer-suffix false-positive duplicate** (`@pyreon/cli`).

`pyreon doctor --check-dedup`'s `_parsePnpmLock` regex parsed `/@pyreon/core@1.0.0(react@19.0.0):` keys with the peer suffix INCLUDED in the version. Two installs sharing the same `1.0.0` but resolved against different peers were counted as TWO distinct versions → false-positive `multiple-versions` finding.

**Fix**: strip the `(...)` suffix when adding to the version set. Build-metadata versions (`1.0.0+build.42` — no `(`) round-trip unchanged. Genuine multi-version dups remain detectable. 3 new regression specs.

**3. BUG — `PYREON_DISABLE_DEDUPE` only triggered on literal `'1'`** (`@pyreon/vite-plugin`).

Users reaching for an escape-hatch env var under stress reach for `true` / `yes` / `on` first. The strict `=== '1'` check silently no-op'd those alternatives — worst-of-both-worlds (escape hatch present but doesn't fire).

**Fix**: `_isTruthyEnv(v)` accepts `1` / `true` / `yes` / `on` case-insensitively. 11 new specs covering both positive (truthy) and negative (falsy / unrecognized) values.

All three fixes are bisect-verified — neutralizing each fails its dedicated test(s); restored passes. Full repo validation: 3,978 tests pass across 10 affected packages (`reactivity` 444, `core` 531, `router` 521, `runtime-dom` 681, `runtime-server` 150, `head` 115, `server` 168, `cli` 177, `vite-plugin` 193, `zero` 998). `pyreon doctor` clean on all changed files. Bundle budgets clean.
