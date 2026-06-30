---
"@pyreon/reactivity": patch
---

Reactivity perf-cleanup pass (deep-audit follow-up; every claim measured under `NODE_ENV=production`):

- **`createStore` read-path speedups.** `wrap()` now checks the proxy cache before the 8 `instanceof` builtin checks + the `markRaw` symbol lookup (the cache hit is the dominant path — the `get` trap re-`wrap()`s every nested object on every read), and `getOrCreateSignal` does one `Map.get` instead of `has`+`get`. Measured: flat property read ~24.6 → 15.4 ns (−37%), deep nested read ~73 → 63 ns (−14%). Benefits every `createStore`/`shallowReactive`/`reconcile` consumer.
- **Removed dead `effectDeps` WeakMap.** `trackSubscriber`'s WeakMap fallback branch was unreachable (every tracking path sets a deps collector before `activeEffect` goes live), so it never wrote the WeakMap and `cleanupEffect` always no-op'd. Removed the WeakMap, the dead branch, and `cleanupEffect`. −14 bytes off the `@pyreon/reactivity` minimal-import bundle, zero runtime change (it was dead code).

No public API or behavior change.
