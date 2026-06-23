---
'@pyreon/compiler': minor
---

`analyzeValidate()` + `emitValidator()` — compile-time specialized validators for `@pyreon/validate` (the build-time analogue of the runtime JIT). `analyzeValidate(code)` reads `s.*` schema definitions from source and parses each into a typed IR (`ValidateSchemaInfo` — `string`/`number`/`boolean`/`literal` primitives with their common checks, plus `object`/`array` composition and `.optional()`); it's conservative — any unrecognized shape becomes an `unsupported` node and the schema's `emittable` flag is false, so a partial understanding never yields a wrong validator. `emitValidator(node)` emits a monomorphic, fully-inlined validator function source for an emittable IR (typia-class straight-line `typeof`/regex/comparison checks — no op-array traversal). Pure, deterministic, TS-compiler-API based; mirrors the `analyzeReactivity` sidecar. Wiring the emit into `@pyreon/vite-plugin` is a follow-up.
