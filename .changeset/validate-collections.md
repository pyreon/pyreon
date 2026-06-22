---
"@pyreon/validate": minor
---

Add the remaining composition combinators: `map(key, value)` (native `Map<K,V>`),
`set(value)` (native `Set<V>`), `intersection(a, b)` (must satisfy both; merges object
outputs → `A & B`), and `lazy(() => schema)` (recursive / self-referential schemas).
All strictly type-inferred. This brings the `s` runtime to parity with Zod/Valibot on
composition (only `.required` / `.catchall` and a JIT-codegen fast path remain).
