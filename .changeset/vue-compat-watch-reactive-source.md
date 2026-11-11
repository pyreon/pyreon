---
'@pyreon/vue-compat': patch
---

`watch(reactiveObject, cb)` now works, and `watch`'s `deep: true` option is honoured.

Passing a `reactive()` object to `watch` (Vue's most common form) threw "getter is not a function" inside the watcher's effect, so the callback never fired; a `reactive([])` source was also mistaken for a list of sources. A `reactive()` source is now watched deeply, as in Vue, and `deep: true` tracks every nested property of the reactive value a ref or getter returns. An invalid source now warns instead of failing silently.
