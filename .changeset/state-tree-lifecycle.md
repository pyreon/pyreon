---
"@pyreon/state-tree": minor
---

state-tree: instance lifecycle + integrity (MST parity).

- `.lifecycle(self => ({ afterCreate?, beforeDestroy? }))` — chainable instance lifecycle hooks. `afterCreate` runs once at the end of `.create()` (after all view/action layers; bottom-up for nested field-models); `beforeDestroy` runs on `destroy`. Unknown handler keys throw (typo guard).
- `destroy(instance)` / `isAlive(instance)` — tear down (run `beforeDestroy`, recurse into field-nested children, clear patch listeners + middleware, mark dead; idempotent) and liveness. After `destroy`, actions + schema mutation helpers dev-warn and no-op (a stale handler post-teardown is caught, not silently applied); direct signal writes stay unguarded. `destroy` tears down subscriptions + runs cleanup — it does NOT free memory (signals are GC-reclaimed once unreferenced).
- `clone(instance)` / `getType(instance)` — independent structural copy (snapshot → `def.create()`; re-validated in schema mode) and the producing `ModelDefinition` back-ref.
- `applySnapshot` now RE-VALIDATES in schema mode — a malformed snapshot is rejected through the schema `patch` helper instead of written raw to signals (the schema is the source of truth). Plain mode is unchanged.
