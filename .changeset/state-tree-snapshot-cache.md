---
"@pyreon/state-tree": patch
---

`getSnapshot` now caches its result (MST-aligned) — repeated calls on an
unchanged instance return the same object instead of rebuilding it every time.

Previously `getSnapshot` walked every field and re-serialized on every call;
MobX-State-Tree backs its snapshot with a computed and returns a cache read for
an unchanged node. Pyreon now caches the built snapshot on the instance meta and
invalidates it on every write — leaf writes via the always-on `afterSet` hook,
nested-child writes via `emitPatch` (reached unconditionally through the parent's
`onPatch` registration), and reference-id writes via a new reference write hook
(reference ids are serialized by getSnapshot but written through a plain signal
that bypasses the other two paths). `onSnapshot`'s microtask emit benefits too.

Structurally: N repeated `getSnapshot` calls on an unchanged instance go from N
rebuilds to 1. Behavior change (MST-aligned): the returned snapshot is now the
same object across calls until the next write — treat it as immutable.
