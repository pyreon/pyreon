---
"@pyreon/validation": minor
"@pyreon/validate": patch
"@pyreon/state-tree": patch
---

`@pyreon/validation` is now the single canonical home for the Standard Schema contract. It owns `StandardSchemaV1<In,Out>` (the strict, spec-accurate type — promoted from `@pyreon/validate`'s superior definition), the lax `StandardSchemaLike` accept-type, `StandardSchemaResult<Out>`, and `StandardSchemaIssue` — and `@pyreon/validate` + `@pyreon/state-tree` now IMPORT them instead of re-declaring their own copies (which could drift). `@pyreon/validation`'s `InferSchema` is also now universal across strategies: it resolves the `~standard.types` phantom (zod/valibot/arktype/`s`) AND, for a schema that omits that optional phantom, the `validate` return — so `@pyreon/state-tree`'s `InferSchemaState` delegates to it with no regression. The legacy `StandardSchemaShape` is kept as a deprecated alias. (`@pyreon/zero` + `@pyreon/zero-content` keep their inline duck-typing — they sit above the fundamentals layer and can't depend on a fundamentals package.)
