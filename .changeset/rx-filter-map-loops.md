---
'@pyreon/rx': patch
---

`filter` and `map` run their own loops instead of `Array.prototype.filter` / `map`. On JavaScriptCore the callback could not be specialized through the builtin, so both were ~1.5–1.9× slower than writing the same `computed` by hand. They are now at or ahead of it (1,000 rows: filter 3.6 → 2.1 µs, map 2.7 → 1.4 µs). Behaviour is unchanged: the callback still gets the index and the array, and holes in sparse arrays are skipped (`filter`) or kept (`map`).
