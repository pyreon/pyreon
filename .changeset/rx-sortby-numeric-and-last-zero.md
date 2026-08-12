---
"@pyreon/rx": patch
---

fix(rx): `sortBy` with a string key sorts numeric fields numerically (was lexicographic); `last(x, 0)` returns `[]`

Two collection-op correctness fixes:

- **`sortBy(items, 'field')`** resolved the key through the shared `resolveKey`, which `String()`-coerces, then compared the stringified keys directly — so a numeric field sorted lexicographically: `sortBy(products, 'price')` on `[2, 10, 1, 9]` returned `[1, 10, 2, 9]` instead of `[1, 2, 9, 10]`. `sortBy` now compares the RAW `item[key]` value (a number stays a number); the function-key form was already correct. `resolveKey` stays coercive for `groupBy`/`keyBy`/`countBy`/`uniqBy`, which genuinely want string record keys. Single-digit test fixtures masked this (lexicographic == numeric order for single digits).
- **`last(items, 0)`** returned the whole array — `slice(-0)` === `slice(0)`. It now returns `[]`.

Both bisect-verified with multi-digit / zero fixtures.
