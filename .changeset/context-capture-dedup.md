---
'@pyreon/core': patch
'@pyreon/runtime-server': patch
---

`captureContextStack()` now deduplicates: only the topmost frame per context-id is retained in the captured snapshot. Closes the residual snapshot-amplification leak that the `restoreContextStack` reference-identity fix (0.23.0) didn't reach.

## Background

Heap snapshots from 0.21.x showed 1.22 MB / 321k-entry arrays retained by effect closures under deeply-nested reactive boundaries — the live context stack accumulating frames across reactive remounts. The 0.23.0 `restoreContextStack` fix (changing position-based truncation to reference-identity splice) cleaned the LIVE stack, dropping the headline metrics 7-16×.

But the residual remained — heap snapshots still showed **20 arrays at 157 KB each (~40k entries)** retained by effect closures. Root cause: `captureContextStack()` was `[...getStack()]` — a verbatim copy of the live stack at the moment of capture. When that capture landed inside a nested `restoreContextStack` window (the live stack temporarily holds the same context-id pushed by multiple nested effects), the snapshot baked those duplicates in. Each effect's closure then retained them for its lifetime.

## The fix

`captureContextStack()` now walks the stack top-to-bottom keeping only the topmost frame for each context-id. **Semantically equivalent to the verbatim copy** because `useContext()` walks the stack in reverse and stops at the first matching frame — any shadowed frame is unreachable by definition.

```ts
// Before
return [...getStack()]  // 40k entries under deep nesting

// After
// Walk top-to-bottom, keep topmost-per-id frames
const seen = new Set<symbol>()
const reversed: Map<symbol, unknown>[] = []
for (let i = stack.length - 1; i >= 0; i--) {
  const frame = stack[i]
  let unique = false
  for (const id of frame.keys()) {
    if (!seen.has(id)) { seen.add(id); unique = true }
  }
  if (unique) reversed.push(frame)
}
reversed.reverse()
return reversed
// → ~N entries where N = distinct context ids in scope (typically 2-10)
```

## Safety: why this preserves all existing behavior

The naïve "just dedup the array" version would have silently broken SSR. `@pyreon/runtime-server` was using `captureContextStack().length` as a stack-position marker for cleanup (4 call sites) — relying on `snapshot.length === live stack length`. Dedup makes the snapshot shorter, which would have caused SSR cleanup to pop fewer frames than it pushed.

**Pre-requisite fix (also in this PR)**: introduce `getContextStackLength()` — a non-allocating helper that reads the LIVE stack length directly. Migrate the 4 SSR call sites to use it instead of `captureContextStack().length`. After this migration, dedup at capture time has zero observable effect on SSR length bookkeeping.

`restoreContextStack` already removes snapshot frames by **reference identity** (not by position or count) — the cleanup logic works identically against a deduped snapshot.

`@pyreon/runtime-dom`'s `mountReactive` uses the snapshot for restoration only, not for length. Safe to dedup.

The reactivity layer's `setSnapshotCapture` DI hook (used by `_bind`, `renderEffect`, `effect`) passes the snapshot back unchanged into `restore` — no length dependency. Safe to dedup.

## Tests

18 new specs in `context.test.ts`:

- **Dedup behavior** (8 specs): empty stack → empty snapshot; single frame → identical; no duplicates → verbatim; duplicate ids collapse to topmost; deep duplicate-heavy stack collapses correctly; multi-key frames kept if any id is un-shadowed; multi-key frames dropped if all ids are shadowed; useContext returns same value pre/post dedup for arbitrary read patterns.
- **restoreContextStack with deduped snapshots** (2 specs): restoration semantically equivalent; 40-duplicate stack only pushes/pops 1 frame post-dedup.
- **getContextStackLength** (3 specs): returns LIVE stack length not snapshot length; zero on empty stack; matches array length through push/pop cycles.
- **Leak audit regression locks** (2 specs):
  - 1000 snapshots of a 100-frame duplicate-heavy stack retain **1000 total frame references**, not 100,000.
  - 100 snapshots of a 500-frame mixed stack with 50 distinct ids retain **5000 frame references**, not 50,000.

## Bisect-verified

- Revert `captureContextStack` to `[...getStack()]` → **6 dedup-behavior specs + 2 leak-audit specs fail**; 29 pre-existing specs still pass (semantic equivalence preserved).
- Restored → 37/37 context tests, 523/523 `@pyreon/core`, 150/150 `@pyreon/runtime-server`, 681/681 `@pyreon/runtime-dom`, 521/521 `@pyreon/router` — total **1875 tests across affected packages**. Lint + typecheck clean. No lockfile drift. No `TEMP BISECT` remnants.

## Impact

- **Per-snapshot retention drops from O(stack-depth) to O(distinct-ids-in-scope)** — typically 100× reduction on deep trees, the same shape as the bug-report's 800× extrapolation.
- The leak-audit unit tests are permanent regression locks — re-introducing the bug shape fails CI deterministically (no heap snapshot needed).

## Honest scope note

This PR closes the per-snapshot allocation amplification. The orthogonal "snapshots themselves accumulate in proportion to effect count" concern (raised in the analysis) is NOT addressed here — that's an inherent property of the effect-per-component architecture, not a leak. A possible future Map-interning pass could deduplicate identical snapshot ARRAYS via WeakMap, sharing one allocation across multiple effects whose contexts match. Filed as separate work if numbers warrant.
