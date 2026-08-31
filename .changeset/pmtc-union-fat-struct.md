---
'@pyreon/native-compiler': minor
---

A discriminated union of object shapes lowers to a fat struct.

`type DrawCmd = { kind: 'rect'; … } | { kind: 'line'; … }` synthesizes ONE
struct / data class: the union of every branch's fields, required where a
field appears in all branches with the same type, optional (nil / null
defaulted) elsewhere. That is the representation that lets a heterogeneous
command list share one array on Swift and Kotlin — per-variant structs have
no common supertype and tuples have different arities, which is why each
variant literal previously fell back to a tuple and the whole list failed to
compile.

The emitters needed no changes: optional struct fields already default so a
subset literal compiles, and the struct-selection subset rung already
resolves such literals. A field with genuinely different base types across
branches bails by name rather than merging to `Any`; a field optional in one
branch and required in another merges optional.

Measured against `@pyreon/charts`' plot engine, whose `DrawCmd[]` was the
blocking shape for native chart rendering.
