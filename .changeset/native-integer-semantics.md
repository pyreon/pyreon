---
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

Native integer arithmetic gives the web's results. An integer `+ - *` that left the 64-bit range crashed iOS and wrapped silently on Android; it now gives the web's value, exactly up to 2^63 and saturated beyond. Integer `% 0` no longer crashes (it is 0, NaN's integer value). Bitwise operators are 32-bit as on the web (`3 << 31` is -2147483648), and `>>>` and `~` now lower. `Math.max(...xs)` / `Math.min(...xs)` return ±Infinity for an empty list, so their result is a Double on both targets.
