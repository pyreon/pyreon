---
'@pyreon/validate': patch
---

Export the schema wrapper classes (`OptionalSchema`, `NullableSchema`,
`NullishSchema`, `DefaultSchema`, `TransformSchema`, `PipeSchema`,
`PreprocessSchema`, `SuperRefineSchema`, `NonOptionalSchema`) from the package
entry.

`.optional()` is public API and its return type had no public name, so any
consumer that EXPORTED a schema using it hit `TS2883: the inferred type of 'X'
cannot be named without a reference to '.../core/schema'`. The classes were
already exported from their module and already in the bundle; only the
re-export was missing, so this costs nothing at runtime.

Found while generating schemas with `@pyreon/lathe`, where every emitted
`export const X = s.object({ … })` with an optional field tripped it.
