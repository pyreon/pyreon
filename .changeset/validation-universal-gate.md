---
"@pyreon/validation": minor
---

`@pyreon/validation` is now the universal, library-agnostic validation gate. It **owns** the validation contract types (`ValidationError` / `ValidateFn` / `SchemaValidateFn`) and the Standard Schema bridge (`isStandardSchema`, `wrapStandardSchema`, and the new **`standardSchemaToValidator`**), and **no longer depends on `@pyreon/form`** — it has zero pyreon deps. The consumers (`@pyreon/form`, `@pyreon/store`, `@pyreon/state-tree`, `@pyreon/feature`) depend on validation, not the reverse. New exports: `standardSchemaToValidator` (raw Standard Schema → whole-object validator) plus `StandardSchemaLike` / `StandardSchemaResult` / `StandardSchemaIssue` types.
