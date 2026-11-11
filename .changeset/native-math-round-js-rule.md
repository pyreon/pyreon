---
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Native: `Math.round` now gives the same result on iOS and Android, matching the web. Both targets call a new runtime function, `pyreonRound`, which uses JavaScript's rule: a tie rounds toward +Infinity, and NaN, ±Infinity and values that are already whole are returned unchanged. Before this change, Android used `java.lang.Math.round`. Its `Long` result turned NaN into 0 and capped large values at `Long.MAX_VALUE`, so `{ id: Math.round(0 / 0) + 1 }` stored 1 on Android and 0 on iOS, and `Math.round(1e300)` displayed 9223372036854775807. iOS used `floor(x + 0.5)`, which returns 1 for `Math.round(0.49999999999999994)` and gives wrong results above 2^52.
