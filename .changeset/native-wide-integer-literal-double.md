---
'@pyreon/native-compiler': patch
---

Native: a whole-number literal outside the 32-bit range, such as `3000000000` or an epoch-millisecond timestamp, is now written as a Double literal on iOS and Android (`3000000000.0`), including when negative. Every typing pass already treated such a literal as a Double, but the emitters wrote it as an integer: Swift `3000000000`, Kotlin `3000000000L`. So `const big = 3000000000; String(big)` failed to compile on iOS, and a signal seeded with one held an integer.
