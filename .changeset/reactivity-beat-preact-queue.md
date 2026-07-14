---
"@pyreon/reactivity": patch
---

perf(reactivity): array+flag effect queue + lazy-computed inline propagation — flips wide fan-out & batch-50 vs Preact, ~2× diamond / ~1.5× chain

Three changes to the batch/notify hot paths, benchmarked against `@preact/signals-core` (`NODE_ENV=production`, median of clean runs on Apple M3 Max / Bun):

- **Array+flag effect queue** (`batch.ts`). The tier-2 effect drain was two `Set`s (`pendingEffects`, `_nextEffectPass`) + a scratch visited `Set`. Set hashing on function-object keys dominated the wide-fan-out path; a structurally-faithful micro-bench measured the enqueue+drain of 100 effect closures at **~8×** with an array + a per-effect tri-state membership flag (`_eq`) + a monotonic pass-GENERATION counter (`_vg`) instead. Within-pass dedup is `_eq === Cur`; cross-pass re-fire (ErrorBoundary's self-dispatch) routes an already-ran effect (`_vg === _passGen`) to a `nextEffects` array; the O(1) `_passGen++` replaces the Set's per-pass `.clear()`. This is the array-of-closures analogue of Preact's intrusive-linked-list + NOTIFIED-bitflag batching. Flag fields are created **lazily** the first time an effect is enqueued, so an effect that never re-fires stays a bare closure and retained heap is **neutral** (+effect stays 929 B).
- **Lazy-computed inline dirty-propagation** (`batch.ts` + `computed.ts`). A default (lazy) computed's `recompute` is dirty-mark-only and idempotent (guarded by its `_dirty` flag), so it now propagates INLINE during the write's notify phase — a Preact-style write-time DFS — instead of routing through the pending-recompute queue. A pure-computed cascade (a diamond `a→{b,c}→d`, a deep chain) settles entirely during notify and never enters `drainQueues`. Eager (`{ equals }`) computeds still settle in the tier-1 queue before any effect fires (deep-cascade correctness unchanged).
- **Signal no-subscriber write fast path** (`signal.ts`). `set`/`trigger` skip the inline-batch window (open/close + try/finally) entirely when the signal has zero subscribers — the dominant shape for write-only imperative state and a just-created signal.

Measured deltas vs Preact:

| micro-bench | before | after |
| --- | --- | --- |
| wide fan-out (1→100 effects) | Preact ~2.75× ahead | **Pyreon ~1.03× (flipped; ~2.8× absolute speedup)** |
| batch 50 signals | ~tied / Preact ~1.2× | **Pyreon ~1.06×** |
| effect propagation | Pyreon ~1.3× | Pyreon ~1.25× (kept) |
| computed diamond | Preact ~2.7× ahead | Preact ~1.4× (halved) |
| deep chain (depth 50) | Preact ~2.0× ahead | Preact ~1.5× |
| signal create+read+write | Preact ~1.4× | Preact ~1.4× (unchanged) |

Behaviour is unchanged: all 703 reactivity tests pass (two-tier flush ordering, diamond/cascade dedup, re-entrant self-writes, MAX_PASSES cap, verify-mode dep reuse, single-subscriber slot, effectScope disposal, computed equals-gating), plus `@pyreon/core` (598) and `@pyreon/runtime-dom` (953) downstream. Retained heap neutral on all four primitives. Deep lazy-computed cascades are now recursive on write; verified correct + non-overflowing up to depth 10,000.
