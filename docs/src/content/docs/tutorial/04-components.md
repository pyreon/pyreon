---
title: "4. Components run once"
description: "Tutorial chapter 4 — the one rule that explains all of Pyreon: components run ONCE, and reactivity depends on WHERE you read a signal."
---

# 4. Components run once

This is the single most important idea in Pyreon. **A component function runs exactly once** — on mount. It is not re-invoked when state changes. So what makes the UI update?

> Reactivity depends on **where** you read a signal. A signal read inside a JSX expression (or an `effect` / `computed`) is wired to that spot; a write updates only that spot. The component body itself never re-runs.

```tsx
function Counter() {
  const count = signal(0)
  console.log('this logs ONCE, ever')        // body runs once
  return (
    <button onClick={() => count.update((c) => c + 1)}>
      {() => count()}   {/* this thunk re-runs on every change */}
    </button>
  )
}
```

The example below proves it — the body logs once, but the reactive thunk re-runs on each click:

<Example file="./examples/core/component-body-runs-once-only-thunks-re-run" />

**The key idea:** because the body runs once, two things follow that trip up newcomers:

- **Read `props.x` *in* the reactive scope**, not at the top. `const { x } = props` (or `const v = props.x`) captures the value once and never updates. Read `props.x` inside the JSX/effect, or use `splitProps`.
- **Pass props as expressions.** `<Child value={count()} />` is reactive (the compiler wraps it); destructuring on the way in freezes it.

This is the opposite of React's model (where the function re-runs every render). Once it clicks, everything else in Pyreon follows from it.

---

**[← Side effects](/docs/tutorial/03-effects)** · **[Next: Lists & conditionals →](/docs/tutorial/05-lists-and-conditionals)**
