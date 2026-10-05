---
'@pyreon/native-compiler': patch
---

Fix: field, parameter, case and member names that are reserved words no longer produce invalid Swift/Kotlin. `zodSchema(z.object({ operator, where }))` (and every sibling spelling: `s.object`, `defineFeature`, `defineStore`/`model` members, discriminated-union cases, `<For>` item parameters and `by` key paths, Kotlin enum entries `init`/`constructor`) now escapes the name with ONE policy (`swiftIdent`/`kotlinMember`) at the declaration and every access, keeping the JSON key intact (backticked Swift properties synthesize the original `Codable` key; non-identifier keys get `CodingKeys`). Swift's `@Observable` macro rejects backticked properties, so a keyword store/model member is spelled `name_` there. The Swift keyword table also gained `precedencegroup`, `await`, `async`, `unsafe`, `willSet` and `didSet`, which swiftc rejects as identifiers.
