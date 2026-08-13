---
"@pyreon/native-compiler": minor
---

PMTC: a mixed Int/Double conditional (`cond ? 1 : 2.5`) now unifies to Double on both native targets — the ternary was typed by its `then` branch alone, so Swift annotated the computed `Int` while its value was `Double` and swiftc rejected it. The Int-typed branch is coerced (`Double(n)` / `(n).toDouble()`) so a non-literal Int branch compiles too.
