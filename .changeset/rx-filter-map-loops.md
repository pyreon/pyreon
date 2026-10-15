---
'@pyreon/rx': patch
---

`filter`, `map`, `find`, `reduce`, `every`, `some`, `sum` and `average` run their own loops instead of the matching `Array.prototype` methods. On JavaScriptCore the callback could not be specialized through the builtin, so `filter` and `map` were ~1.5–1.9× slower than writing the same `computed` by hand. They are now at or ahead of it (1,000 rows: filter 3.6 → 2.2 µs, map 2.7 → 1.5 µs, sum 2.2 → 0.86 µs). Behaviour is unchanged: the callback still gets the index and the array, and holes in sparse arrays are handled as each builtin does (skipped by `filter`, `reduce`, `every`, `some`, `sum`, `average`; kept by `map`; visited as `undefined` by `find`).
