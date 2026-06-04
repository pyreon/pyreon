---
"@pyreon/reactivity": patch
---

perf(computed): ~45% smaller retained heap per computed via a prototype + plain-field shape

`computed` and `computed(fn, { equals })` now store their state as plain fields
on the read function and share `direct` + the `_v` getter via a single
`ComputedProto` (mirroring `signal`'s `SignalProto`), instead of per-instance
method closures plus three `Object.defineProperty` accessor getters
(`_v`/`_d`/`_d1`). The accessor getters forced the function into V8 dictionary
(slow-properties) mode; a structurally-faithful A/B (node `--expose-gc`,
`NODE_ENV=production`, 100k items) measured the new shape at ~45% less retained
heap per computed (lazy 1649→913 B, equals 1712→976 B, signal-inclusive).

Behavior-identical and API-unchanged: 608 reactivity tests pass plus the
runtime-dom / core / router / rx / store consumer suites; recompute and diamond
throughput are at parity (within microbenchmark noise). `read` and `recompute`
remain per-instance closures (their identity is stored in dependency subscriber
Sets). `_d1`/`_d` are now plain data fields rather than accessor getters — code
that reads them does so with identical syntax.
