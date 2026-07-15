---
"@pyreon/reactivity": patch
---

perf(reactivity): cheaper lazy-computed dirty cascade (`propagateLazyDirty`) — narrows diamond/deep-chain vs Preact

A default (lazy) computed's `recompute` is dirty-mark-only, so a pure-computed
cascade (a diamond `a→{b,c}→d`, a deep chain) is nothing but dirty-flag
propagation from one lazy recompute to the next. Previously that walked
`notifySubscribers → enqueuePendingNotification`, paying **two `WeakSet.has`
lookups + two function calls per hop** to route each subscriber (the batch
router can't assume a computed's subscriber is another lazy computed).

`propagateLazyDirty` (`batch.ts`) runs a lazy-recompute subscriber INLINE via a
single `_lazyRecomputes.has` — byte-identical behavior to what
`enqueuePendingNotification` gives a lazy recompute, minus the effect-path
routing it doesn't need. Non-lazy subscribers (effects, eager `{ equals }`
computeds, raw `subscribe()` listeners) still fall through to
`enqueuePendingNotification`, so their queueing is unchanged. Called ONLY from
computed `recompute` (never from `_set`'s signal fan-out path), so the
wide-fan-out / batch-50 / effect-propagation hot paths are untouched.

- **Diamond** narrowed ~1.37× → ~1.29× Preact-ahead; **deep chain (depth 50)**
  ~1.73× → ~1.45× Preact-ahead (measured, Bun/JSC; ratios portable, absolutes
  machine-dependent). Bisect-verified: reverting the helper regresses both back
  toward baseline.
- **Heap-neutral** — no new per-primitive fields (signal 152 B, +computed 913 B,
  +effect 929 B, unchanged). All previously-won metrics hold (effect
  propagation ~1.36× ahead, batch-50 ~1.10× ahead, wide fan-out ~1.03× ahead).
- Corrects a stale residual diagnosis: a split write/read profile puts the
  ENTIRE diamond/chain gap in the WRITE phase (Pyreon's `runVerify` re-eval is
  ≈ or faster than Preact's version-refresh). The residual is Pyreon's eager
  PUSH dirty-marking — a signal write dirty-marks the whole downstream computed
  subgraph — vs Preact's lazy PULL model, which skips that work for an
  UNOBSERVED computed chain. Fully closing it needs a per-primitive version
  model, a retained-heap regression left unshipped.
