---
title: "1. Signals"
description: "Tutorial chapter 1 — signals are Pyreon's reactive state. Create one, read it, write it, and watch the DOM update with no re-render."
---

# 1. Signals — reactive state

A **signal** is a reactive value. It's a callable: call it to read, use `.set` to write. When you write, every place that read it updates — automatically, with no component re-render.

```tsx
import { signal } from '@pyreon/reactivity'

const count = signal(0)   // create
count()                   // read  → 0
count.set(1)              // write → 1
count.update((c) => c + 1) // update from previous → 2
```

Read the signal inside JSX and it becomes live. Click the button below — the displayed value patches in place:

<Example file="./examples/reactivity/signals-read-write-react" />

**The key idea:** you didn't tell anything to re-render. You read `count()` in the markup, so Pyreon wired that one spot to the signal. A write updates exactly that spot — nothing else runs.

> Write with `.set()` / `.update()`, never `count(1)` — calling a signal with an argument reads and ignores it (dev mode warns).

---

**[← Quickstart](/docs/quickstart)** · **[Next: Derived values →](/docs/tutorial/02-derived)**
