---
title: "3. Side effects"
description: "Tutorial chapter 3 — effect() runs a side effect when its tracked signals change. Use it to sync with the outside world."
---

# 3. Side effects — `effect`

`computed` derives *values*. When you need to do something with the outside world when a signal changes — log, sync to storage, call an API — use `effect`. It runs once immediately, then re-runs whenever a signal it read changes.

```tsx
import { signal, effect, onCleanup } from '@pyreon/reactivity'

const query = signal('')

effect(() => {
  console.log('searching for', query()) // re-runs on every query change
})

// effects can clean up after themselves:
effect(() => {
  const id = setInterval(tick, 1000)
  onCleanup(() => clearInterval(id))     // runs before the next run + on dispose
})
```

Watch the effect fire as the signal changes:

<Example file="./examples/reactivity/effects-side-effects-on-signal-change" />

**The key idea:** an effect *subscribes to whatever it reads*. Read `query()` inside it and it re-runs when `query` changes — no dependency array to maintain (unlike React's `useEffect`).

> `effect` is for reactive *subscriptions* (read signals → do a side effect). Don't kick off one-time imperative work (a fetch on mount, attaching a listener) in an `effect` at component setup — that belongs in `onMount`. The `no-imperative-effect-on-create` lint rule flags it.

---

**[← Derived values](/docs/tutorial/02-derived)** · **[Next: Components →](/docs/tutorial/04-components)**
