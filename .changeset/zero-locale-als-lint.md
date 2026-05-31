---
'@pyreon/zero': patch
'@pyreon/lint': minor
---

Per-request locale via `AsyncLocalStorage` + new lint rule `pyreon/no-module-signal-in-server-package` (PR-S7)

**Pattern A from the deep-audit campaign** — module-global state in server context. The `@pyreon/zero` `localeSignal` was a module-level `signal('en')` that the dev i18n middleware wrote per-request via `localeSignal.set(locale)`. Server packages are concurrent — two simultaneous SSR requests with different locales (say `/de/about` + `/cs/about`) race the writes; the later-arriving render's `useLocale()` reads the wrong locale because the module signal is single-instance per process.

**The fix** (Pattern A canonical shape):

1. **Per-request locale store via `AsyncLocalStorage`**: a new `_localeAls = new AsyncLocalStorage<LocaleStore>()` tracks the locale per-request. The middleware wraps the rest of the request in `_localeAls.run(perRequestStore, next)` — `AsyncLocalStorage` propagates through async hops (Vite middleware chain, ssrLoadModule, Pyreon handler, render), so every downstream `useLocale()` call reads the right store.
2. **`useLocale()` prefers the ALS store**: server context reads from `_localeAls.getStore()` if present, falls back to the module signal for non-ALS contexts (client, plain test harness without middleware).
3. **`setLocale()` writes to the ALS store** when one is active, otherwise writes the module signal (CSR contract).
4. **Module signal stays exported** as a CSR contract + best-effort fallback. The browser is single-threaded — the module signal is fully authoritative there. On the server it's now a fallback, not the source of truth.

**New lint rule `pyreon/no-module-signal-in-server-package`** (architecture, error) catches the bug class at edit time. Flags `export const X = signal(...)` (or `computed(...)`) at module scope in source files matching the server-package roots (`packages/zero/zero/src/`, `packages/core/server/src/`, `packages/core/runtime-server/src/`). Detects both `signal` and `computed` calls; ignores nested-function-scope signals (per-call allocation = no race). Test files and configurable `exemptPaths` directories are skipped. `additionalPaths` option extends the default set for out-of-tree consumers. No auto-fix — the right shape depends on the call site (ALS vs context vs closure capture).

**Regression coverage**: 4 new tests in `i18n-routing.test.ts` under `PR-S7: useLocale per-request isolation` (concurrent-request isolation, ALS-precedence, ALS-ignores-module-signal-writes, setLocale-writes-to-ALS); bisect-verified — reverting `i18n-routing.ts` fails 3 of 4 (the 4th is a fallback sanity check that passes either way). 7 new tests in `rule-batch-2.test.ts` for the lint rule (top-level + non-export + computed + nested-function-skip + non-server-package-skip + test-file-skip + exemptPaths + additionalPaths). All 71 zero i18n tests pass; all 903 lint package tests pass.

**Monorepo audit** found one additional Pattern A instance (`@pyreon/zero/src/theme.tsx` — `theme` + `_osPrefersDark` module signals). Exempted in `.pyreonlintrc.json` with a follow-up audit note — the theme system currently has `setSSRThemeDefault` set at server startup, so the race doesn't materialize today, but a future PR should refactor it to per-request ALS for consistency.

**No public API change**: `useLocale` / `setLocale` / `localeSignal` keep their existing signatures. The `_runWithLocale` ALS helper is `@internal` (exported only for regression tests).
