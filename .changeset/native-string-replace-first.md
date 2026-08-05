---
'@pyreon/native-compiler': patch
---

`str.replace(a, b)` now lowers to a FIRST-only replace on both native targets, matching JS. It was previously unmapped, and an unmapped method is emitted verbatim — so one line of shared source produced a hard swiftc error (`missing argument label 'with:'`, no such signature) and a Kotlin build that compiled and quietly replaced EVERY occurrence, with no warning on either. Kotlin now emits `replaceFirst`; Swift an IIFE over `replacingOccurrences(of:with:options:range:)` bounded to the first match, with operands bound as parameters so the receiver is evaluated once. `replaceAll` keeps its replace-ALL mapping. Fixes a sibling gap found alongside: `replaceAll` and `repeat` were missing from the string return-type table, so a helper wrapping either emitted a Swift function returning Void.
