---
'@pyreon/charts': minor
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

`date(pattern)` formats epoch milliseconds for a time axis, a tooltip or a table: `<Axis x time format={date('MMM YYYY')} />`. It formats in UTC, so labels never shift with the reader's timezone, and prints the same on the web, iOS and Android. Tokens: `YYYY` `YY` `MMMM` `MMM` `MM` `M` `DD` `D` `HH` `H` `mm` `ss`; `[text]` is printed as written. `formatDate(ms, pattern)` is the one-shot form.

Numbers now print the same on iOS and Android as on the web:

- A template literal or a `<Text>` child holding a whole-valued `Double` printed `7.0` on both native targets where the web prints `7`. The generated chart engine goes through the same path: on iOS, axis ticks read `20.0` and percentage labels `42.0%`; on both targets, calendar year labels read `2024.0`. Such values now go through a JavaScript-faithful `pyreonNumberString`.
- A numeric `x` field used as categories (`<Chart x="year">`) did not compile on iOS. Such values are now converted to strings.
- An integer literal outside the 32-bit range, such as an epoch-millisecond timestamp in fixture data, typed its field `Int` and failed to compile on Android. It is now a `Double`, like every other JavaScript number that cannot fit.
