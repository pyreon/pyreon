---
"@pyreon/state-tree": patch
---

perf: zero-middleware action fast path + allocation-free ancestor walks

Two allocation reductions on hot paths, both behavior-identical (326 tests unchanged):

- **`runAction`**: skip the `call`-object literal, the `` `/${name}` `` path string,
  and the `dispatch` closure when a model has no middleware (the common case —
  middleware is opt-in). Previously every action call allocated all three only to
  fall straight through to `fn(...args)`. Mirrors `@pyreon/store`'s `wrapAction`,
  which already skips its ActionContext allocation when there are no listeners.
- **`getRoot` / `getPath`**: replace the per-call `Set` cycle-guard with a bounded
  depth counter. `getRoot` runs once per `reference()` read (the hot normalized-
  store path), and the ancestor chain is a tree, so the `Set` only ever guarded a
  cycle that cannot occur in a well-formed tree — a parentless root allocated one
  for a loop that never ran.
