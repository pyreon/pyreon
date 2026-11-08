---
'@pyreon/reactivity': patch
'@pyreon/flow': patch
---

A disposed `computed` no longer re-subscribes to its sources when it is read.

Reading a computed that a write had marked dirty, after `dispose()` and before anything pulled it, re-ran it and put it back on every source's subscriber list for the source's lifetime. It never ran again, so it was a leak plus a dead call on every write. The typical trigger is a batched write and a dispose in the same `batch`, followed by a late read from an already-queued update. A disposed computed now returns its last value. One disposed before its first read evaluates once, untracked. `@pyreon/flow` dropped its local workaround for this.
