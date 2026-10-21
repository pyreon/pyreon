---
'@pyreon/rx': patch
---

`find`, `reduce`, `every`, `some`, `sum` and `average` run their own loops instead of the matching `Array.prototype` methods, as `filter` and `map` already do. `sum` over 1,000 rows goes from 2.2 to 0.86 µs, ahead of a native `reduce`. Callbacks still get the index and the array, and holes in sparse arrays behave as each builtin's do (`find` visits them as `undefined`; the others skip them).
