---
'@pyreon/validate': minor
---

feat(validate): `.catch(fallback)` (resilient parse) + `.readonly()` (freeze + `Readonly<T>`).

Two terminal schema methods from the `s` runtime, matching Zod's surface.

- **`.catch(value)`** — on parse FAILURE, discard the issues this schema produced and return a fallback instead of erroring. The fallback is a static value or a function of the raw input. Terminal regardless of chain position (`.min(3).catch('x')` ≡ `.catch('x').min(3)`). Scoped per-schema: a caught field failure is substituted while a sibling's failure still fails the object. Async-aware — under `parseAsync`, a failing async `.refine` is caught after the Promise settles.
- **`.readonly()`** — `Object.freeze` the parsed output (shallow) and mark it `ShallowReadonly<T>` at the type level. Uses a primitive-safe shallow-readonly mapped type (not the built-in `Readonly<T>`, whose `Readonly<unknown>` resolves to `{}` and would break `Schema<T>` → `Schema<unknown>` assignability).

Both are op-based (no new wrapper classes); a schema carrying either op falls out of the JIT fast path onto the interpreter automatically. 15 new tests, both code paths bisect-verified.
