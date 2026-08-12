---
"@pyreon/state-tree": patch
---

fix(state-tree): array/object-held model children now propagate mutations to the parent's `onPatch`/`onSnapshot` and are torn down by `destroy`

The headline composition pattern — `state: { todos: Todo[] }` — reached the tree via the parent-tracking scan, which set only the child's parent pointer. Field-nested children (`state: { child: Todo }`) were additionally wired for upward patch propagation and added to the parent's teardown set; array/object children were not. So a mutation INSIDE a child (`self.todos()[0].toggle()`) silently:

- never fired the parent's `onPatch`,
- never fired the parent's `onSnapshot` — so a `onSnapshot`-driven persist/sync went **stale**,
- and was never torn down by `destroy(parent)` — a `beforeDestroy` timer/listener on an array child leaked.

Array/object model children are now wired for upward propagation the same way field-nested children are (patch path prefixed with the field key). Because the parent-tracking scan runs on every `.set`, the wiring is disposed and re-created per re-`.set` — with the previous set's propagation listeners disposed and its children removed from the teardown set first — so a persisting child never accumulates listeners (Class-D guard) and `destroy` never tears down instances no longer in the tree. Field-nested children are untouched (no double-wire). Bisect-verified (all manifestations fail with the wiring neutralized while the field-nested path stays green), including a listener-pile-up leak guard.
