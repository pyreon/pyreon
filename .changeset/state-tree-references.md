---
"@pyreon/state-tree": minor
---

state-tree: normalized references & identifiers (closes #1751) — `identifier()` / `reference()` / `resolveIdentifier`.

- `identifier(default?)` — declare which field is a model's id. Plain mode uses it as a field marker (`model({ state: { id: identifier(), name: '' } })`); schema mode names it via config (`model({ schema, identifier: 'id' })`).
- `reference(TargetModel)` — a field that STORES the target's id but RESOLVES to the live node on read. Accessor: `()` resolves, `.set(node | id)`, `.id()`, `.setId(id)`, `.peek()`. Serializes/restores as the id (`getSnapshot`/`applySnapshot`). `ReferenceField` is exported.
- `resolveIdentifier(root, Type, id)` — find a node of `Type` by id in `root`'s subtree (depth-first, cycle-safe; reads owned state, never follows references). The resolver `reference()` uses; useful directly too.

Resolution goes through `getRoot(node)`, so the referencing node + target must share a root. The target type must declare an `identifier()`. O(n) per resolve in v1 (a root id-index is a planned optimization). `reference()` fields are plain-mode (the marker lives in `state`); the target can be schema-mode.
