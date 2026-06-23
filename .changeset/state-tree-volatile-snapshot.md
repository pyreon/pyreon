---
"@pyreon/state-tree": minor
---

state-tree: volatile state + `onSnapshot` + `onAction` (MST parity).

- `.volatile(self => ({ ... }))` — signal-backed TRANSIENT state: reactive (`self.x()` / `self.x.set()`, strictly typed via a new `TVolatile` generic on `ModelDefinition`/`ModelInstance`) but EXCLUDED from snapshots, patches, and `onSnapshot`. For in-flight flags, drag/hover UI state, live refs (websockets/timers/promises). Reserved-name-checked against state / schema helpers / views / actions / other volatile.
- `onSnapshot(instance, cb)` — MICROTASK-COALESCED snapshot subscription. All writes in one synchronous burst collapse into a single emit on the next microtask (MST-like async); does NOT fire on subscribe; volatile changes don't fire it. Implemented via the patch-write hook (not an `effect()`), so it never fires-on-create and never depends on `getSnapshot`'s untracked `.peek()` reads. Cleared by `destroy`.
- `onAction(instance, cb)` — observe-only action subscription (name/args/path before the call); sugar over `addMiddleware`.
