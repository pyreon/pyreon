---
"@pyreon/native-compiler": patch
---

Swift: a signal seeded from a component value-const (`const start = 10; const count = signal(start)`) no longer emits a stored-property initializer referencing a body-local `let` — `cannot find 'start' in scope` under the real-SDK typecheck, warning-free, while Kotlin compiled fine (its `val` shares the function scope). The initializer now runs through the same `inlineValueConsts` machinery struct-level computeds and handler bodies already use for the identical constraint, and an `Any` annotation refines through the component inference context (`signal(start)` → `Int`, derived const chains included) before falling back to object-literal struct resolution.
