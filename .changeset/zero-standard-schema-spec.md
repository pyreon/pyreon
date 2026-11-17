---
'@pyreon/zero': minor
---

`StandardSchemaV1` from `@pyreon/zero/actions` is now the official type from the types-only `@standard-schema/spec` package (a new dependency) instead of a local copy; its shape is the same. `validateEnv` now accepts a callable Standard Schema (an ArkType `type(...)`), which it previously rejected as "Invalid schema value", and both `validateEnv` and `defineAction` share one runtime guard. A Standard Schema entry passed to `validateEnv` is now typed `StandardSchemaV1`, so a hand-written schema object must declare `version: 1` and `vendor`.

Upgrade: manual — add `version: 1` and a `vendor` string to any hand-written `~standard` object passed to `validateEnv`; zod, valibot, arktype and `@pyreon/validate` schemas need no change.
