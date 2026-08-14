---
"@pyreon/native-compiler": minor
---

PMTC: a mixed String/non-String `+` now concatenates on both native targets.

JS `+` where either operand is a string is string concatenation (`"count: " + 5 === "count: 5"`), but native has no such implicit coercion, so a shared `.tsx` using this everyday shape failed to compile. `"count: " + n()` emitted Swift `"count: " + n` → *binary operator '+' cannot be applied to operands of type 'String' and 'Int'*; the mirror `n() + " items"` failed the same way. Kotlin's `String.plus(Any?)` coerced a right-hand non-string so `"count: " + n` happened to compile there, but the left-hand form (`Int.plus(String)`) had no candidate and failed — so the two targets diverged and one whole idiomatic concat shape was uncompilable.

`inferType` already types a string-concat `+` as `string`; only the emit lacked the coercion. Both backends now coerce each concrete non-string operand of a string-concat `+` — Swift `String(...)` (Int/Double/Bool conform to `LosslessStringConvertible`), Kotlin `(...).toString()` — regardless of operand order. A purely numeric `+` is untouched (arithmetic handling unchanged), and a `string + <unknown>` leaves the unknown operand alone.
