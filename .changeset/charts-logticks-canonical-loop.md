---
"@pyreon/charts": patch
---

`logTicks` walks its exponent range with a `while` loop instead of a compound-condition `for` head. Web behavior is byte-identical; the change keeps the function inside PMTC's canonical loop subset so the native-emitted engine retains the loop body instead of warn-dropping it.
