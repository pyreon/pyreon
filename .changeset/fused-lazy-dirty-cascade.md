---
'@pyreon/reactivity': patch
---

perf(reactivity): fused iterative dirty-cascade walk + leaner tracking frame — computed diamond now a near-tie with @preact/signals-core (~1.07–1.10×, was ~1.3×), deep chain ~1.25× (was ~1.45×), heap-neutral

- `propagateLazyDirty` walks single-subscriber lazy-computed chains ITERATIVELY over the computed's fields via a `notify._c` back-ref stamped by `_markRecompute(fn, target)` — per hop this removes the notify-closure call, the `_recomputes` WeakSet lookup, and the depth bookkeeping, and consumes zero JS stack at any chain depth (only fan-out levels recurse, still depth-bounded via `MAX_CASCADE_RECURSION` + the explicit deferral stack).
- The lazy notify body now lives ONCE in `batch.ts` (`_markLazyAndPropagate`); `computedLazy`'s per-instance recompute closure delegates to it (the closure remains only for its subscriber-set identity), and marked dispatch sites (`enqueuePendingNotification`'s recompute-hit branch, the fan-out arm) call it directly when the `_c` back-ref is present. `{ equals }` notifies are deliberately NOT stamped — they do more than dirty-marking (tier-1 refresh booking) and keep the call path.
- `tracking.ts`: the former `_verifyOwner` module variable was a pure mode flag (its value was never read) — verify-mode is now encoded in the SIGN of `_verifyIndex` (-1 = collect), dropping one module-var read from every tracked read's verify hit and one save/restore pair from every `runCollect`/`runVerify` frame.

Effect-path dispatch is untouched (effects never enter the recompute-hit branch; the fan-out arm checks the WeakSet before reading `_c`, so effect notifies pay only the same WeakSet miss as before). Won metrics re-verified: effect propagation ~1.4× ahead of Preact, batch-50 ~1.2× ahead, wide fan-out slight win — all held. Retained heap byte-identical (signal 152 B / +computed 913 B / +effect 929 B via `measure-memory`).
