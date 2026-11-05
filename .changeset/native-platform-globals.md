---
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

JavaScript globals in native code now either lower correctly or are named, instead of compiling with no warning and failing the native build.

- `parseInt`, `parseFloat` and `Number(text)` follow the web's rules on both targets, through new runtime functions `pyreonParseInt`, `pyreonParseFloat` and `pyreonToNumber`. A valid prefix now parses: `parseInt("3.5")` is 3 and `parseFloat("12px")` is 12 (both were 0 natively). `Number` trims whitespace and reads `""` as 0. A failed `parseFloat` or `Number` is `NaN`, as on the web (it was 0), and Swift prints it as `NaN`.
- `isNaN(parseInt(text))` checks whether the parse failed. A native integer cannot be NaN, so a NaN test on an integer variable now warns.
- `Number.isNaN`, `Number.isFinite`, `Number.parseInt`, `Number.parseFloat` and `isFinite` lower.
- `a.localeCompare(b)` and `crypto.randomUUID()` lower.
- `console.info`, `debug`, `warn` and `error` lower. On Kotlin, a `console.log` call with several arguments now compiles.
- Any other browser global (`setTimeout`, `fetch`, `Promise`, `localStorage`, `window`, …) or JavaScript-only method (`toISOString`, `toPrecision`, …) that reaches the emitted Swift or Kotlin is now named in a warning that says what to use instead.
