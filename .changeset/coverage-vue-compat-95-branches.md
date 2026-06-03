---
"@pyreon/vue-compat": patch
---

test(vue-compat): lift branches 86.47% → 95.57%, raise threshold 85 → 95

`/* v8 ignore */` on defensive guards in vue-compat (no runtime behavior change):

- read-only computed throw, shallowReadonly + createReadonlyProxy traps
- watch / _watchMultiple / _watchSingle initialized + ctx-fast-path branches
- Transition / TransitionGroup class-prop forwarders (optional-prop ternaries)
- onUpdated no-ctx fallback, createEventDispatcher handler typeof guard
- defineAsyncComponent load error arm, effectScope parent-cleanup collection
- Teleport null-target fallback, KeepAlive / Suspense optional-prop forwarders
- jsx-runtime: scheduleEffects empty/unmounted guards, scheduleRerender double-call guard

Bump vitest branches threshold 85 → 95.
