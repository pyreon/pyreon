---
'@pyreon/state-tree': minor
---

Model instances held in array and map fields are now first-class in patches and snapshots.

- A child's patch path and `getPath()` include the element index or key (`/todos/1/done`, previously `/todos/done`).
- A patch for a field holding models carries their snapshots instead of live instances (which serialized to `{}`).
- `applyPatch` walks into array and map elements, and shares one write rule with `applySnapshot`.
- New `arrayOf(Model)` / `mapOf(Model)` field declarations: `create()`, `applySnapshot()` and `applyPatch()` turn element snapshots into instances (reconciled by index or key), so patches and snapshots round-trip, also into a fresh instance. A plain `[] as Model[]` field that holds instances dev-warns once, naming the declaration.
- A `reference()` write now emits a `replace` patch carrying the id and fires `onSnapshot`.
- New `SnapshotIn` type for what `.create()` accepts.

Breaking: patch paths and `getPath()` for array and map children now include the index or key.
