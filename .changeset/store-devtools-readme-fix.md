---
'@pyreon/store': patch
---

docs: fix the broken devtools example in the README. It imported a
non-existent `storeRegistry` symbol (`import { storeRegistry } from
'@pyreon/store/devtools'`) — the actual `@pyreon/store/devtools` API is
`getRegisteredStores()` / `getStoreById(id)` / `onStoreChange(listener)`.
The documented snippet threw `undefined is not iterable`; corrected to the
real API. No runtime change.
