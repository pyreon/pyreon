---
title: Why signals?
description: Fine-grained reactivity updates exactly what changed — no virtual DOM, no re-renders, no dependency arrays.
date: 2026-04-21
tags: [pyreon, signals]
---

A Pyreon component runs **once**. When state changes, the framework does not call the component again and diff the result; the signal that changed updates the one text node or attribute that reads it.

```tsx
import { signal } from "@pyreon/reactivity"

function Counter() {
  const count = signal(0)
  return <button onClick={() => count.update((n) => n + 1)}>{count()}</button>
}
```

Clicking the button writes one signal. The text node bound to `count()` changes. Nothing else runs.

## What that buys you

- No dependency arrays and no memoisation: the body runs once, so nothing needs to be kept stable.
- Updates cost what changed, not the size of the component tree.
- The same model on the server: a page renders once to HTML, then hydrates.

Read the [reactivity guide](https://pyreon.dev/docs/reactivity) for the rules of what stays reactive.
