---
'@pyreon/validate': patch
---

`s.union` now accepts the array form `s.union([a, b])` in addition to the rest form `s.union(a, b)`, matching Zod / Valibot / ArkType and staying consistent with `s.tuple([...])` / `s.enum([...])`. Previously the array form was a type error that, if reached at runtime (dynamic construction, `as` cast, plain JS), crashed with a cryptic `member['~standard'] is undefined` deep in the union validator. Non-schema members and unions of fewer than two members now throw a clear `[Pyreon]` error at construction instead of crashing at parse time.

Also: the JIT object codegen no longer emits the redundant `if (r !== undefined || (key in src))` strip-assignment guard for fields whose valid value is provably defined (inline primitives past their type-guard, and freshly-built nested objects/arrays) — smaller generated validators, behavior-identical (locked by the JIT↔interpreter differential fuzz).
