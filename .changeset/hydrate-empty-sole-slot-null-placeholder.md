---
'@pyreon/runtime-dom': patch
---

Fix a hydration regression from the mid-slot adoption change: an element whose
SOLE child is an accessor that rendered `null` on the server — `<i
class={…}>{() => cond ? null : <X/>}</i>`, which SSR emits as an EMPTY `<i>` with
its range markers elided — came back from hydration with every binding dead.
The class never updated and the slot never mounted, while identity was kept
and no mismatch was reported; only a later flip showed it.

`_mountSlot` hands that case a `null` placeholder by design (both the compiled
ref and the parent's firstChild are null), and the new `isMidSlotText` guard read
`.nodeType` on it. The adopt bind threw, `hydrateComponent`'s catch logged the
error and kept the server nodes, and the element's bindings were orphaned. The
guard is now null-safe. Found by the compiled-path parity fuzz the day after the
regression shipped; locked by `hydrate-empty-sole-slot.test.tsx` (real
`transformJSX`, bisect-verified: the guard reverted fails with the swallowed
`console.error` and `expected 'off' to be 'on'`).
