---
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

`slice` with a bound held in a variable now behaves like JavaScript on iOS and Android, instead of crashing when the value is negative.

Literal bounds still lower to the platform's own operations (`slice(-2)` → `suffix(2)` / `takeLast(2)`), because the sign is known at compile time. A variable bound took the same path, and `dropFirst` / `suffix` / `drop` / `takeLast` trap or throw on a negative count, while JavaScript reads a negative bound as counting from the end. `slice(n, -m)` did not lower at all. Any bound whose sign isn't known at compile time now goes through a new runtime helper, `pyreonSlice`, which has JavaScript's exact semantics: negative bounds count from the end, bounds clamp, and start ≥ end is empty.
