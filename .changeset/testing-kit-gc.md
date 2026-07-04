---
'@pyreon/testing': minor
---

`@pyreon/testing` gains the GC / leak matchers. `expectGarbageCollected(factory)` collapses the hand-rolled `WeakRef` + two-pass-`gc()` ceremony into one call; `expectNoReactiveLeak(action)` asserts that a mount+unmount (or any action) leaves no net new nodes in the reactive graph after GC — catching the subscription/effect-scope retention leak class. Both require `--expose-gc` (`execArgv: ['--expose-gc']` in the vitest config) and throw an actionable error when it's absent rather than silently passing.
