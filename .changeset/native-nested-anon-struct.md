---
"@pyreon/native-compiler": minor
---

Nested anonymous-object literals now synthesize nested structs/data-classes on both native targets. A nested object field (`signal({ name, meta: { … } })`) or an array of nested objects previously degraded the outer object to `Any` on Swift / an invalid tuple on Kotlin; each all-scalar-leaf level now gets its own synthesized struct named `Parent` + capitalized-field (e.g. `CProfile` + `meta` → `CProfileMeta`), so the whole shape compiles.
