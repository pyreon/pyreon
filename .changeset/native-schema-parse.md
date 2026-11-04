---
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/validate': minor
'@pyreon/validation': minor
---

A schema's `.parse(x)` now lowers to iOS and Android when called on a top-level binding (`const Pet = s.object({ … })`, or `zodSchema(z.object({ … }))`). It calls the emitted struct's own `parse`, which returns the validated value or throws, and goes through the same `try`/`catch` handling as a throwing helper: `try` inside a `try` block or a helper that becomes `throws`, and `try!` plus a "terminates the app" warning where nothing catches it. Before, the call was only warned about.

Plugins can now declare a synchronous throwing expression with `ExprEmitter.throwsSync`, which gives it that handling.

On Swift, `PyreonSchemaError` now reads as text (`Field 'sku' violated constraint 'min length 1'`), matching the message Kotlin's error already carried. The message is not the web validator's text. An inline schema's `.parse(x)` and `.parse` on a `discriminatedUnion` binding still warn by name.
