---
"@pyreon/reactivity": patch
---

test(reactivity): lift branches 88.03% → 94.22% via real tests (no v8-ignore)

Added 96 real tests in `branch-coverage-real.test.ts` that exercise actually-uncovered branches via the public API. NO `/* v8 ignore */` annotations — every coverage gain comes from real observable behavior.

Tests cover:

- tracking.ts: cleanupEffect WeakMap path, notifySubscribers non-batching arms
- batch.ts: MAX_PASSES bailout + labelled effects + production-mode gate
- cell.ts: listen promotion, subscribe disposer across _l/_s
- computed.ts: error catch in body, custom-equals short-circuit + throw, direct subscriber promotion-aware disposer
- createSelector.ts: source effect short-circuit on Object.is-equal, dispose, subscribe-after-dispose
- reconcile.ts: circular-source skip, raw-object assign, DANGEROUS_KEYS skip
- scope.ts: addUpdateHook stopped/multi, notifyEffectRan dedup + throw, onScopeDispose no-scope
- signal.ts: direct subscriber tiers, promotion-race disposer, signal-write-as-call warn, trace listener throw
- singleton-sentinel.ts: PYREON_SINGLE_INSTANCE env override (warn/silent/throw), withSilent + withSilentSync refcount, legacy state backfill, negative-depth guard
- lpih.ts: cwd-throw fallback, writeLpihCache + startLpihPolling fail paths, race-during-dispose
- reactive-devtools.ts: same-location collision, host with null subs, JSC stack format, _rdRecordFire on unregistered node, loc-resolution failure skip
- debug.ts: inspectSignal subscriber-count fallback, anonymous-signal label
- reactive-trace.ts: anonymous-function preview fallback
- production-mode gates: dedicated `process.env.NODE_ENV='production'` test suite hitting dev-gate FALSE arms

Adjust vitest thresholds to honest values:

- statements: 95 → 98
- branches: 88 → 94 (was 88 with comment "tracking.ts non-batching effectively unreachable"; sharpened to specifically document the 6 structurally-unreachable defensive arms)
- lines: 94 → 99

The remaining ~6 uncovered branches are structurally unreachable from the public API (notifyDirect non-batching, structurally-dead defensive arms, browser-only typeof process guards). Honestly named in the vitest.config.ts comment rather than papered over with annotations.
