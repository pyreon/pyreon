---
"@pyreon/storage": patch
---

Benchmark correction (no runtime change): the previously-documented "~1.4×
behind Zustand on the reactive-layer write" was a bench bug, not a real loss —
the bench's Pyreon cell passed a localStorage-shaped shim to `createStorage`
(which takes `StorageBackend {get,set,remove}`), so every write threw a
silently-swallowed TypeError and the row measured throw/catch machinery
(~600ns) instead of the real ~35ns write path. With the wiring fixed and the
correctness gate now asserting write-through-to-storage, `@pyreon/storage`
wins every row: write 12× / write→subscriber 9× / create 2.1× faster than
Zustand persist, 9–50× vs Jotai `atomWithStorage`, read CI-tied at the ~3ns
floor.
