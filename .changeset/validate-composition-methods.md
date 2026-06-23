---
'@pyreon/validate': minor
---

feat(validate): composition shorthand methods — `.array()` / `.or()` / `.and()`.

The Zod-parity chainable composition sugar:

- **`s.string().array()`** ≡ `s.array(s.string())` — `Schema<T> → ArraySchema<T>`.
- **`a.or(b)`** ≡ `s.union(a, b)` — `Schema<T | U>`.
- **`a.and(b)`** ≡ `s.intersection(a, b)` — `Schema<T & U>`.

They chain and nest (`s.string().min(2).array().min(1)`, `s.number().array().array()`) and infer the right output types.

**Implementation — tree-shake-safe, no circular import.** The base `Schema` class can't import the composition classes (that would be a load-order-fragile `extends`-time cycle). Instead it holds a tiny late-bound factory registry (reads only); each composition module self-registers its factory from its export's INITIALIZER (`export const array = registerArrayFactory(fn)`). Rollup must evaluate the initializer to produce the used export — so registration is tree-shake-safe for `s`/composition consumers — yet drops entirely for the DX-helpers-only path (verified against the built lib: `s.string().array()` works; a `withField`-only bundle contains zero composition code). The composition return types are `import type`-only in the base (erased → no runtime dependency). A bare `import { string }` that never references composition throws a clear error directing to import `s`.

14 tests; the base never imports composition as values (the cycle is structurally impossible), and the registration is empirically verified to survive production tree-shaking in `lib/`.
