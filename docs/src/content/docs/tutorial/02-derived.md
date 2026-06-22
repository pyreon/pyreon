---
title: "2. Derived values"
description: "Tutorial chapter 2 — computed() derives a value from other signals and caches it, recomputing only when a dependency changes."
---

# 2. Derived values — `computed`

When a value is computed *from* other signals, don't recompute it by hand — wrap it in `computed`. It tracks what it reads, caches the result, and recomputes only when a dependency actually changes.

```tsx
import { signal, computed } from '@pyreon/reactivity'

const first = signal('Ada')
const last = signal('Lovelace')
const full = computed(() => `${first()} ${last()}`) // re-derives when either changes

full() // 'Ada Lovelace'
```

A `computed` reads like a signal (call it: `full()`), but you never write to it — it's derived. Try it:

<Example file="./examples/reactivity/computed-derived-values" />

**The key idea:** `computed` is lazy and cached. Reading `full()` repeatedly does the work once; it only re-runs when `first` or `last` changes. Reach for it whenever you'd otherwise duplicate a derivation.

> A `computed` is roughly 10× the memory of a plain signal (it caches + tracks). Use it for real derivations, not as a fancy alias for a value you could just read.

---

**[← Signals](/docs/tutorial/01-signals)** · **[Next: Side effects →](/docs/tutorial/03-effects)**
