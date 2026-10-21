---
'@pyreon/reactivity': patch
---

`effect()` now creates its batch-queue flags when the effect is created instead of on first enqueue. V8 runs queued effects measurably faster that way: one signal driving 100 effects goes from ~2,210 to ~1,900 ns per write, and a 50-signal batch from ~637 to ~592 ns. An effect that is never queued costs about 40 bytes more.
