---
'@pyreon/sized-map': patch
'@pyreon/reactivity': patch
'@pyreon/head': patch
---

Internal: remove provably-unreachable defensive branches + harden test coverage
(no behavior change).

`SizedMap.set`'s eviction and `Cell.listen`'s promote-to-Set both guarded a
value that the surrounding invariant guarantees is always defined
(`maxEntries >= 1` ⇒ non-empty map on evict; the promote branch only runs when
a single listener exists). Replaced the dead `!== undefined` / truthy guards
with a documented type assertion (the codebase's sanctioned pattern for
provably-safe paths), eliminating uncoverable branches. SizedMap → 100% branch
coverage; reactivity branch coverage improved. Added selector tests for the
3rd-subscriber and selection-leaves-a-multi-subscriber-key paths.

`@pyreon/head`'s `createNewTag` SSR guard is documented + `v8 ignore`d as the
unreachable defensive guard it is (the only caller, `syncDom`, already returns
on `document === undefined`); added a node-environment test that exercises the
true SSR function-input path of `useHead`. head → 100% statements/functions/
lines, 98.3% branches.
