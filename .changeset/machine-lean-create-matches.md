---
'@pyreon/machine': patch
---

`matches(state)` is now a tracked read plus a comparison. It no longer builds a rest-parameter array, and it still accepts several states. `createMachine` allocates its listener collections on the first `onEnter` / `onExit` / `onTransition` / `onDone` call instead of up front. It also validates transition targets without building key and value arrays, and skips the initial eventless-transition batch when the initial state has no `always`. Behaviour is unchanged.
