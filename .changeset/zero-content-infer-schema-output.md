---
'@pyreon/zero-content': minor
---

`@pyreon/zero-content/schema` exports `InferSchemaOutput<S>` in place of its local `StandardSchemaV1` namespace, and re-exports the official `StandardSchemaV1` from the types-only `@standard-schema/spec` (a new dependency). This fixes `entry.data` typing: the generated `.pyreon/content-types.d.ts` used `StandardSchemaV1.InferOutput`, which resolved to `unknown` for every schema (zod, valibot, arktype, `@pyreon/validate` and the built-in `blogSchema`); it now emits `InferSchemaOutput`, which reads `~standard.types.output` or the success branch of `validate`. The frontmatter schema guard also accepts a callable schema (ArkType). The generated file is rewritten on the next dev or build run.

Migration: import `InferSchemaOutput` instead of `StandardSchemaV1.InferOutput` from `@pyreon/zero-content/schema` if you used it directly.
