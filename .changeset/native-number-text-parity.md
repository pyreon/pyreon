---
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Native number-to-text now prints exactly what the web prints. `String(x)` and `'text' + x` used a private helper that printed `1e15` as `1000000000000000.0` (iOS) / `1.0E15` (Android) and `0.000001` as `1e-06` / `1.0E-6`; template literals kept the native exponent form (`1e-07`, `1.0E-7`); and `x.toFixed(d)` rounded differently from the web (`(2.5).toFixed(0)` was `"2"` on iOS, `(1.005).toFixed(2)` was `"1.01"` on Android). All three now go through the runtimes' `pyreonNumberString` (ECMAScript `Number::toString`) and the new `pyreonToFixed` (the web's rounding of the exact value). A whole literal at or past 1e21 (`1e21 + x`) no longer emits the invalid `1e+21.0`.
