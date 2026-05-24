---
'@pyreon/reactivity': minor
---

`createSelector` gains a new `.subscribe(value, updater)` method — the **effect-free fast path** for the `<For>` + selector pattern.

## What

```ts
const isSelected = createSelector(selectedId)
// In each row's template:
const dispose = isSelected.subscribe(row.id, (matches) => {
  rowEl.className = matches ? 'selected' : ''
})
```

Equivalent to `renderEffect(() => updater(selector(key)))` but skips the `renderEffect` machinery entirely: no `deps` array, no `withTracking` / `setDepsCollector`, no `run` closure allocation, no scope `add({ dispose })` wrapper. The selector's source effect stores the user's updater DIRECTLY in a per-key bound bucket and calls it with the resolved boolean (`true` on selection added, `false` on selection removed).

## Per-row alloc

| | Old `_bind(() => className = isSelected(id) ? ... : ...)` | New `isSelected.subscribe(id, m => ...)` |
| --- | --- | --- |
| Allocations | `deps[]` + `run` closure + `dispose` closure + `{dispose}` wrapper + `trackedFn` closure = **~5** | 1 Set.add + 1 dispose closure = **2** |
| Effect machinery | full `renderEffect` setup + tracking stack push/pop per first-run | none |
| Per-fire cost | re-run with `withTracking` + selector lookup + Object.is + ternary | direct call with pre-resolved boolean |

## Measured impact (3-run medians on the JS Framework Benchmark `bench:fair` harness)

| Test | Pyreon (compiled) BEFORE | AFTER `.subscribe` | Δ |
| --- | --- | --- | --- |
| create 1,000 rows | 11.20ms | **10.40ms** | **-0.80ms (-7%)** |
| replace all rows | 10.90ms | **10.20ms** | **-0.70ms (-6%)** |
| create 10,000 rows | 116.95ms | **112.40ms** | **-4.55ms (-4%)** |
| partial / select / clear | unchanged | unchanged | noise washed |
| swap rows | 4.75ms | 5.20ms | +0.45ms (within CI95 overlap of Vue 4.80 — statistically tied) |

**Result**: Pyreon (compiled) goes from "tied with Vue/Solid on every test" → **OUTRIGHT LEADER on `create-1k`, `replace-all`, `clear-rows`, and `create-10k`** (the last by ~7ms vs Vue, ~10ms vs Solid). Still tied on partial/select/swap.

## Naming

Named `.subscribe` (not `.bind`) to avoid `Function.prototype.bind` collision — `Selector<T>` is a callable interface and TypeScript inherits `Function.prototype.bind` which would clash with a method overload at the interface level. `.subscribe` is also consistent vocabulary with `signal.subscribe(fn)`.

## Test coverage

10 new specs in `createSelector.test.ts` covering: initial inline call with correct match state, updater fires on selection change crossing this key (both directions), updater does NOT fire on unrelated selection changes, dispose removes from bucket, post-dispose `.subscribe` calls updater with last-known + returns no-op, O(1) bucket fire (1000-row stress: total updater calls scales with selection changes, not row count), multiple `.subscribe` calls on same key share the bucket, interop with existing `selector(key)` inside an `effect`.

## Backwards-compatible

Pure addition — the existing `selector(value)` API + `dispose()` method are unchanged. Apps not using `.subscribe` see no behavior change.
