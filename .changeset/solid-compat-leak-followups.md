---
'@pyreon/solid-compat': patch
---

fix(solid-compat): createResource stale-resolution race + createStore per-path signal map unbounded growth (#733 follow-up)

Closes 2 of the 4 MEDIUM patterns disclosed in #733's audit byproducts.

### 1. `createResource` — Class F stale-resolution race (#730 charts/storage shape)

`fetchPromise` was overwritten on refetch with no signal to the OLD
promise's handlers. When the OLD promise (e.g. SLOW response) settled
AFTER a FAST refetch had already resolved, its `setData(oldVal)` /
`setError(oldErr)` clobbered the newer value. Same exact shape as
#730's charts/storage inflight-promise bug.

Fix: version-tracking. Each `doFetch()` bumps a counter; the
resolve/reject handlers compare their captured version against the
current one. Stale resolutions are silently discarded.

`AbortSignal` is the upstream solution for `fetch()` callers, but
we don't own the fetcher — version-tracking is the correct generic
fix that doesn't require user cooperation.

### 2. `createStore` — Class C unbounded per-path signal map

`signals.Map<path, signal>` grew by one entry per UNIQUE read-path
string for the store's lifetime. Stores with dynamic key spaces
(dictionaries, pagination, log streams) leaked one signal per key
ever accessed: e.g. `store.items[0]` through `store.items[100000]`
produced 100k signal entries.

The fix is correctness-preserving: a subscriber-aware sweep runs
after `updateRaw()` once the cache crosses a threshold (256). The
sweep walks all entries and evicts any whose `_s` (subscriber set)
AND `_d` (direct-updater set) are both empty — i.e. truly unused
because the effect / DOM binding that read this path has since
disposed. The next read for an evicted path lazily re-creates a
fresh signal with the current value; correctness preserved.

A simple LRU cap would NOT work here — evicting a signal that an
active effect still tracks would silently break reactivity (the
effect wouldn't re-run on subsequent updates because the new
signal it'd lazily get on the next read has different identity).

The fix uses Pyreon's internal `_s` / `_d` subscriber-set fields —
same fields `trackSubscriber` populates and effect disposal removes
from. A non-empty either means at least one live effect / DOM
binding still depends on this signal.

Threshold is gated so the O(N) sweep fires at most once per
write-after-threshold, NOT on every write — small stores with
static key sets pay zero overhead.

### Regression tests + bisect

`packages/tools/solid-compat/src/tests/leak-repro.test.ts` (4 specs):

1. **createResource SLOW + FAST refetch — FAST wins, SLOW ignored**.
   Manual promise resolvers control ordering. Bisect-verified:
   removed `if (myVersion !== fetchVersion) return` from both
   then/catch handlers → spec fails with `expected 'SLOW' to be
   'FAST'`. Restored → passes.
2. **createResource latest value survives a stale rejection**. SLOW
   rejects AFTER a FAST resolves. Bisect-verified: spec fails with
   `expected Error: BOOM to be undefined`. Restored → passes.
3. **createStore signal map shrinks after subscriber-less reads**.
   500 ad-hoc reads → cache pre-sweep ~500 entries → write triggers
   sweep → cache <100 entries. Bisect-verified: disabled the
   `sweepUnusedSignals()` call in `updateRaw` → spec fails with
   `expected 501 to be less than 100`. Restored → passes.
4. **createStore actively-subscribed signals survive the sweep**.
   Effect tracks `k0`; 300 ad-hoc reads + write fires sweep; the
   effect re-runs with the new value (proving k0's signal wasn't
   evicted because it had a subscriber).

### Validation

- `@pyreon/solid-compat` 218/218 tests pass (+4 new regression specs)
- Lint + typecheck clean
- New `_STORE_SIGNAL_CACHE` symbol export is `@internal` (Symbol.for
  registry — test-only)

### Remaining LOW from #733

- `@pyreon/svelte-compat` ChildInstance preservation discards
  `unmountCallbacks` — separate PR (different package).
- `@pyreon/vite-plugin` per-instance caches eviction on file delete
  — separate PR (different package).
