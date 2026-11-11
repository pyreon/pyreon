---
'@pyreon/router': minor
---

`useTypedSearchParams`: `set()` now changes only the params it is given. It used to rebuild the query from the schema alone, so `set({ page: 2 })` at `?page=1&utm=a` dropped `utm` (and wrote `q=` / `flag=false` for absent schema keys); an `undefined` value now removes a key. A `'number'` param that is absent or not a number now reads `undefined` instead of `0`, so its type is `number | undefined` (default it with `?? 1`). Both `set()`s (`useSearchParams` too) keep the URL hash.
