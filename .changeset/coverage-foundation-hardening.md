---
'@pyreon/sized-map': patch
'@pyreon/reactivity': patch
---

Internal: remove two provably-unreachable defensive branches (no behavior change).

`SizedMap.set`'s eviction and `Cell.listen`'s promote-to-Set both guarded a
value that the surrounding invariant guarantees is always defined
(`maxEntries >= 1` ⇒ non-empty map on evict; the promote branch only runs when
a single listener exists). Replaced the dead `!== undefined` / truthy guards
with a documented type assertion (the codebase's sanctioned pattern for
provably-safe paths), eliminating uncoverable branches. SizedMap → 100% branch
coverage; reactivity branch coverage improved. Added selector tests for the
3rd-subscriber and selection-leaves-a-multi-subscriber-key paths.
