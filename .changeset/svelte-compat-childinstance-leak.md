---
'@pyreon/svelte-compat': patch
---

fix(svelte-compat): writable.subscribe leak when ChildInstance is preserved across parent re-renders (#733 followup)

Closes the third MEDIUM pattern from #733's audit byproducts.

### The bug

`writable.subscribe()` from inside a compat component's body leaks
one subscriber per parent re-render cycle. The interaction between
two parts of the layer caused it:

1. `index.ts:subscribe` caches the unsub at `ctx.hooks[idx]` AND
   pushes it into `ctx.unmountCallbacks`. On subsequent renders the
   cached fast path fires: `if (cached) { run(v); return cached.unsub }`.

2. `jsx-runtime.ts:170-173` — when a parent re-renders and preserves
   the ChildInstance, the wrapper resets `ctx.unmountCallbacks = []`
   to drop stale cycle-N callbacks before cycle-N+1 begins.

The cached path NEVER re-pushed the unsub into the new (empty)
array. So:

- Initial mount: subscribe → unsub pushed → unmountCallbacks = [unsub]
- Parent re-render: unmountCallbacks reset to [] → child re-runs
  → cached path returns cached.unsub without pushing → still []
- Final unmount: unmountCallbacks loop runs over [] — the original
  unsub is never called — the store's `subs.Set` keeps the
  subscriber forever.

Linear growth: one leaked subscriber per parent re-render cycle per
`writable.subscribe()` call in the child. Long-lived parent + many
re-renders + child stores → unbounded subscription growth on each
affected store.

### Fix

In the cached path, re-push the cached unsub if it's not already
in `ctx.unmountCallbacks`. The `includes` guard is necessary because
in real-app shape, a single child can `subscribe()` to multiple
stores → multiple cached entries → multiple re-pushes per re-render;
without the guard, the array would itself grow by one entry per
subscribe-call per re-render.

### Regression tests + bisect

`packages/tools/svelte-compat/src/tests/child-instance-leak-repro.test.ts`
(2 specs):

1. **Cached subscribe re-attaches unsub after reset** — single
   parent re-render cycle. Asserts `unmountCallbacks.length === 1`
   after the cached path fires, and that post-unmount the subscriber
   is fully cleaned up (no further `run` calls on store writes).
2. **10 parent re-render cycles** — repeats the cycle 10× and
   asserts the array still has exactly 1 entry (the same unsub),
   then asserts post-unmount cleanup is total.

**Bisect-verified**: removed the `ctx.unmountCallbacks.push(cached.unsub)`
re-push → both specs fail with `expected +0 to be 1`. Restored →
2/2 pass.

### Validation

- `@pyreon/svelte-compat` 55/55 tests pass (+2 new)
- Lint + typecheck clean
- No public-API surface change

### Remaining LOWs from #733

- `@pyreon/vite-plugin` per-instance caches eviction on file delete —
  separate PR (next phase of the follow-up sweep).
