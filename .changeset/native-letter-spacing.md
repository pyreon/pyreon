---
"@pyreon/native-compiler": patch
---

feat(native): lower CSS `letter-spacing` to native (SwiftUI `.tracking` / Compose `letterSpacing`)

Extends the CSS-in-JS → native style mapping with `letterSpacing`, which round-trips exactly 1:1: it is an absolute per-character spacing on both targets (unlike `line-height`, a unitless multiplier on web), so `<Text style={{ letterSpacing: 0.5 }}>` lowers to SwiftUI `.tracking(0.5)` and Compose `letterSpacing = 0.5.sp`. Wired through the typography path with faithful stub entries (`View.tracking`, `Text(letterSpacing=)`) so the validate-against-stubs gate compiles it.
