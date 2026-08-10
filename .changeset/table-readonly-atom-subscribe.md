---
'@pyreon/table': patch
---

Fix a readonly atom never notifying when subscribed before its first read.

The v9 reactivity bindings back `ReadonlyAtom` with a Pyreon `computed`, which
is LAZY — it subscribes to its dependencies only once evaluated. Attaching a
direct subscriber to a computed nobody had read yet therefore attached to a node
with no upstream edges, and the subscriber never fired. `subscribe` now primes
the computed with one `untrack`ed read before attaching, so the dependency graph
exists first.

The mounted table hid this because rendering reads the row models before
anything subscribes; it surfaces when core or a consumer subscribes to a derived
atom it has not read. The failure was silent — no error, just an atom that never
updates.
