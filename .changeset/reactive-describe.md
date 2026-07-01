---
'@pyreon/reactivity': minor
---

feat(reactivity): describeReactiveGraph — auto-generated behavioral docs from the reactive graph

No framework auto-generates *behavioral* (not API) docs from the reactive graph. Pyreon can — `describeReactiveGraph()` turns the live dependency graph into an English summary of what each change actually *does*, plus health insights only the graph shape can surface.

```text
Reactive graph — 3 signals · 1 derived · 1 effect · 3 edges

Signals:
  qty            changing it re-derives 1 value and runs 1 effect
  unitPrice      changing it re-derives 1 value and runs 1 effect
  shippingFlat   nothing reacts to it (no dependents)
Derived:
  total          recomputes when qty, unitPrice change
Effects:
  effect#5       runs when total changes

Insights (1):
  ⚠ orphan-signal nothing depends on `shippingFlat` — dead reactivity or an unused signal
```

`describeReactiveGraph(graph?)` returns `{ summary, nodes, insights }` — each `nodes[]` entry has an English `behavior` one-liner, and `insights` flag behavioral smells: `orphan-signal` (nothing depends on it), `high-fanout` (a change re-runs many effects — a hot signal), `deep-chain` (end of a long dependency chain). `formatGraphDescription(desc)` renders the block above. Pure over `getReactiveGraph()`; dev/test only (tree-shaken in production). Pairs with `getUpdateCause` — this describes the whole graph, that explains one update.
