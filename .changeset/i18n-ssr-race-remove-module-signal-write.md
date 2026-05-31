---
'@pyreon/zero': patch
---

fix(zero): remove racy `localeSignal.set(locale)` from the i18nRouting middleware

PR-S7's first cut closed the IN-ALS race via `_runInLocaleStore` but left a "best effort" `localeSignal.set(locale)` in the dev middleware so DEFERRED readers (effects scheduled inside a request but resolving after the ALS unwinds, post-render hooks, island serialization that outlives `runWithRequestContext`) could fall back to the module signal.

That fallback was racy by construction: two concurrent SSR requests with different locales raced on the same module-global, and "last writer wins" for any deferred reader regardless of which request scheduled the deferred work. A request rendering /en/posts could see `useLocale() === 'de'` from an effect scheduled mid-render that resolved after a concurrent /de/posts request's middleware fired.

The author of PR-S7 acknowledged it in the comment ("Pre-fix this module write WAS the bug") but kept the write for back-compat with non-ALS callers. Identified in the post v0.25.1 framework audit as the remaining surviving race.

**Fix**: drop the module-signal write entirely. The ALS store is the authoritative SSR source. Deferred fallback callers now see the signal's CSR-set value (or initial default) — predictable + race-free, vs the previous "fresh but cross-request-contaminated". The client-side `setLocale()` write still updates the signal (single-threaded, no race on the client). `useLocale()` semantics unchanged: ALS-active → per-request value (race-free); ALS-inactive → module signal (CSR or stale default).

No public API surface change. The middleware's behavior change is internal-only — any deferred SSR reader that previously observed a contaminated locale now observes the signal's last CSR-set value (typically `'en'` on a server with no client-side `setLocale()` calls). User code that intentionally read `useLocale()` from a deferred SSR context was already broken under concurrency; the fix surfaces that explicitly instead of silently corrupting it.

Bisect-verified-with-restore: 3 new regression specs in `packages/zero/zero/src/tests/i18n-routing.test.ts` under "Audit #1: i18nRouting middleware does NOT write to module localeSignal":
1. Single request leaves `localeSignal` at the prior sentinel value.
2. Concurrent requests with different locales leave `localeSignal` at the prior sentinel.
3. Concurrent requests STILL get correct per-request locale via the ALS store (regression — fix must not break PR-S7).

Restoring the `localeSignal.set(locale)` line fails all 3 specs (the third with `expected 'cs' to be 'xx'` — proving cross-request contamination of the module signal). Removing the line → 76/76 i18n-routing specs green + 1069/1069 zero suite green.
