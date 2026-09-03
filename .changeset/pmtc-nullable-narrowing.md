---
'@pyreon/native-compiler': patch
---

PMTC narrows a nullable struct through a null compare on Swift. `(r: Range | null) => { if (r === null) {…} else { r.start } }` lowered to `if r == nil {…} else { r.start }`, a Swift type error (Swift never narrows an optional through a nil compare; Kotlin smart-casts). The optional-condition classifier now recognises `x === null` / `x !== null` on an optional identifier, the Swift `if` binds (`if let x`) on both polarities — swapping the bodies for `=== null` — and a narrowing ternary (`r === null ? '' : String(r.start)`) lowers to `r.map { r in … } ?? …`. The Kotlin emit is unchanged.
