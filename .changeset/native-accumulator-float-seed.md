---
'@pyreon/native-compiler': patch
---

Summing a column in a loop now compiles. `let acc = 0` followed by `acc += it.price` over a Double column did not typecheck on EITHER target — `var acc = 0` is Int — and there was no way to write it correctly, since `0.0` is `Number.isInteger` and reads as an integer literal too; the only workaround was to abandon the loop for `reduce`. An integer-seeded local is now widened to Double when the function provably writes it a fractional value, mirroring what `widenFloatSignals` already did for `signal(0)` and `refineReduceSeedFloats` for a reduce seed. Two halves were needed: marking the literal makes the emitters print `0.0`, but `inferType` ignored the marker and still typed the expression from the value, so the digits changed and the emitted `-> Int` return type did not. Additive — an integer accumulator is untouched on both targets.
