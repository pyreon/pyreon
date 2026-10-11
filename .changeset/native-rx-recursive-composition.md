---
"@pyreon/rx": patch
"@pyreon/native-compiler": patch
---

Lower nested native collection transforms recursively, including namespace and standalone import aliases. Calls such as `rx.take(rx.reverse(ids), 2)` now emit Swift and Kotlin collection operations without trying to invoke an intermediate array. Lexical import recognition preserves local shadows and foreign functions, and incompatible compiler versions receive an upgrade instruction.
