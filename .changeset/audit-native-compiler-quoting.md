---
'@pyreon/native-compiler': minor
---

PMTC audit fixes: every emitted Swift/Kotlin string literal goes through one target-language quoter (`$` is escaped for Kotlin — a `'due: $total'` literal beside a signal read the signal on Android; control characters are legal on both targets; a literal `\(` in JSX text no longer becomes a live Swift interpolation). String-literal-union enum cases, quoted object keys and Kotlin named arguments are valid identifiers (`'top-left'` → `topLeft = "top-left"` / `` `top-left` ``, Swift structs gain `CodingKeys` so JSON keys round-trip). `parseInt(s, radix)` honours the radix, and a Double string-concat operand prints as JS does (`'pct=' + 250.0` → `pct=250`).
