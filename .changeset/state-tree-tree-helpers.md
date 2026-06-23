---
"@pyreon/state-tree": minor
---

state-tree: tree-traversal helpers — `getParent` / `getRoot` / `getPath` / `isRoot` / `hasParent`.

A model instance gets a tree **parent** when it's written into another model's state — as a field value, an **array element**, or a plain-object value. Parent tracking runs on the initial value AND every subsequent tracked-signal write (an always-on `afterSet` hook, not listener-gated), so array-held children (the headline `todos: Todo[]` shape) are tracked the same way field-nested children are — not field-nested-only.

- `getParent(node)` → the instance `node` is attached under, or `undefined` for a root.
- `getRoot(node)` → walk to the top of the tree.
- `getPath(node)` → JSON-pointer path from the root (field keys; `""` for a root).
- `isRoot(node)` / `hasParent(node)` → booleans.

All throw on a non-model-instance. v1: `getPath` carries field keys not array indices; a node removed from an array keeps its last parent until GC; auto-attachment is one container level deep. (References / identifiers build on these and land next — #1751.)
