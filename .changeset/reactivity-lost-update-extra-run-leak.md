---
'@pyreon/reactivity': patch
---

Fix three effect-scheduling bugs found by the new differential fuzz:

- An effect could miss its last update: when an effect wrote a signal during a flush and that re-dirtied a computed another effect had already read in the same pass, the reader was queued for a pass that never ran and kept the old value.
- An effect that started reading a computed which had changed while nobody observed it ran twice for one change (and twice at creation).
- An effect that wrote a signal it read during its first run lost the inner effects and cleanups of the nested re-run, which then could not be disposed, not even by stopping the scope. `onCleanup` callbacks registered before an effect run throws now also run instead of being dropped.
