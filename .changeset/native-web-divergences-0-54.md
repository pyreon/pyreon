---
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
---

Five web↔native divergences in PMTC output, each now matching the web:

- A string `.length` inside an array callback (`names.map((n) => n.length)`) is a `Long` on Kotlin. The callback parameter was untyped, so the emit produced a `List<Int>` where a `List<Long>` is expected, which did not compile.
- A helper parameter typed `number` takes the storage its callers prove. `fmt(price())`, with a Double `price`, emitted `fmt(_ n: Int)` and did not compile on either target. A `number` return is re-inferred over the widened parameter.
- `throw 'plain'` followed by `String(e)` (or `` `${e}` ``) reads `plain`, not `Error: plain`.
- An array-destructured element that the code tests for absence (`const [first] = xs; first ?? 'none'`) reads nil-safely instead of trapping on an empty array.
- Swift `slice`, `substring`, `charAt`, `indexOf`, the positioned `includes`, `startsWith` and `endsWith`, and `padStart`/`padEnd` count UTF-16 units, as `.length` and the web do. They previously counted Characters. `charAt` out of range returns `""` on both targets instead of trapping.

Also fixed: a concise Kotlin helper whose returned text contained `=` (`'v=' + String(n)`) lost its `return` and failed with "missing return statement".
