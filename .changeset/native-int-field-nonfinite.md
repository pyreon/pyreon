---
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
---

A whole-valued Double stored into an integer struct field (`{ id: Math.floor(x / d) }`) no longer crashes an iOS app when the value is NaN or ±Infinity at runtime. Swift now converts through the runtime's new `pyreonInt(_:)` instead of `Int(_:)`, which traps on non-finite values. `pyreonInt` has the same semantics as Kotlin's `Double.toLong()`, which the Android output already uses: NaN is 0, ±Infinity and out-of-range values saturate to the integer's max/min, and everything else truncates toward zero. Both targets now store the same value. `Date.now()` is always finite and keeps its direct integer spelling.
