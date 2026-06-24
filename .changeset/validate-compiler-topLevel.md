---
'@pyreon/compiler': minor
---

`analyzeValidate` now reports `topLevel: boolean` on each `ValidateSchemaInfo` — true iff the schema is a module-level declaration (`VariableDeclarationList → VariableStatement → SourceFile`). Consumers that emit a module-end `name._attachCompiledVerdict(…)` (the `@pyreon/vite-plugin` verdict pass) use this to skip function/block-scoped schemas, which would otherwise be a ReferenceError at module load. Additive, non-breaking.
