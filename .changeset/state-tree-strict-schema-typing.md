---
"@pyreon/state-tree": minor
---

state-tree: `model({ schema })` now strictly types the instance from ANY schema passed directly — `@pyreon/validate`'s `s.object(...)`, a raw `z.object(...)`, valibot, arktype, or any Standard Schema — no `@pyreon/validation` adapter wrapper required. The state type is inferred from the schema's `~standard.validate` output (`InferSchemaState`), so `self.name()` is `string` (not `unknown`) even for validators like `@pyreon/validate` that omit the optional `~standard.types` slot. The `zodSchema()` adapter `_infer` path is unchanged.

This tightens the inferred instance type for schema-mode models that previously fell back to the untyped `StateShape` (raw Standard-Schema instances passed without the adapter). Code relying on the old loose typing (e.g. casting `model({ schema: z.object(...) }).create()` to a record) no longer needs the cast.
