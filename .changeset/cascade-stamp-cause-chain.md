---
'@pyreon/reactivity': patch
---

`getUpdateCause` reconstructs the causal chain by CASCADE STAMP instead of a 16ms wall-clock cluster window. Each recorded fire now carries a synchronous-cascade sequence number (a signal fire opens a cascade; derived/effect fires inherit it), so "same cascade" membership is exact regardless of how long the cascade took — previously a GC pause or a loaded machine stretching one `set → recompute → effect` cascade past 16ms silently dropped the root signal from the reconstructed chain. `ReactiveFire` gains a `cascade: number` field (additive).
