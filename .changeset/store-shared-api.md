---
'@pyreon/store': patch
---

Setup stores are now instances of an internal class instead of one large closure. The store's internal helpers are shared prototype methods instead of ~10 fresh closures per store. Measured: creating a store is ~15% faster (`bench:stores` setup 640–660 → 520–580 ns) and each store retains 42% less heap (3,129 → 1,819 B). `patch` / `subscribe` / `onAction` / `reset` / `dispose` remain own properties bound to their store, so destructuring, detached use and `{ ...api }` keep working. One visible difference: `state` is now a getter on the prototype, so `{ ...api }` no longer copies a `state` snapshot; read `api.state` instead. An action call is ~1 ns slower (reads its listener set off the instance). The gzipped bundle grows ~220 B (3.26 → 3.48 KB): a minifier renames closure variables but not property names.
