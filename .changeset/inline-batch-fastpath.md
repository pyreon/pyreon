---
'@pyreon/reactivity': patch
---

5× faster effect propagation: unbatched signal writes now dispatch their notifications directly through an inline batch window instead of allocating a closure + round-tripping every callback through the pending queues. Single-subscriber notify drops from ~131ns to ~16ns; set→effect rerun from ~162ns to ~46ns. Semantics are unchanged by construction — cascades, diamond dedup, two-tier ordering, and multi-pass re-fire all drain through the same shared flush machinery (locked by 7 new parity specs + the existing property-based batch fuzz).
