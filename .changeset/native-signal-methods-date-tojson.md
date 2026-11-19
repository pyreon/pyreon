---
'@pyreon/native-compiler': patch
---

Signal-object methods and the remaining `Date` methods no longer compile silently to native code that does not build.

- `theme.remove()` on a storage signal, and `.subscribe(fn)`, `.direct(fn)`, `.trigger()`, `.debug()` and a computed's `.dispose()`, called on the signal itself, are now named warnings on iOS and Android. Natively a signal is a plain property holding the value, so these were emitted verbatim against a `String` / `Int` with zero warnings. The warning says what to write instead.
- `d.toJSON()` now lowers to the same ISO string as `d.toISOString()`, and `d.valueOf()` to the value itself. Both were emitted verbatim against a `Double`. An invalid date reads `Invalid Date` where the web's `toJSON()` returns `null`.
- A `Date.prototype.…` (or any `X.prototype`) that reaches the output, and the Date setters `setTime`, `setMilliseconds`, `setUTC…`, `setYear`, plus `getYear` and `toGMTString`, are now named warnings.
