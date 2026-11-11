---
'@pyreon/vue-compat': minor
---

`reactive()` and `watch()` now behave like Vue in four more places.

- A ref stored in a `reactive()` property is unwrapped: `reactive({ count })` reads `state.count` as a number, and `state.count = 5` writes `count.value`. It used to return the ref object. Array elements keep their refs, as in Vue. The return type is now `UnwrapNestedRefs<T>`.
- `reactive(new Map())` and `reactive(new Set())`, at the top level or nested, are tracked. They used to be returned raw, so `map.set` notified nobody.
- `reactive(raw)` returns the same proxy for the same object, and `reactive(proxy)` returns `proxy`. Both used to create a new proxy each call.
- `watch` batches like Vue's default `flush: 'pre'`: several changes in one tick make one call with the latest value and the value before the first change, and no call if the value ends where it started. Pass `flush: 'sync'` for a call on every change.

Breaking: `watch` callbacks no longer run synchronously inside the write. Code that reads a watcher's side effect right after a write must `await nextTick()` first, or pass `flush: 'sync'`.
