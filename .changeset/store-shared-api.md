---
'@pyreon/store': minor
---

Setup stores are now instances of an internal class instead of one large closure. The store's internal helpers are shared prototype methods instead of ~10 fresh closures per store. Measured: creating a store is ~15% faster (`bench:stores` setup 640–660 → 520–580 ns) and each store retains 42% less heap (3,129 → 1,819 B). An action call is ~1 ns slower (reads its listener set off the instance). The gzipped bundle grows ~220 B (3.26 → 3.48 KB): a minifier renames closure variables but not property names.

**Breaking:** the object a store hook returns is no longer a plain object, and code that treats it as one sees a different shape.

- `{ ...api }` (and `Object.assign({}, api)`) no longer contains `state` — `state` is now a getter on the prototype, which a spread does not copy. Read `api.state` instead (it was already a one-time snapshot when spread).
- `Object.keys(api)`, `Object.entries(api)`, a spread, and `JSON.stringify(api)` now also include the store's internal bookkeeping fields (`_scope`, `_raw`, `_signalKeys`, `_subscribers`, …), and `JSON.stringify(api)` no longer includes `state`. These fields are not public API — do not read or write them, and do not enumerate the store object. To serialize a store, use `JSON.stringify(api.state)`; to get the public surface, name it explicitly (`const { store, id, patch, subscribe, onAction, reset, dispose } = api`).

`patch` / `subscribe` / `onAction` / `reset` / `dispose` are still own properties bound to their store, so destructuring them, passing them detached (`onClick={api.reset}`) and spreading them all keep working.
