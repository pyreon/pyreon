---
'@pyreon/compiler': minor
---

`@pyreon/compiler` auto-promotes `selector(key) ? a : b` ternaries in className/attr bindings to the effect-free `selector.subscribe(key, m => ...)` fast path.

## What

```tsx
// Author writes the canonical idiomatic shape:
const isSelected = createSelector(selectedId)
;<For each={rows} by={(r) => r.id}>
  {(row) => <tr class={() => isSelected(row.id) ? 'selected' : ''}>...</tr>}
</For>
```

Compiles to:

```js
const __d0 = isSelected.subscribe(row.id, (m) => {
  __root.className = (m ? 'selected' : '')
})
```

Instead of the previous (still-correct, slower):

```js
const __d0 = _bind(() => {
  __root.className = isSelected(row.id) ? 'selected' : ''
})
```

## Per-row alloc

| | Old `_bind(() => …)` | New `isSelected.subscribe(...)` |
| --- | --- | --- |
| Allocations | `deps[]` + `run` closure + `dispose` closure + `{dispose}` wrapper + `trackedFn` closure = **~5** | 1 Set.add + 1 dispose closure = **2** |
| Effect machinery | full `renderEffect` setup | none |
| Per-fire cost | `withTracking` + selector lookup + Object.is + ternary | direct call with pre-resolved boolean |

The perf win from `@pyreon/reactivity` `0.13.0`'s `.subscribe` API now accrues to every existing app that writes the canonical `<For>` + `createSelector` pattern — no API change, no migration.

## Bail catalog (conservative — uncertain ⇒ no promotion)

Falls back to the existing `_bind(...)` shape when:
- The selector identifier is NOT a known `createSelector()` result (tracked at module scope; function-scope `const` declarations follow the same rules as `signal()` auto-call)
- The selector call has 0 or 2+ arguments (not the standard shape)
- The key expression contains a reactive read (would freeze the key at first mount)
- Either branch contains a reactive read (the promoted updater only re-fires on selection change)
- The expression is NOT a ternary (handled by the existing pipeline)

Plain member access in the key (`row.id`, `item.deep.path.id`) is preserved literally — `row` is a stable `<For>` callback parameter, safe to use as a subscription key.

## Dual-backend parity

Implemented byte-for-byte in BOTH the JS path (`packages/core/compiler/src/jsx.ts`) and the Rust native path (`packages/core/compiler/native/src/lib.rs`). 9 new cross-backend equivalence specs cover the promotion-positive shapes + the full bail catalog; production users on the Rust binary (3.7-8.9× faster compiler) get the win immediately.

## Test coverage

- 12 JS-path specs in `selector-subscribe-promote.test.ts`: canonical shape, bare (no-arrow) form, dispose binding shape, every bail in the catalog, deep key expressions, setAttribute-style attrs (aria-current, data-*).
- 9 cross-backend equivalence specs in `native-equivalence.test.ts`: bisect-verified-with-restore (disabling the Rust emission branch fails 4 of 9 with the exact `_bind(...)` vs `.subscribe(...)` drift).
- Real-corpus: `examples/benchmark/src/impl/pyreon.tsx`'s `class={() => isSelected(row.id) ? 'selected' : ''}` confirmed to auto-promote through both backends, byte-identical output.

## Backwards-compatible

Pure compiler optimization. No runtime API change. Apps that don't use `createSelector` see no behavior change. Apps that DO use it see lower per-row allocation + the existing `selector.subscribe(...)` API surface (added in `@pyreon/reactivity` `0.13.0`) ships with full runtime semantics — promoted code is equivalent to the hand-written form.
