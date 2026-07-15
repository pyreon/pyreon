---
"@pyreon/reactivity": patch
---

fix(reactivity): defer lazy-computed direct-subscriber dispatch to the drain — restores batch() glitch-freedom + iterative deep-chain cascade

Two behavioral regressions vs 0.45.0 introduced by #2284/#2296's lazy-computed inline dirty-propagation:

- **batch() glitch-freedom for computed direct bindings.** A lazy computed's `recompute` runs inline during a write's notify phase; it also fired the computed's `_d1`/`_d` DIRECT subscriber (the compiled `{someComputed()}` `_bindText`/`_bindDirect` binding) inline, on a torn mid-batch value. A `batch(() => { a.set(); b.set() })` fired `[12, 30]` instead of one settled `[30]`, and a torn eval that threw dispatched a phantom error through the effect error handler. Fix: the recompute now MARKS dirty inline but ENQUEUES the direct subscribers to the batch drain, so they fire once with settled values — the same deferral a signal's `_d1` already gets under batch.

- **Deep-chain write-time cascade overflow → silent stale.** The inline dirty cascade was recursive; a chain deeper than ~8000 overflowed the stack, the caught RangeError cleared a computed's `_dirty` with a stale value (silent lost update). Fix: recurse inline for the common shallow case (byte-parity with #2296) and switch to an explicit stack past a bounded depth, so the live stack is bounded at any chain length (0.45.0 was correct at 10,000).

Perf held at #2296 parity (wide fan-out ~1.0×/flipped, batch-50 ~1.15× ahead, effect propagation ~1.35× ahead, diamond ~1.28× behind, deep chain ~1.48× behind); heap-neutral. Pure computed cascades still never enter the effect queue.
