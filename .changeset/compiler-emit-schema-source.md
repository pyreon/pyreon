---
'@pyreon/compiler': minor
---

Add `emitSchemaSource(node, aliasPrefix?)` — the source-rewrite counterpart to `emitValidator`. It lowers the same `analyzeValidate` schema IR to a tree-shakeable `@pyreon/validate/mini` construction expression (`s.string().email().min(2)` → `string().check(email(), minLength(2))`) plus the set of mini exports it references, with collision-proof aliasing. Powers `@pyreon/vite-plugin`'s `optimizeValidators` "keep chaining, ship tree-shakeable output" rewrite. `analyzeValidate`'s `ValidateSchemaInfo` now also carries the initializer's `start`/`end` character offsets (additive) so consumers can rewrite the schema span in place.
