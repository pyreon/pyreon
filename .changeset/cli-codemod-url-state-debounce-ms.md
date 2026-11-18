---
'@pyreon/cli': patch
---

`pyreon upgrade` gains the `url-state-debounce-ms` codemod: it renames the removed `useUrlState` option `debounce` to `debounceMs` (same value) in the options literal of calls imported from `@pyreon/url-state`.
