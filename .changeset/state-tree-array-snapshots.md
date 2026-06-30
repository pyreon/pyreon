---
'@pyreon/state-tree': patch
---

`getSnapshot` / `applySnapshot` now handle arrays and plain objects of model
instances (the `todos: Todo[]` and `byId: { [k]: Model }` shapes).

Previously `getSnapshot` only recursed into a field whose value was DIRECTLY a
model instance — an array or object of instances serialized the live signal
facades (`[Function …]`) instead of plain data, so list-shaped trees could not
be persisted to JSON, and `applySnapshot` wrote the raw snapshot objects,
replacing the instances with plain data.

Now:
- `getSnapshot` recurses one level into arrays / plain-objects that hold model
  instances → valid serializable data. Arrays / objects of plain values are
  returned as-is (identity preserved — no behavior change for non-instances).
- `applySnapshot` reconciles same-shape instance collections IN PLACE (each
  existing instance is updated from the matching snapshot element / key), so
  the round-trip preserves the model instances rather than overwriting them.

Known limit: length-changing the collection via `applySnapshot` (adding/removing
instance elements) is NOT reconciled — there is no element type to recreate
instances from; use the collection's own mutation methods to add/remove, then
`applySnapshot` to update the contents. (Granular per-element `onPatch`
propagation from instance collections remains a separate v1 limitation.)
