---
"@pyreon/reactivity": patch
"@pyreon/store": patch
---

perf(store): faster with-subscriber `patch()` + write→notify path

The with-subscriber bulk `patch()` no longer round-trips every field write
through the reactivity batch queue. When a store has subscribers, `patch()`
now suspends each patched field's internal change-detector for the duration of
its own write (via two new internal `@pyreon/reactivity` helpers,
`_suspendSubscriber` / `_resumeSubscriber`), writes the fields in one batch,
then emits a single mutation built directly from the values it wrote — user
computeds/effects reading those fields still recompute exactly once. A
re-entrant effect that writes another store field during the drain is still
merged into the same single notification.

Measured (Apple M3 Max, `NODE_ENV=production`, pooled median ns/op vs
`zustand/vanilla`): with-subscriber `patch 2 fields` ~198→~140ns (2.3× →
~1.7× vs Zustand — a ~29% cut, though still short of Zustand's native
single-object merge); `write → 1 subscriber` ~41→~36ns via caching field
signals in a dense array (removes a per-notify dynamic `raw[key]` lookup). The
no-subscriber `patch` fast path and the per-field `store.x.set()` hot path are
unchanged. Reproduce: `cd packages/fundamentals/store && bun run bench:stores`.
