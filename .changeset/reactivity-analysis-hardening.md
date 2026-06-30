---
"@pyreon/reactivity": patch
---

Reactivity hardening (deep-analysis pass): fix three issues in the reactivity core.

- **`createSelector` promoted-key leak** — `selector.subscribe`'s unsubscribe path deleted the updater from a promoted `boundSubs` Set but never dropped the now-empty key, so any key that ever had ≥2 bound subscribers leaked an empty `Set` for the selector's lifetime. The Set is now removed when its last subscriber leaves (matching the inline-1-subscriber branch).
- **`EffectScope.stop()` owner-chain retention** — `stop()` now nulls `_parent` and `_contexts` alongside `_effects`/`_updateHooks`, so a disposed scope no longer retains its parent chain (and the parent's context Map) when a descendant scope outlives it. A stopped scope is never walked as a context owner, so this is pure GC cleanup with no behavior change.
- **`batch.ts` `MAX_PASSES` silent production drop** — the cap-exceeded warning was dev-only, so production silently dropped queued effects, leaving the reactive graph half-applied. The condition now surfaces a `console.error` in production too.
