---
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

`setTimeout`, `setInterval`, `clearTimeout` and `clearInterval` now work in iOS and Android code. Before, each was copied into the Swift or Kotlin output as written, and the native build failed with no warning from the compiler.

They lower to a new runtime type, `PyreonTimers`, which behaves like the web. Callbacks run on the main thread. Ids are positive and never reused, so you can keep one in a signal and clear it later. Clearing an id that already fired or never existed does nothing. A timeout is forgotten once it has run. An interval keeps running until you clear it. On iOS, timers keep firing while the user scrolls.
