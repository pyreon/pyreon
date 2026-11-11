---
'@pyreon/reactivity': minor
---

Add `snapshot(value)`: a plain, non-reactive deep copy of a store (or of any value holding stores) for `structuredClone`, `postMessage`, logging and history. It reads the raw targets, so it tracks nothing and allocates no per-property signals; plain objects and arrays are copied and store proxies unwrapped at every depth, other objects (class instances, `Map`, `Set`, `Date`, `markRaw`) are kept by reference, and shared references and cycles are preserved.
