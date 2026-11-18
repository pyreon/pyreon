---
'@pyreon/validation': patch
---

Native schema parse: an `s.number().int()` (or `z.number().int()`) field accepts a whole number stored as a Double (`3.0`) and, on Android, a platform `Int`, as the web does. A fractional, non-finite or out-of-range value is still rejected. A bare `number()` field stays a `Double`.
