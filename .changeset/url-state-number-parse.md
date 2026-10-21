---
'@pyreon/url-state': patch
---

Number params parse about 40% faster. A short all-digit value (`?page=2`, `?id=12345`) is now summed directly instead of going through `trim()` and string-to-number conversion; any other value takes the existing path, and the result is identical in every case.
